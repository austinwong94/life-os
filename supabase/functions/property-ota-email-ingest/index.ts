import {propertyCallbackSecret,propertyCallbackOwner} from "../_shared/property-auth.ts";
// =============================================================================
// ota-email-ingest — receives an Airbnb booking email (forwarded by the Gmail
// Apps Script), authenticates a shared secret, parses it with the SAME parser
// verified against Austin's real email, and stores a REVIEW-REQUIRED candidate
// in public.booking_candidates. It never creates a confirmed booking itself.
//
//   POST  header  x-ingest-secret: <INGEST_SECRET>
//         body    { "subject": "...", "body": "<email plain text>" }
//   -> { ok, candidate?: {...}, deduped?: true }
//
// SECRETS (Deno.env): INGEST_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// =============================================================================

import { createClient } from "npm:@supabase/supabase-js@2.108.2";

const cors: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-ingest-secret",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

// --- parser (identical regexes to the client-verified parseAirbnbBookingEmail) ---
const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function inferDate(mon: string, day: number): string {
  const m = MONTHS[mon];
  if (!m) return "";
  const mk = (y: number) => `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const now = new Date();
  let y = now.getFullYear();
  if (new Date(`${mk(y)}T00:00:00Z`) < new Date(now.getTime() - 60 * 86400000)) y += 1;
  return mk(y);
}
function parseAirbnbEmail(text: string) {
  const t = String(text || "").replace(/\r/g, "");
  const grab = (re: RegExp) => (t.match(re) || [])[1] || "";
  const name = grab(/New booking confirmed!\s+(.+?)\s+arrives/i) || grab(/Get ready for\s+(.+?)[’']s arrival/i);
  const listing = grab(/([^\n]*(?:Sunrise|Windmill)[^\n]*)/i);
  const villa = /windmill/i.test(listing) ? "Windmill" : "Sunrise";
  const ci = t.match(/Check-?in\s+[A-Za-z]{3},\s*([A-Za-z]{3})\s+(\d{1,2})/i);
  const co = t.match(/Check-?out\s+[A-Za-z]{3},\s*([A-Za-z]{3})\s+(\d{1,2})/i);
  let arrival = ci ? inferDate(ci[1], Number(ci[2])) : "";
  if (!arrival) {
    // Fallback: the headline "…arrives Jul 3" is in every booking email (plain-text safe).
    const am = t.match(/arrives\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})/i);
    if (am) arrival = inferDate(am[1], Number(am[2]));
  }
  const checkout = co ? inferDate(co[1], Number(co[2])) : "";
  let nights = Number(grab(/x\s*(\d+)\s*night/i)) || 0;
  if (!nights && arrival && checkout) nights = Math.round((+new Date(checkout) - +new Date(arrival)) / 86400000);
  return {
    guest: name.trim(),
    villa,
    arrival,
    nights,
    guest_count: grab(/Guests\s+(\d+\s*adults?[^\n]*)/i),
    confirmation_code: grab(/Confirmation code\s+([A-Z0-9]{6,})/i),
    revenue: Number(grab(/You earn\s+RM\s*([\d,]+\.\d{2})/i).replace(/,/g, "")) || null,
    total_paid: Number(grab(/Total \(MYR\)\s+RM\s*([\d,]+\.\d{2})/i).replace(/,/g, "")) || null,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = await propertyCallbackSecret("INGEST_SECRET");
  // Constant-time comparison — a plain !== leaks timing information about how
  // many leading characters matched. Comparing SHA-256 digests gives fixed
  // length and no early exit.
  const given = req.headers.get("x-ingest-secret") ?? "";
  const enc = new TextEncoder();
  const [digestGiven, digestSecret] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(secret)),
  ]);
  const va = new Uint8Array(digestGiven);
  const vb = new Uint8Array(digestSecret);
  let mismatch = 0;
  for (let i = 0; i < va.length; i++) mismatch |= va[i] ^ vb[i];
  if (!secret || mismatch !== 0) return json({ error: "unauthorized" }, 401);

  const propertyOwner=await propertyCallbackOwner();
  if(!propertyOwner)return json({error:'migration_not_activated'},409);
  let payload: { subject?: string; body?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const emailText = `${payload.subject ?? ""}\n${payload.body ?? ""}`;
  const parsed = parseAirbnbEmail(emailText);
  if (!parsed.guest && !parsed.arrival) return json({ ok: true, ignored: "not a booking email" });

  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  // Dedupe by confirmation code (Airbnb resends/edits the same booking).
  if (parsed.confirmation_code) {
    const { data: existing } = await db
      .from("property_booking_candidates")
      .select("id")
      .eq("user_id", propertyOwner).eq("confirmation_code", parsed.confirmation_code)
      .maybeSingle();
    if (existing) return json({ ok: true, deduped: true });
  }

  const { error } = await db.from("property_booking_candidates").insert({
    user_id: propertyOwner,
    source: "airbnb_email",
    status: "new",
    guest: parsed.guest,
    villa: parsed.villa,
    arrival: parsed.arrival || null,
    nights: parsed.nights || null,
    revenue: parsed.revenue,
    confirmation_code: parsed.confirmation_code || null,
    guest_count: parsed.guest_count || null,
    raw: parsed,
  });
  if (error) return json({ error: "insert_failed", detail: error.message }, 500);
  return json({ ok: true, candidate: parsed });
});
