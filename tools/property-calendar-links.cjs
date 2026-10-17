function propertyReservationLink(value) {
  if (typeof value !== "string" || !value || value.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    const host = url.hostname.toLowerCase();
    const provider = [["airbnb.com", "Airbnb"], ["booking.com", "Booking.com"]].find(([domain]) => host === domain || host.endsWith("." + domain));
    return provider ? { href: url.href, provider: provider[1] } : null;
  } catch {
    return null;
  }
}

const original = `      const chip = document.createElement(b.reservationUrl ? "a" : "div");
      chip.className = "booking-chip airbnb-import";
      if (b.reservationUrl) {
        chip.href = b.reservationUrl;
        chip.target = "_blank";
        chip.rel = "noopener noreferrer";
        chip.title = "Open this reservation in Airbnb";
      }
      chip.innerHTML = \`<span>Airbnb · \${escapeHtml(b.villa)}\${b.reservationUrl ? " ↗" : ""}</span>\`;`;
const replacement = `      const link = propertyReservationLink(b.reservationUrl);
      const chip = document.createElement(link ? "a" : "div");
      chip.className = "booking-chip airbnb-import";
      if (link) {
        chip.href = link.href;
        chip.target = "_blank";
        chip.rel = "noopener noreferrer";
        chip.title = "Open this reservation in " + link.provider;
        chip.setAttribute("aria-label", chip.title + " (opens in a new tab)");
      } else {
        chip.title = "Imported availability; no verified reservation link.";
      }
      chip.textContent = (link ? link.provider : "Imported") + " · " + b.villa + (link ? " ↗" : "");`;

function hardenPropertyCalendarLinks(source) {
  const helper = propertyReservationLink.toString();
  if (source.includes(helper) && source.includes(replacement) && !source.includes(original)) return source;
  if (!source.includes(original) || !source.includes("function renderCalendar() {") || source.includes("function propertyReservationLink(")) throw new Error("Property calendar link source changed");
  return source.replace("function renderCalendar() {", helper + "\n\nfunction renderCalendar() {").replace(original, replacement);
}

module.exports = { propertyReservationLink, hardenPropertyCalendarLinks };
