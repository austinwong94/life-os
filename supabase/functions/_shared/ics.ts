// =============================================================================
// _shared/ics.ts  —  TEMPLATE / SKELETON (NOT TESTED, NOT DEPLOYED)
// -----------------------------------------------------------------------------
// Defensive, dependency-free iCalendar (RFC 5545) helpers for improvement #5.
//   * parseIcs(): tolerant parse of a fetched OTA .ics feed into VEVENTs.
//     Handles line-folding, CRLF/LF, params on DTSTART/DTEND, DATE & DATE-TIME.
//   * buildExportIcs(): emit an outbound feed whose every event summary is the
//     literal string "Unavailable" — NO guest name, phone, email, or amount.
//
// EXPORT-LOOP PREVENTION: events we emit are tagged with a fixed PRODID and a
// UID suffix so that if an OTA ever feeds our own export back to us, ical-sync
// can recognise and drop it (see isOwnExportUid()).
// =============================================================================

const OWN_PRODID = "-//SunriseVilla//availability-export//EN";
const OWN_UID_SUFFIX = "@sunrise-villa.export"; // marks events WE generated

export interface IcsEvent {
  uid: string; // raw UID — used for dedupe across syncs (improvement #5)
  start: string; // ISO date (YYYY-MM-DD) — all-day OTA blocks are dates
  end: string; // ISO date, exclusive per RFC 5545 for DATE values
  summary: string; // raw summary (may contain PII from the OTA; treat as untrusted)
  description: string; // raw DESCRIPTION (may contain reservation URL + last-4 phone; untrusted)
  rawStartValue: string;
}

/** Unfold RFC 5545 folded lines (continuation lines begin with space/tab). */
function unfold(input: string): string[] {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const out: string[] = [];
  for (const line of normalized.split("\n")) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Split "DTSTART;VALUE=DATE:20260101" -> { name, params, value }. */
function splitProp(line: string): { name: string; value: string } | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const name = left.split(";")[0].toUpperCase();
  return { name, value };
}

/** Normalise an ICS DATE / DATE-TIME value to an ISO date (YYYY-MM-DD). */
function toIsoDate(value: string): string {
  // Accept 20260101, 20260101T140000Z, 2026-01-01, etc. Defensive only.
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length >= 8) {
    const y = digits.slice(0, 4);
    const m = digits.slice(4, 6);
    const d = digits.slice(6, 8);
    return `${y}-${m}-${d}`;
  }
  return ""; // unparseable; caller drops the event
}

/** True if a UID is one we ourselves exported (export-loop guard). */
export function isOwnExportUid(uid: string): boolean {
  return uid.endsWith(OWN_UID_SUFFIX);
}

/**
 * Tolerant parse of an .ics body into VEVENTs. Never throws on malformed input;
 * it skips events it cannot understand and returns whatever was valid. Caller is
 * responsible for treating SUMMARY as untrusted (it can contain PII / junk).
 */
export function parseIcs(body: string, opts?: { maxEvents?: number }): IcsEvent[] {
  const maxEvents = opts?.maxEvents ?? 5000; // bound work on a hostile/huge feed
  const lines = unfold(body);
  const events: IcsEvent[] = [];

  let cur: Partial<IcsEvent> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur && cur.uid && cur.start) {
        events.push({
          uid: String(cur.uid),
          start: String(cur.start),
          end: String(cur.end ?? cur.start),
          summary: String(cur.summary ?? ""),
          description: String(cur.description ?? ""),
          rawStartValue: String(cur.rawStartValue ?? ""),
        });
        if (events.length >= maxEvents) break;
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const prop = splitProp(line);
    if (!prop) continue;
    switch (prop.name) {
      case "UID":
        cur.uid = prop.value.trim();
        break;
      case "DTSTART":
        cur.rawStartValue = prop.value.trim();
        cur.start = toIsoDate(prop.value);
        break;
      case "DTEND":
        cur.end = toIsoDate(prop.value);
        break;
      case "SUMMARY":
        cur.summary = prop.value.trim();
        break;
      case "DESCRIPTION":
        cur.description = prop.value.trim();
        break;
      default:
        break; // ignore everything else
    }
  }

  // Drop events with an unparseable start date.
  return events.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.start));
}

export interface ExportBlock {
  uid: string; // stable per booking, e.g. booking.id
  start: string; // ISO date inclusive
  end: string; // ISO date exclusive (RFC 5545 DATE semantics)
}

function icsDate(iso: string): string {
  return iso.replace(/-/g, ""); // 2026-01-01 -> 20260101
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * Build an outbound availability feed. EVERY event summary is "Unavailable" —
 * we intentionally emit NO guest name/contact/amount. UIDs carry our suffix so
 * the inbound parser can recognise and ignore our own export (loop prevention).
 */
export function buildExportIcs(blocks: ExportBlock[], calName = "Sunrise Villa availability"): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const out: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${OWN_PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
  ];
  for (const b of blocks) {
    out.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(b.uid)}${OWN_UID_SUFFIX}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${icsDate(b.start)}`,
      `DTEND;VALUE=DATE:${icsDate(b.end)}`,
      "SUMMARY:Unavailable", // <-- no PII, ever
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  out.push("END:VCALENDAR");
  // RFC 5545 wants CRLF line endings.
  return out.join("\r\n") + "\r\n";
}
