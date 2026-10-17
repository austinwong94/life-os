import { fetchPropertyIcs, parsePropertyIcs } from "../_shared/property-ical.ts";
import {propertyCallbackSecret,propertyCallbackOwner} from "../_shared/property-auth.ts";
// =============================================================================
// ical-cron-sync — RUNG 4: server-side hourly Airbnb/Booking.com calendar sync.
// Called by pg_cron with a gateway JWT and a separate private x-cron-secret.
// READS the activated owner's iCal sources from property_workspaces (read-only; never
// writes the blob, which would race the client's debounced save) and refreshes
// the public.property_ical_blocks side table. The client merges that table on
// load, so the calendar is fresh even if the app was closed for days.
// The callback secret is read from target Vault, not copied from the source.
// =============================================================================

import { isOwnExportUid } from "../_shared/ics.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

const MAX_ICS_BYTES = 1_000_000;

async function fetchIcs(feedUrl: string): Promise<string> {
  return fetchPropertyIcs(feedUrl, { maxBytes: MAX_ICS_BYTES, timeoutMs: 12_000 });
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
        for (const ev of parsePropertyIcs(body, { maxEvents: 300 })) {
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
    // Every configured feed must succeed before replacing the last good snapshot.
    if (!fetchError) {
      const saved=await fetch(base+'/rest/v1/rpc/property_replace_ical_blocks',{method:'POST',headers:H,body:JSON.stringify({p_user:row.user_id,p_blocks:blocks})});
      if(!saved.ok){report.push({user:row.user_id,error:'atomic_refresh_failed'});continue;}
    }
    report.push({ user: row.user_id, blocks: blocks.length, fetchError: fetchError || undefined });
  }
  return json({ ok: true, report });
});
