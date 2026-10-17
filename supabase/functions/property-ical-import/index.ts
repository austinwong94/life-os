import { fetchPropertyIcs, parsePropertyIcs } from "../_shared/property-ical.ts";
import {propertyServe} from "../_shared/property-auth.ts";
// =============================================================================
// ical-import  —  LEAN standalone Airbnb/Booking.com .ics importer (improvement #5)
// -----------------------------------------------------------------------------
// Why this exists: the browser cannot fetch an OTA .ics directly (no CORS), so we
// fetch + parse server-side and return ONLY the blocked date ranges. The client
// stores them additively in appSettings (no DB tables, no migration, frozen data
// layer untouched).
//
//   POST { sources: [{ villa: "Sunrise"|"Windmill", url: "<https .ics>" }] }
//   ->   { ok, syncedAt, results: [{ villa, ok, count, events:[{uid,start,end}], error }] }
//
// SECURITY:
//   * JWT-protected by Supabase default (verify_jwt) — only the signed-in owner can call it.
//   * SSRF guard: only https URLs on an OTA host allowlist may be fetched.
//   * Return date ranges and the reservation link only, not guest descriptions.
// =============================================================================
const FETCH_TIMEOUT_MS = 15_000;
const MAX_ICS_BYTES = 5 * 1024 * 1024; // 5MB cap — refuse to slurp a hostile feed

const cors: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

async function fetchIcs(feedUrl: string): Promise<string> {
  return fetchPropertyIcs(feedUrl, { maxBytes: MAX_ICS_BYTES, timeoutMs: FETCH_TIMEOUT_MS });
}

propertyServe(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  let payload: { sources?: Array<{ villa?: string; url?: string }> };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "bad_json" }, 400);
  }

  const sources = Array.isArray(payload.sources) ? payload.sources.slice(0, 10) : [];
  const results: Array<Record<string, unknown>> = [];

  for (const src of sources) {
    const villa = src.villa === "Windmill" ? "Windmill" : "Sunrise"; // never mix villas
    try {
      const body = await fetchIcs(String(src.url ?? ""));
      const parsed = parsePropertyIcs(body, { maxEvents: 2000 });
      // Option B: return dates + ONLY the reservation link (so the dashboard can deep-link
      // to the guest in Airbnb). We deliberately DROP the phone digits and everything else.
      const events = parsed.map((e) => {
        const m = e.description.match(/Reservation URL:\s*([^\s\\]+)/i);
        return { uid: e.uid, start: e.start, end: e.end, reservationUrl: m ? m[1] : "" };
      });
      results.push({ villa, ok: true, count: events.length, events, error: "" });
    } catch (e) {
      results.push({ villa, ok: false, count: 0, events: [], error: e instanceof Error ? e.message : "error" });
    }
  }

  return jsonResponse({ ok: true, syncedAt: new Date().toISOString(), results });
});
