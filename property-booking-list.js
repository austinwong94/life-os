(function(root) {
  'use strict';
  const layout=(choice,narrow)=>['list','table'].includes(choice)?choice:narrow?'list':'table';
  function unchanged(source,id,expected) {
    if(!Array.isArray(source) || typeof id!=='string' || !id.trim() || typeof expected!=='string')return null;
    const matches=source.filter(item=>item?.id===id);
    return matches.length===1 && JSON.stringify(matches[0])===expected?matches[0]:null;
  }
  function create({document,media,read,scope,available,describe,openBooking,onLayout}={}) {
    if(!document || !media || [read,scope,available,describe,openBooking,onLayout].some(fn=>typeof fn!=='function'))throw new Error('Booking-list dependencies are required.');
    const host=document.getElementById('propertyBookingList'),table=document.querySelector('#bookingsView .bookings-table-wrap'),columns=document.querySelector('#bookingsView .column-drawer');
    const group=document.createElement('div');group.className='property-booking-layout';group.setAttribute('role','group');group.setAttribute('aria-label','Booking layout');
    let choice='',signature='',generation=0;
    const modes=new Map();
    for(const mode of ['list','table']){
      const button=document.createElement('button');button.type='button';button.textContent=mode==='list'?'List':'Table';button.onclick=()=>{if(!available() || document.querySelector('dialog[open]'))return;choice=mode;syncLayout();onLayout();};modes.set(mode,button);group.append(button);
    }
    columns.before(group);columns.classList.add('property-booking-columns');
    const mode=()=>layout(choice,media.matches);
    function syncLayout() {
      const selected=mode();host.hidden=selected!=='list';table.hidden=selected!=='table';columns.hidden=selected!=='table';
      if(selected==='list')columns.open=false;
      for(const [value,button]of modes)button.setAttribute('aria-pressed',String(value===selected));
    }
    media.addEventListener('change',()=>{if(!choice){syncLayout();onLayout();}});syncLayout();
    const node=(tag,text,className)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;return item;};
    function render(rows,{allMonths=false,monthLabel=value=>value}={}) {
      syncLayout();if(mode()!=='list')return;
      const property=scope(),models=rows.map(booking=>describe(booking));
      const next=JSON.stringify([property,allMonths,rows,models]);if(next===signature)return;signature=next;generation++;
      const previous=document.activeElement?.closest?.('[data-property-booking]'),focused=previous && host.contains(previous)?previous.dataset.propertyBooking:null;
      host.replaceChildren();const revision=generation,source=read(),counts=new Map();for(const booking of source)counts.set(booking.id,(counts.get(booking.id)||0)+1);
      const count=node('p',rows.length+' matching '+(rows.length===1?'booking':'bookings'),'property-booking-count');host.append(count);
      if(!rows.length)host.append(node('p','No bookings match these filters.','property-booking-empty'));
      let month='';
      rows.forEach((booking,index)=>{
        const model=models[index],nextMonth=String(booking.arrival || '').slice(0,7);
        if(allMonths && nextMonth!==month){month=nextMonth;host.append(node('h4',monthLabel(month),'property-booking-month'));}
        const row=node('button',undefined,'property-booking-row');row.type='button';row.dataset.propertyBooking=String(booking.id || '');
        const main=node('span',undefined,'property-booking-main');main.append(node('strong',model.guest),node('span',model.stay),node('span',model.channel));
        for(const flag of model.flags)main.append(node('span',flag,'property-booking-flag'));
        const values=node('span',undefined,'property-booking-values');
        for(const [label,value]of model.values){const cell=node('span');cell.append(node('span',label),node('strong',value));values.append(cell);}
        if(model.note)main.append(node('span',model.note));row.append(main,values);
        row.disabled=typeof booking.id!=='string' || !booking.id.trim() || counts.get(booking.id)!==1;
        if(row.disabled)main.append(node('span','Identity needs review'));
        const expected=JSON.stringify(booking);
        row.onclick=()=>{
          if(!available() || host.hidden || !row.isConnected || generation!==revision || scope()!==property || document.querySelector('dialog[open]'))return;
          if(!unchanged(read(),booking.id,expected)){onLayout();host.querySelector('.property-booking-count').textContent='This booking changed. Choose it again from the refreshed list.';return;}
          if(openBooking(booking.id)===false)count.textContent='This booking needs identity review. Original records are retained.';
        };
        host.append(row);
      });
      if(focused!==null)[...host.querySelectorAll('[data-property-booking]')].find(row=>row.dataset.propertyBooking===focused && !row.disabled)?.focus({preventScroll:true});
    }
    return Object.freeze({render,layout:mode});
  }
  const api=Object.freeze({layout,unchanged,create});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifePropertyBookingList=api;
})(typeof window==='undefined'?globalThis:window);
