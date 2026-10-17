(function(root) {
  'use strict';
  function create({document, getDay, openBooking, reservationLink}) {
    if (!document || [getDay, openBooking, reservationLink].some(fn => typeof fn !== 'function')) throw new Error('Calendar day dependencies are required.');
    let dialog = null, selectedDay = '', opener = null, frameObserver = null;
    const node = (tag, text, className) => {
      const element = document.createElement(tag);
      if (text !== undefined) element.textContent = text;
      if (className) element.className = className;
      return element;
    };
    function close(restoreFocus = true) {
      const current = dialog;
      if (!current) return;
      const returnTarget = opener?.isConnected ? opener : document.querySelector('.property-day-button[data-property-day="' + selectedDay + '"]');
      frameObserver?.disconnect();
      frameObserver = null;
      dialog = null;
      selectedDay = '';
      if (current.open) current.close();
      current.remove();
      if (restoreFocus) returnTarget?.focus();
      opener = null;
    }
    function refresh() {
      if (!dialog) return;
      const model = getDay(selectedDay);
      dialog.querySelector('h2').textContent = model.dateLabel;
      dialog.querySelector('.property-day-villa').textContent = model.property;
      const body = dialog.querySelector('.property-day-body');
      body.replaceChildren();
      for (const [title, rows, kind] of [['Bookings', model.bookings, 'booking'], ['Imported availability', model.availability, 'availability']]) {
        const section = node('section');
        section.append(node('h3', title + ' (' + rows.length + ')'));
        if (!rows.length) section.append(node('p', kind === 'booking' ? 'No bookings for this day.' : 'No imported availability for this day.', 'property-day-empty'));
        const list = node('ul');
        for (const row of rows) {
          const item = node('li');
          item.setAttribute('data-day-' + kind, '');
          const link = kind === 'availability' ? reservationLink(row.reservationUrl) : null;
          const content = node(kind === 'booking' ? 'button' : link ? 'a' : 'div', undefined, 'property-day-row');
          if (kind === 'booking') {
            content.type = 'button';
            content.addEventListener('click', () => { close(false); openBooking(row.id); });
          } else if (link) {
            content.href = link.href;
            content.target = '_blank';
            content.rel = 'noopener noreferrer';
            content.setAttribute('aria-label', link.provider + ' reservation, ' + row.period + ' (opens in a new tab)');
          }
          content.append(node('strong', kind === 'booking' ? row.guest : link ? link.provider : 'Availability block'));
          if (row.detail) content.append(node('span', row.detail));
          content.append(node('span', row.period));
          item.append(content);
          list.append(item);
        }
        section.append(list);
        body.append(section);
      }
    }
    function open(day, trigger) {
      if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
      const parsed = new Date(day + 'T00:00:00Z');
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return false;
      const view = document.defaultView, frame = view?.frameElement;
      if (frame && (frame.hidden || frame.inert)) return false;
      if (dialog) close(false);
      selectedDay = day;
      opener = trigger || document.activeElement;
      const current = node('dialog', undefined, 'property-day-dialog');
      current.id = 'propertyCalendarDayDialog';
      current.setAttribute('aria-labelledby', 'propertyCalendarDayTitle');
      const header = node('header'), titles = node('div'), heading = node('h2');
      heading.id = 'propertyCalendarDayTitle';
      heading.tabIndex = -1;
      titles.append(heading, node('p', '', 'property-day-villa'));
      const dismiss = node('button', 'Close', 'ghost-button');
      dismiss.type = 'button';
      dismiss.addEventListener('click', () => close());
      header.append(titles, dismiss);
      current.append(header, node('div', undefined, 'property-day-body'));
      current.addEventListener('cancel', event => { event.preventDefault(); close(); });
      current.addEventListener('close', () => { if (dialog === current) close(); });
      current.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const controls = [...current.querySelectorAll('button,a[href]')].filter(element => !element.disabled);
        if (!controls.length) return;
        event.preventDefault();
        const index = controls.indexOf(document.activeElement);
        controls[index < 0 ? event.shiftKey ? controls.length - 1 : 0 : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
      });
      dialog = current;
      refresh();
      document.body.append(current);
      current.showModal();
      heading.focus();
      if (frame) {
        frameObserver = new view.MutationObserver(() => { if (frame.hidden || frame.inert) close(false); });
        frameObserver.observe(frame, {attributes: true, attributeFilter: ['hidden', 'inert']});
        if (frame.hidden || frame.inert) close(false);
      }
      return true;
    }
    return {open, close, refresh};
  }
  const api = {create};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LifePropertyCalendarDay = api;
})(typeof window === 'object' ? window : globalThis);
