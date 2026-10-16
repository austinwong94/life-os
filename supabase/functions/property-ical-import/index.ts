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
//   * We return DATES ONLY (uid/start/end) — SUMMARY/DESCRIPTION (possible PII) are dropped.
// =============================================================================

import { parseIcs } from "../_shared/ics.ts";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_ICS_BYTES = 5 * 1024 * 1024; // 5MB cap — refuse to slurp a hostile feed
const ALLOWED_HOSTS = ["airbnb.com", "booking.com", "admin.booking.com"];
const ALLOWED_HOST_SUFFIXES = [".airbnb.com", ".booking.com"];

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

function hostAllowed(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  if (ALLOWED_HOSTS.includes(h)) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

async function fetchIcs(feedUrl: string): Promise<string> {
  const u = new URL(feedUrl); // throws on garbage -> caught by caller
  if (u.protocol !== "https:") throw new Error("not_https");
  if (!hostAllowed(u)) throw new Error("host_not_allowed");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(u.toString(), { signal: ctrl.signal, redirect: "error" });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`http_${res.status}`);

  const len = Number(res.headers.get("content-length") ?? "0");
  if (len && len > MAX_ICS_BYTES) throw new Error("too_large");
  const body = await res.text();
  if (body.length > MAX_ICS_BYTES) throw new Error("too_large");
  return body;
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
      const parsed = parseIcs(body, { maxEvents: 2000 });
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
