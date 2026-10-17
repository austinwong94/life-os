function initializePropertyPeriod() {
  const bar = document.getElementById('mobileMonthBar');
  const section = document.querySelector('.month-switcher');
  const label = document.getElementById('mobileMonthLabel');
  if (!bar || !section || !label || bar.querySelector('.property-period')) return;
  const picker = document.createElement('details');
  const summary = document.createElement('summary');
  const current = document.createElement('button');
  picker.className = 'property-period';
  summary.title = 'Choose month and year';
  label.setAttribute('aria-live', 'polite');
  label.setAttribute('aria-atomic', 'true');
  summary.append(label);
  picker.append(summary, section);
  bar.classList.add('property-month-bar');
  bar.querySelector('#mobileNextMonth').before(picker);
  current.type = 'button';
  current.className = 'ghost-button property-current-month';
  current.textContent = 'This month';
  section.append(current);
  for (const [id, name] of [['prevMonth', 'Previous year'], ['nextMonth', 'Next year']]) {
    document.getElementById(id).setAttribute('aria-label', name);
  }
  function close(returnFocus) {
    picker.open = false;
    if (returnFocus) summary.focus();
  }
  current.addEventListener('click', () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (selectedMonth !== month) {
      setSelectedMonth(month);
      renderAll();
    }
    close(true);
  });
  // Existing delegated month selection runs first; retain its data/save behavior.
  section.addEventListener('click', event => {
    if (event.target.closest('[data-month-value]')) close(true);
  });
  picker.addEventListener('keydown', event => {
    if (event.key === 'Escape' && picker.open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  });
  document.addEventListener('click', event => {
    if (picker.open && !picker.contains(event.target)) close(false);
  });
}

const oldWrapper = "[['.month-switcher','Period','property-period'],['.focus-panel','Payment summary','property-payment-summary']]";
const newWrapper = "[['.focus-panel','Payment summary','property-payment-summary']]";
const marker = "document.getElementById('cloudLogout').textContent='Life OS account';";
const hook = initializePropertyPeriod.toString() + '\ninitializePropertyPeriod();\n';
function enhancePropertyPeriod(source) {
  if (source.includes(hook) && source.includes(newWrapper) && !source.includes(oldWrapper)) return source;
  if (source.includes('function initializePropertyPeriod(') || source.split(oldWrapper).length !== 2 || source.split(marker).length !== 2) throw new Error('Property period source changed');
  return source.replace(oldWrapper, newWrapper).replace(marker, hook + marker);
}
module.exports = { initializePropertyPeriod, enhancePropertyPeriod };
