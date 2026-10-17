import {propertyCallbackSecret,propertyCallbackOwner} from "../_shared/property-auth.ts";
// =============================================================================
// ical-cron-sync — RUNG 4: server-side hourly Airbnb/Booking.com calendar sync.
// Called by pg_cron (x-cron-secret, no JWT — deploy with --no-verify-jwt).
// READS each user's iCal sources from the app_data blob (read-only — never
// writes the blob, which would race the client's debounced save) and refreshes
// the additive public.ical_blocks side table. The client merges that table on
// load, so the calendar is fresh even if the app was closed for days.
// SECRETS (Deno.env): ICAL_CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// =============================================================================

import { parseIcs, isOwnExportUid } from "../_shared/ics.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

const ALLOWED_HOSTS = ["airbnb.com", "booking.com", "admin.booking.com"];
const ALLOWED_HOST_SUFFIXES = [".airbnb.com", ".booking.com"];
const MAX_ICS_BYTES = 1_000_000;

function hostAllowed(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  return ALLOWED_HOSTS.includes(h) || ALLOWED_HOST_SUFFIXES.some((s) => h.endsWith(s));
}

async function fetchIcs(feedUrl: string): Promise<string> {
  const u = new URL(feedUrl);
  if (u.protocol !== "https:") throw new Error("not_https");
  if (!hostAllowed(u)) throw new Error("host_not_allowed");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(u.toString(), { signal: ctrl.signal, redirect: "error" });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`http_${res.status}`);
  const body = await res.text();
  if (body.length > MAX_ICS_BYTES) throw new Error("too_large");
  return body;
}

async function secretOk(req: Request): Promise<boolean> {
  const secret = await propertyCallbackSecret("ICAL_CRON_SECRET");
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!secret) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(secret)),
  ]);
  const va = new Uint8Array(a), vb = new Uint8Array(b);
  let mismatch = 0;
  for (let i = 0; i < va.length; i++) mismatch |= va[i] ^ vb[i];
  return mismatch === 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await secretOk(req))) return json({ error: "unauthorized" }, 401);

  const propertyOwner=await propertyCallbackOwner();
  if(!propertyOwner)return json({error:'migration_not_activated'},409);
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const H = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

  // Read every user's blob (1 user in practice) — READ ONLY.
  const rowsRes = await fetch(`${base}/rest/v1/property_workspaces?select=user_id,data&data_type=eq.full_app_backup&record_key=eq.sunrise-villa-main&user_id=eq.${propertyOwner}`, { headers: H });
  if (!rowsRes.ok) return json({ error: "db_read_failed", status: rowsRes.status }, 502);
  const rows = await rowsRes.json() as Array<{ user_id: string; data: Record<string, unknown> }>;

  const report: Record<string, unknown>[] = [];
  for (const row of rows) {
    const ical = ((row.data as { appSettings?: { ical?: { sources?: Array<{ villa?: string; url?: string }> } } })?.appSettings?.ical) || {};
    const sources = Array.isArray(ical.sources) ? ical.sources : [];
    if (!sources.length) { report.push({ user: row.user_id, skipped: "no sources" }); continue; }

    const blocks: Array<{ user_id: string; villa: string; uid: string; start_date: string; end_date: string; reservation_url: string }> = [];
    let fetchError = "";
    for (const s of sources) {
      const villa = s.villa === "Windmill" ? "Windmill" : "Sunrise";
      try {
        const body = await fetchIcs(String(s.url || ""));
        for (const ev of parseIcs(body, { maxEvents: 300 })) {
          if (isOwnExportUid(ev.uid)) continue; // never re-import our own export
          // Same Option-B contract as ical-import: keep ONLY the reservation
          // deep-link from DESCRIPTION; drop phone digits and everything else.
          const m = ev.description.match(/Reservation URL:\s*([^\s\\]+)/i);
          blocks.push({ user_id: row.user_id, villa, uid: ev.uid, start_date: ev.start, end_date: ev.end, reservation_url: m ? m[1] : "" });
        }
      } catch (e) {
        fetchError = `${villa}: ${String((e as Error)?.message || e)}`;
      }
    }
    // Refresh only when at least one feed succeeded — a transient OTA outage
    // must not wipe the last good snapshot.
    if (!fetchError) {
      const saved=await fetch(base+'/rest/v1/rpc/property_replace_ical_blocks',{method:'POST',headers:H,body:JSON.stringify({p_user:row.user_id,p_blocks:blocks})});
      if(!saved.ok){report.push({user:row.user_id,error:'atomic_refresh_failed'});continue;}
    }
    report.push({ user: row.user_id, blocks: blocks.length, fetchError: fetchError || undefined });
  }
  return json({ ok: true, report });
});
