(function(root) {
  'use strict';
  const validDay=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value>='0001-01-01' && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  function shift(day,amount) {
    if(!validDay(day) || !Number.isSafeInteger(amount))return '';
    const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+amount);
    if(!Number.isFinite(date.getTime()))return '';
    const result=date.toISOString().slice(0,10);return validDay(result)?result:'';
  }
  function model(bookings,date,{departure,tentative}={}) {
    if(!validDay(date) || typeof departure!=='function' || typeof tentative!=='function')throw new Error('Valid stay-agenda dependencies and date are required.');
    const result={arrivals:[],continuing:[],departures:[],invalid:0};
    for(const booking of bookings || []) {
      if(!booking || tentative(booking))continue;
      let end;try{end=departure(booking);}catch{result.invalid++;continue;}
      if(!validDay(booking.arrival) || !validDay(end) || end<=booking.arrival){result.invalid++;continue;}
      if(booking.arrival===date)result.arrivals.push(booking);
      else if(end===date)result.departures.push(booking);
      else if(booking.arrival<date && date<end)result.continuing.push(booking);
    }
    for(const key of ['arrivals','continuing','departures'])result[key].sort((a,b)=>String(a.guest || '').localeCompare(String(b.guest || '')) || String(a.id || '').localeCompare(String(b.id || '')));
    return result;
  }
  function create({document,read,scope,today,departure,tentative,openBooking,available,annotations=()=>[]}={}) {
    if(!document || [read,scope,today,departure,tentative,openBooking,available,annotations].some(fn=>typeof fn!=='function'))throw new Error('Stay-agenda dependencies are required.');
    const selected=new Map();let element=null,previousScope='',signature='',groups,heading,dateInput,prev,next,current,notice;
    const node=(tag,text,className)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;return item;};
    const label=day=>new Date(day+'T12:00:00').toLocaleDateString('en-MY',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
    const day=()=>selected.get(scope()) || today();
    function choose(value) {
      if(!available() || document.querySelector('dialog[open]'))return;
      if(!validDay(value)){notice.textContent='Choose a valid agenda date. Your records have not changed.';return;}
      if(value===today())selected.delete(scope());else selected.set(scope(),value);
      notice.textContent='';delete notice.dataset.kind;refresh();
    }
    function build() {
      element=node('section',undefined,'property-stay-agenda');element.id='propertyStayAgenda';element.setAttribute('aria-label','Stay agenda');
      const top=node('header',undefined,'property-agenda-heading'),titles=node('div');titles.append(node('h3','Stay agenda'));heading=node('p');titles.append(heading);
      const controls=node('div',undefined,'property-agenda-controls');controls.setAttribute('role','group');controls.setAttribute('aria-label','Agenda day navigation');
      const button=(text,name,action)=>{const item=node('button',text,'ghost-button');item.type='button';item.title=name;item.setAttribute('aria-label',name);item.onclick=action;return item;};
      prev=button('\u2039','Previous agenda day',()=>choose(shift(day(),-1)));next=button('\u203a','Next agenda day',()=>choose(shift(day(),1)));
      dateInput=node('input');dateInput.type='date';dateInput.min='0001-01-01';dateInput.max='9999-12-31';dateInput.setAttribute('aria-label','Stay agenda date');
      dateInput.addEventListener('change',()=>choose(dateInput.value));dateInput.addEventListener('blur',()=>{if(!validDay(dateInput.value))dateInput.value=day();});
      current=button('Today','Return agenda to today',()=>choose(today()));controls.append(prev,dateInput,next,current);top.append(titles,controls);
      notice=node('p','','property-agenda-notice');notice.setAttribute('role','status');groups=node('div',undefined,'property-agenda-groups');element.append(top,notice,groups);
    }
    function refresh() {
      if(!element || !available())return;
      const source=read(),property=scope(),date=day();if(!validDay(date))return;
      if(previousScope!==property || document.activeElement!==dateInput)dateInput.value=date;
      previousScope=property;heading.textContent=property+' Villa - '+label(date)+' - Recorded bookings';
      prev.disabled=!shift(date,-1);next.disabled=!shift(date,1);current.disabled=date===today();
      const data=model(source,date,{departure,tentative});
      const labels=new Map([...data.arrivals,...data.continuing,...data.departures].map(booking=>[booking,annotations(booking,source)]));
      const stamp=JSON.stringify([property,date,source,[...labels.values()]]);if(stamp===signature)return;signature=stamp;
      const focused=document.activeElement?.closest?.('[data-agenda-booking]'),focusedId=focused && groups.contains(focused)?focused.dataset.agendaBooking:null;
      groups.replaceChildren();
      const counts=new Map();for(const booking of source)counts.set(booking.id,(counts.get(booking.id) || 0)+1);
      for(const [key,title,empty] of [['arrivals','Arrivals','No arrivals on this date.'],['continuing','Continuing stays','No continuing stays on this date.'],['departures','Departures','No departures on this date.']]) {
        const section=node('section'),head=node('h4',title+' ('+data[key].length+')');section.dataset.agendaGroup=key;section.append(head);
        if(!data[key].length)section.append(node('p',empty,'property-agenda-empty'));
        for(const booking of data[key]) {
          const row=node('button',undefined,'property-agenda-row');row.type='button';row.dataset.agendaBooking=String(booking.id || '');
          row.append(node('strong',booking.guest || 'Unnamed guest'),node('span',label(booking.arrival)+' - '+label(departure(booking))),node('span',String(booking.channel || 'Direct')));
          for(const text of labels.get(booking))row.append(node('span',text,'property-agenda-annotation'));
          row.disabled=typeof booking.id!=='string' || !booking.id.trim() || counts.get(booking.id)!==1;
          if(row.disabled)row.append(node('span','Identity needs review'));
          const expected=JSON.stringify(booking);
          row.onclick=()=>{
            if(!available() || scope()!==property || document.querySelector('dialog[open]'))return;
            const matches=read().filter(item=>item.id===booking.id);
            if(matches.length!==1 || JSON.stringify(matches[0])!==expected){notice.textContent='This stay changed. Choose it again from the refreshed agenda.';notice.dataset.kind='changed';signature='';refresh();return;}
            if(openBooking(booking.id)===false){notice.textContent='This stay has an ambiguous identity. Its original records are retained.';notice.dataset.kind='identity';}
            else {notice.textContent='';delete notice.dataset.kind;}
          };
          section.append(row);
        }
        groups.append(section);
      }
      if(notice.dataset.kind==='dates'){notice.textContent='';delete notice.dataset.kind;}
      if(data.invalid){notice.textContent=data.invalid+' stay '+(data.invalid===1?'has':'have')+' invalid dates and cannot be placed in the agenda. Original records are retained.';notice.dataset.kind='dates';}
      if(focusedId!==null)[...groups.querySelectorAll('[data-agenda-booking]')].find(row=>row.dataset.agendaBooking===focusedId && !row.disabled)?.focus({preventScroll:true});
    }
    function mount(placeholder) {
      if(!element)build();if(placeholder!==element)placeholder.replaceWith(element);refresh();
    }
    return Object.freeze({mount,refresh});
  }
  const api=Object.freeze({validDay,shift,model,create});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifePropertyStayAgenda=api;
})(typeof window==='undefined'?globalThis:window);
