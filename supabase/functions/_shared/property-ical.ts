import { parseIcs, type IcsEvent } from "./ics.ts";

type FeedOptions = { maxBytes: number; timeoutMs: number };

export async function fetchPropertyIcs(feedUrl: string, options: FeedOptions): Promise<string> {
  let url: URL;
  try { url = new URL(feedUrl); } catch { throw new Error("invalid_feed_url"); }
  if (url.protocol !== "https:") throw new Error("not_https");
  if (url.username || url.password || (url.port && url.port !== "443")) throw new Error("invalid_feed_url");
  const host = url.hostname.toLowerCase();
  if (!["airbnb.com", "booking.com"].some(allowed => host === allowed || host.endsWith("." + allowed))) throw new Error("host_not_allowed");
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) throw new Error("invalid_feed_limits");

  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let complete = false;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("feed_timeout")); }, options.timeoutMs);
  });
  const consume = async () => {
    const response = await fetch(url.toString(), { signal: controller.signal, redirect: "error" });
    if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new Error("feed_timeout"); }
    if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new Error("http_" + response.status); }
    const length = response.headers.get("content-length");
    if (length && /^\d+$/.test(length) && Number(length) > options.maxBytes) { void response.body?.cancel().catch(() => {}); throw new Error("too_large"); }
    if (!response.body) throw new Error("invalid_calendar");
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    const parts: string[] = [];
    for (;;) {
      const chunk = await reader.read();
      if (controller.signal.aborted) throw new Error("feed_timeout");
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > options.maxBytes) throw new Error("too_large");
      try { parts.push(decoder.decode(chunk.value, { stream: true })); } catch { throw new Error("invalid_utf8"); }
    }
    try { parts.push(decoder.decode()); } catch { throw new Error("invalid_utf8"); }
    complete = true;
    return parts.join("");
  };
  try {
    return await Promise.race([consume(), deadline]);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("feed_timeout");
    const message = error instanceof Error ? error.message : "";
    if (["too_large", "invalid_utf8", "invalid_calendar"].includes(message) || /^http_\d{3}$/.test(message)) throw new Error(message);
    throw new Error("feed_unavailable");
  } finally {
    clearTimeout(timer!);
    if (!complete) { controller.abort(); void reader?.cancel().catch(() => {}); }
    try { reader?.releaseLock(); } catch { /* An aborted read can still be settling. */ }
  }
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parsePropertyIcs(body: string, options: { maxEvents: number }): IcsEvent[] {
  if (!Number.isSafeInteger(options.maxEvents) || options.maxEvents < 1) throw new Error("invalid_feed_limits");
  const lines = body.replace(/\r\n?/g, "\n").trim().split("\n");
  if (lines[0]?.toUpperCase() !== "BEGIN:VCALENDAR" || lines.at(-1)?.toUpperCase() !== "END:VCALENDAR") throw new Error("invalid_calendar");
  const stack: string[] = [];
  let calendars = 0, versions = 0, eventCount = 0;
  for (const line of lines) {
    if (stack.length === 1 && /^VERSION:/i.test(line)) {
      if (line.toUpperCase() !== "VERSION:2.0" || ++versions !== 1) throw new Error("invalid_calendar");
    }
    const component = /^(BEGIN|END):([A-Z0-9-]+)$/i.exec(line);
    if (!component) continue;
    const name = component[2].toUpperCase();
    if (component[1].toUpperCase() === "BEGIN") {
      if (name === "VCALENDAR" && (++calendars !== 1 || stack.length)) throw new Error("invalid_calendar");
      if (name === "VEVENT") {
        if (stack.at(-1) !== "VCALENDAR") throw new Error("invalid_calendar");
        if (++eventCount > options.maxEvents) throw new Error("too_many_events");
      }
      stack.push(name);
    } else if (stack.pop() !== name) throw new Error("invalid_calendar");
  }
  if (stack.length || calendars !== 1 || versions !== 1) throw new Error("invalid_calendar");
  const events = parseIcs(body, { maxEvents: options.maxEvents + 1 });
  if (events.length !== eventCount) throw new Error("invalid_calendar");
  if (events.some(event => !validDate(event.start) || !validDate(event.end) || event.end <= event.start)) throw new Error("invalid_event_dates");
  return events;
}
