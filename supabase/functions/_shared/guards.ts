// Shared guards for the AI Edge Functions (2026-07 audit fixes):
// - per-user DAILY rate limit (server-side; the batch cap was browser-only)
// - input size caps + output clamping helpers
// The limiter FAILS OPEN: if the DB/limiter is unreachable, the feature still
// works — a limiter outage must never brick receipt scanning; it only stops
// unbounded abuse when everything else is healthy.

export function userIdFromAuth(req: Request): string | null {
  // verify_jwt is ON at the gateway, so the JWT here is already validated —
  // we only decode the payload to read the user id.
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function underDailyCap(req: Request, fn: string, cap: number): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const user = userIdFromAuth(req);
  if (!url || !key || !user) return false; // fail closed
  try {
    const r = await fetch(`${url}/rest/v1/rpc/property_bump_ai_usage`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_user: user, p_fn: fn, p_cap: cap }),
    });
    if (!r.ok) return false;
    return (await r.json()) === true;
  } catch {
    return false;
  }
}

export const clampStr = (v: unknown, n: number): string => String(v ?? "").slice(0, n);
export const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
