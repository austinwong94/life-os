(function(root) {
  'use strict';
  const STALE_MS = 90 * 60 * 1000, RUN_MS = 5 * 60 * 1000;
  const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
  function describe(row, now = Date.now()) {
    const success = timestamp(row?.last_success_at), attempt = timestamp(row?.last_attempt_at);
    const base = {lastSuccess: success, count: Number.isInteger(row?.block_count) && row.block_count >= 0 ? row.block_count : null};
    if (!row) return {...base, state: 'unknown', label: 'No automatic refresh recorded', warning: ''};
    if (row.status === 'not_configured') return {...base, state: 'unknown', label: 'No calendar feed configured', warning: ''};
    if (row.status === 'error') return {...base, state: 'error', label: 'Calendar sync failed', warning: 'Automatic refresh failed. Last successful availability is retained.'};
    if (row.status === 'running' && attempt !== null && now - attempt <= RUN_MS && attempt <= now + 60000) return {...base, state: 'running', label: 'Calendar sync running', warning: ''};
    if (row.status === 'running' || (success !== null && now - success > STALE_MS)) return {...base, state: 'warning', label: 'Calendar refresh overdue', warning: 'No successful refresh within 90 minutes. Availability may be out of date.'};
    if (row.status !== 'success' || success === null || success > now + 60000) return {...base, state: 'unknown', label: 'Calendar status unavailable', warning: 'A successful automatic refresh could not be verified.'};
    return {...base, state: 'success', label: 'Calendar up to date', warning: ''};
  }
  function create({document, read, identity, active, now = () => Date.now()}) {
    const host = document.getElementById('propertyCalendarSync');
    if (!host) return null;
    const label = host.querySelector('[data-calendar-state]'), time = host.querySelector('time'), detail = host.querySelector('[data-calendar-detail]'), warning = host.querySelector('[data-calendar-warning]'), button = host.querySelector('button');
    let row = null, owner = null, epoch = 0, pending = false, unavailable = false;
    const put = (element,text) => { if (element.textContent!==text) element.textContent=text; };
    function render() {
      const model = describe(row, now());
      if (unavailable) Object.assign(model, {state:'unknown',label:'Calendar status unavailable',warning:'Could not check the server. Last successful refresh is shown below.'});
      if (pending && !row) model.label='Checking calendar sync';
      host.dataset.status = model.state;
      put(label,model.label);
      put(time,model.lastSuccess === null ? 'Last successful refresh: not recorded' : 'Last successful refresh: ' + new Date(model.lastSuccess).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}));
      if (model.lastSuccess === null) time.removeAttribute('datetime'); else time.dateTime = new Date(model.lastSuccess).toISOString();
      put(detail,model.count === null ? 'Automatic calendar refresh: hourly' : model.count + ' availability blocks · Automatic refresh: hourly');
      put(warning,model.warning); warning.hidden = !model.warning;
      button.disabled = pending || !active();
    }
    function clear() { epoch++; pending=false; owner=null; row=null; unavailable=false; render(); }
    async function refresh() {
      const user = identity();
      if (!active() || !user) { clear(); return; }
      if (user !== owner) { epoch++; pending=false; row=null; unavailable=false; owner=user; }
      if (pending) return;
      const current = epoch;
      pending=true; render();
      try {
        const result=await read(user);
        if (current!==epoch || user!==identity() || !active()) return;
        if (!Array.isArray(result) || result.length>1 || result.some(item=>item.owner_id!==user)) throw new Error('Unverified status');
        row=result[0] || null; unavailable=false;
      } catch { if (current===epoch && user===identity()) unavailable=true; }
      finally { if (current===epoch) { pending=false; render(); } }
    }
    button.addEventListener('click',refresh);
    return {refresh,clear,render};
  }
  const api={describe,create};
  if (typeof module==='object' && module.exports) module.exports=api; else root.LifePropertyCalendarStatus=api;
})(typeof window==='object' ? window : globalThis);
