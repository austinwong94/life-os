import {propertyCallbackSecret,propertyCallbackOwner} from "../_shared/property-auth.ts";
// =============================================================================
// daily-digest — RUNG 5: the morning ops brief. Fetched by a time-driven Google
// Apps Script (x-digest-secret, no JWT — deploy with --no-verify-jwt) which
// emails the result to the host at 8:00 AM. READS the app_data blob (read-only,
// service role) and assembles the day's actions: arrivals needing check-in
// info, unpaid deposits, direct balances, Airbnb payouts releasing, deposit
// refunds due, departures to ask for a review. Tentative (inquiry/quoted) and
// excluded bookings never trigger money nudges. Sending stays HUMAN — every
// line links wa.me so each item is one tap from done.
// SECRETS: DIGEST_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// =============================================================================

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

type Booking = {
  guest?: string; villa?: string; channel?: string; contact?: string; status?: string;
  arrival?: string; nights?: number; revenue?: number; paid?: number;
  depositAmount?: number; depositPaid?: boolean; depositRefunded?: boolean;
  excludeFromCalculations?: boolean; checkinSentAt?: string | null;
};

async function secretOk(req: Request): Promise<boolean> {
  const secret = await propertyCallbackSecret("DIGEST_SECRET");
  const given = req.headers.get("x-digest-secret") ?? "";
  if (!secret) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(secret)),
  ]);
  const va = new Uint8Array(a), vb = new Uint8Array(b);
  let m = 0;
  for (let i = 0; i < va.length; i++) m |= va[i] ^ vb[i];
  return m === 0;
}

// Malaysia day boundaries (UTC+8), independent of server timezone.
function myToday(): Date {
  const now = new Date(Date.now() + 8 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);
const dayDiff = (a: string, b: Date) => Math.round((new Date(`${a}T00:00:00Z`).getTime() - b.getTime()) / 86400_000);

function departure(b: Booking): string {
  const d = new Date(`${b.arrival}T00:00:00Z`);
  return iso(addDays(d, Math.max(1, Number(b.nights || 1))));
}
function wa(b: Booking): string {
  const digits = String(b.contact || "").replace(/[^\d]/g, "");
  return digits ? ` — wa.me/${digits}` : " — (no phone saved)";
}
const rm = (n: number) => `RM ${Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!(await secretOk(req))) return json({ error: "unauthorized" }, 401);

  const propertyOwner=await propertyCallbackOwner();
  if(!propertyOwner)return json({error:'migration_not_activated'},409);
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const H = { apikey: key, authorization: `Bearer ${key}` };
  const res = await fetch(`${base}/rest/v1/property_workspaces?select=data&data_type=eq.full_app_backup&record_key=eq.sunrise-villa-main&user_id=eq.${propertyOwner}&limit=1`, { headers: H });
  if (!res.ok) return json({ error: "db_read_failed" }, 502);
  const rows = await res.json() as Array<{ data: { bookings?: Booking[] } }>;
  const bookings = rows[0]?.data?.bookings || [];

  const today = myToday();
  const todayIso = iso(today);
  const live = bookings.filter((b) => b.status !== "inquiry" && b.status !== "quoted"); // leads: no nudges
  const money = live.filter((b) => !b.excludeFromCalculations);

  const L = {
    arrivals: [] as string[], departures: [] as string[], inHouse: [] as string[],
    checkin: [] as string[], deposits: [] as string[], balances: [] as string[],
    payouts: [] as string[], refunds: [] as string[], reviews: [] as string[],
  };

  for (const b of live) {
    if (!b.arrival) continue;
    const dep = departure(b);
    const dArr = dayDiff(b.arrival, today);
    const name = `${b.guest || "Guest"} (${b.villa === "Windmill" ? "Windmill" : "Sunrise"}${b.channel ? ` · ${b.channel}` : ""})`;
    if (b.arrival === todayIso) L.arrivals.push(`${name}, ${b.nights} night(s)${wa(b)}`);
    if (dep === todayIso) L.departures.push(`${name}${wa(b)}`);
    if (b.arrival < todayIso && dep > todayIso) L.inHouse.push(`${name} · until ${dep}`);
    if (dArr >= 0 && dArr <= 7 && !b.checkinSentAt) L.checkin.push(`${name} arrives ${b.arrival} (in ${dArr}d) — send check-in info${wa(b)}`);
    if (dep >= todayIso && dep <= iso(addDays(today, 2)) && dep <= todayIso) L.reviews.push(`${name} checked out — ask for a review${wa(b)}`);
  }
  for (const b of money) {
    if (!b.arrival) continue;
    const dep = departure(b);
    const bal = Number(b.revenue || 0) + Number(b.depositAmount || 0) - Number(b.paid || 0);
    if (dep >= todayIso && Number(b.depositAmount || 0) > 0 && !b.depositPaid) {
      L.deposits.push(`${b.guest}: deposit ${rm(Number(b.depositAmount || 0))} unpaid, arrives ${b.arrival}${wa(b)}`);
    }
    if (b.channel === "Airbnb") {
      const release = iso(addDays(new Date(`${b.arrival}T00:00:00Z`), 1));
      const relD = dayDiff(release, today);
      if (relD >= 0 && relD <= 7) L.payouts.push(`${b.guest}: ${rm(Number(b.revenue || 0))} releases ${release}${relD === 0 ? " (today)" : ` (in ${relD}d)`}`);
    } else if (bal > 0 && dep >= todayIso) {
      L.balances.push(`${b.guest}: ${rm(bal)} outstanding, arrives ${b.arrival}${wa(b)}`);
    }
    if (b.depositPaid && !b.depositRefunded && Number(b.depositAmount || 0) > 0 && dep < todayIso) {
      L.refunds.push(`${b.guest}: refund ${rm(Number(b.depositAmount || 0))} (checked out ${dep})`);
    }
  }

  const sec = (title: string, items: string[]) => items.length ? `\n${title}\n${items.map((i) => `  • ${i}`).join("\n")}\n` : "";
  const actionCount = L.checkin.length + L.deposits.length + L.balances.length + L.refunds.length + L.reviews.length;
  const text =
    `SUNRISE VILLA — ${todayIso}\n` +
    `${actionCount} action(s) waiting · each is one tap in the dashboard\n` +
    sec("🛬 ARRIVING TODAY", L.arrivals) +
    sec("🏠 IN-HOUSE", L.inHouse) +
    sec("🧳 CHECKING OUT TODAY", L.departures) +
    sec("✉️ SEND CHECK-IN INFO", L.checkin) +
    sec("💰 DEPOSITS UNPAID", L.deposits) +
    sec("💳 DIRECT BALANCES OUTSTANDING", L.balances) +
    sec("🏦 AIRBNB PAYOUTS RELEASING", L.payouts) +
    sec("↩️ DEPOSIT REFUNDS DUE", L.refunds) +
    sec("⭐ ASK FOR REVIEW", L.reviews) +
    (actionCount === 0 && !L.arrivals.length && !L.departures.length ? "\nNothing needs you today. 🌅\n" : "") +
    `\nDashboard: https://austinwong94.github.io/sunrise-villa-dashboard/\n(Read-only digest — nothing was sent to any guest.)`;

  return json({ ok: true, subject: `Sunrise Villa — ${actionCount} action(s) today (${todayIso})`, text });
});
