function showPropertyCalendarDay(day, trigger) {
  if (!propertyCalendarDayView) propertyCalendarDayView = LifePropertyCalendarDay.create({
    document,
    reservationLink: propertyReservationLink,
    openBooking: id => {
      const booking = scopedBookings().find(item => item.id === id);
      if (booking) openBookingDialog(booking);
    },
    getDay: date => {
      const villa = appSettings.activeVilla === "Windmill" ? "Windmill" : "Sunrise";
      const sources = Array.isArray(appSettings.ical?.imported) ? appSettings.ical.imported : [];
      return {
        property: villa + " Villa",
        dateLabel: dateObj(date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        bookings: scopedBookings().filter(booking => overlapsDate(booking, date)).map(booking => ({
          id: booking.id, guest: booking.guest,
          detail: isTentativeBooking(booking) ? booking.status === "quoted" ? "Quoted" : "Inquiry" : booking.channel,
          period: shortDate(booking.arrival) + " check-in - " + shortDate(departureFor(booking)) + " check-out"
        })),
        availability: sources.filter(block => (block.villa === "Windmill" ? "Windmill" : "Sunrise") === villa && block.start <= date && date < block.end).map(block => {
          const lastDay = isoDate(addDays(dateObj(block.end), -1));
          return { reservationUrl: block.reservationUrl, period: block.start === lastDay ? shortDate(block.start) : shortDate(block.start) + " - " + shortDate(lastDay) };
        })
      };
    }
  });
  propertyCalendarDayView.open(day, trigger);
}

function enhancePropertyCalendarDay(source) {
  const helper = showPropertyCalendarDay.toString();
  const edits = [
    ['function propertyReservationLink(value) {', 'let propertyCalendarDayView;\n\n' + helper + '\n\nfunction propertyReservationLink(value) {'],
    ['        <span>${day.getDate()}</span>\n        ${booked.length ? `<span class="status-pill">${booked.length}</span>` : ""}', '        <button class="property-day-button" type="button" data-property-day="${dayIso}" aria-label="View ${dayIso}, ${booked.length} bookings"><span class="property-day-number">${day.getDate()}</span></button>\n        ${booked.length ? `<span class="status-pill" aria-hidden="true">${booked.length}</span>` : ""}'],
    ['      const more = document.createElement("div");\n      more.className = "booking-chip";\n      more.textContent = `+${booked.length - 3} more`;', '      const more = document.createElement("button");\n      more.type = "button";\n      more.dataset.propertyDay = dayIso;\n      more.className = "booking-chip property-day-more";\n      more.textContent = `+${booked.length - 3} more`;'],
    ['    els.calendarGrid.appendChild(cell);\n  }\n}', '    els.calendarGrid.appendChild(cell);\n  }\n  propertyCalendarDayView?.refresh();\n}'],
    ['els.calendarGrid?.addEventListener("click", (event) => {', 'els.calendarGrid?.addEventListener("click", (event) => {\n  const dayButton = event.target.closest("[data-property-day]");\n  if (dayButton) { showPropertyCalendarDay(dayButton.dataset.propertyDay, dayButton); return; }']
  ];
  if (edits.every(([, after]) => source.includes(after))) return source;
  for (const [before, after] of edits) {
    if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw new Error('Property calendar day source changed');
    source = source.replace(before, after);
  }
  return source;
}
module.exports = {showPropertyCalendarDay, enhancePropertyCalendarDay};
