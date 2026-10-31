(function(root) {
  'use strict';
  const identity=typeof module==='object' && module.exports?require('./property-booking-list.js'):root.LifePropertyBookingList;
  const filter=value=>['all','outstanding','deposits'].includes(value)?value:'all';
  function matches(model,query='',choice='all') {
    if(!model || (!model.outstanding && !model.deposit))return false;
    const mode=filter(choice);
    if(mode==='outstanding' && !model.outstanding || mode==='deposits' && !model.deposit)return false;
    const term=typeof query==='string'?query.trim().toLocaleLowerCase():'';
    return !term || String(model.search || '').toLocaleLowerCase().includes(term);
  }
  function create({document,host,media,read,scope,available,describe,summary,openBooking}={}) {
    if(!document || !host || !media || [read,scope,available,describe,summary,openBooking].some(fn=>typeof fn!=='function'))throw new Error('Payment follow-up dependencies are required.');
    const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
    let query='',choice='all',layout='',signature='',generation=0;
    host.innerHTML='<div class="property-payment-metrics"></div><h3>Open balances and deposits <span>All dates</span></h3><div class="property-payment-toolbar"><label>Search stays<input id="propertyPaymentSearch" type="search" placeholder="Guest, date or channel" autocomplete="off"></label><div class="property-booking-layout" role="group" aria-label="Payment layout"><button type="button" data-payment-layout="list">List</button><button type="button" data-payment-layout="table">Table</button></div></div><div class="property-payment-filters" role="group" aria-label="Payment follow-up"><button type="button" data-payment-filter="all">All open</button><button type="button" data-payment-filter="outstanding">Outstanding</button><button type="button" data-payment-filter="deposits">Deposits held</button></div><p id="propertyPaymentResultStatus" role="status"></p><div id="propertyPaymentResults"></div>';
    const metrics=host.querySelector('.property-payment-metrics'),status=host.querySelector('#propertyPaymentResultStatus'),results=host.querySelector('#propertyPaymentResults');
    const canAct=()=>available() && !host.hidden && !host.inert && host.isConnected && !document.querySelector('dialog[open]');
    host.querySelector('input').addEventListener('input',event=>{query=event.target.value;render();});
    for(const button of host.querySelectorAll('[data-payment-filter]'))button.onclick=()=>{if(!canAct())return;choice=filter(button.dataset.paymentFilter);render();};
    for(const button of host.querySelectorAll('[data-payment-layout]'))button.onclick=()=>{if(!canAct())return;layout=button.dataset.paymentLayout;render();};
    media.addEventListener('change',()=>{if(!layout)render();});
    function render() {
      if(!available())return;
      const property=scope(),source=read(),models=source.map(record=>({record,model:describe(record)})).filter(row=>row.model && (row.model.outstanding || row.model.deposit)).sort((a,b)=>String(a.record.arrival || '').localeCompare(String(b.record.arrival || '')));
      const rows=models.filter(row=>matches(row.model,query,choice)),mode=identity.layout(layout,media.matches),totals=summary();
      for(const button of host.querySelectorAll('[data-payment-layout]'))button.setAttribute('aria-pressed',String(button.dataset.paymentLayout===mode));
      const labels={all:'All open',outstanding:'Outstanding',deposits:'Deposits held'};
      for(const button of host.querySelectorAll('[data-payment-filter]')){
        const key=button.dataset.paymentFilter,text=labels[key]+' '+models.filter(row=>matches(row.model,'',key)).length;
        if(button.textContent!==text)button.textContent=text;button.setAttribute('aria-pressed',String(key===choice));
      }
      const next=JSON.stringify([property,query,choice,mode,source,models.map(row=>row.model),totals]);if(next===signature)return;signature=next;generation++;
      const revision=generation,focused=document.activeElement?.closest?.('[data-payment-booking]'),focusedId=focused && results.contains(focused)?focused.dataset.paymentBooking:null;
      metrics.replaceChildren();for(const [label,value]of totals){const cell=node('span');cell.append(node('span',label),node('strong',value));metrics.append(cell);}
      status.textContent=rows.length+' matching '+(rows.length===1?'stay':'stays');results.replaceChildren();
      if(!rows.length){results.append(node('p',models.length?'No stays match these filters.':'No open balances or deposits.','property-payment-empty'));return;}
      const counts=new Map();for(const record of source)counts.set(record.id,(counts.get(record.id)||0)+1);
      let container;
      if(mode==='table'){
        const scroll=node('div',undefined,'workspace-table-scroll property-payment-table'),table=node('table',undefined,'workspace-table'),head=node('thead'),tr=node('tr');
        for(const label of ['Guest','Arrival','Received','Outstanding','Deposit to refund']){const th=node('th',label);th.scope='col';tr.append(th);}head.append(tr);container=node('tbody');table.append(head,container);scroll.append(table);results.append(scroll);
      }else{container=node('div',undefined,'property-payment-list');results.append(container);}
      for(const {record,model}of rows){
        const row=node(mode==='table'?'tr':'div',undefined,mode==='list'?'property-payment-row':''),button=node('button',model.guest,'property-payment-open');button.type='button';button.dataset.paymentBooking=String(record.id || '');
        button.disabled=typeof record.id!=='string' || !record.id.trim() || counts.get(record.id)!==1;
        const expected=JSON.stringify(record);
        button.onclick=()=>{
          if(!canAct() || !button.isConnected || revision!==generation || scope()!==property)return;
          if(!identity.unchanged(read(),record.id,expected)){render();status.textContent='This booking changed. Choose it again from the refreshed results.';return;}
          if(openBooking(record.id)===false)status.textContent='This booking needs review. Original records are retained.';
        };
        if(mode==='table'){
          const guest=node('td');guest.append(button);if(button.disabled)guest.append(node('small','Identity needs review'));row.append(guest,node('td',model.arrival));
          for(const [,value]of model.values)row.append(node('td',value,'money-cell'));
        }else{
          const main=node('div',undefined,'property-payment-main');main.append(button,node('span',model.stay),node('span',model.channel));if(button.disabled)main.append(node('span','Identity needs review'));
          const values=node('div',undefined,'property-payment-values');for(const [label,value]of model.values){const cell=node('span');cell.append(node('span',label),node('strong',value));values.append(cell);}row.append(main,values);
        }
        container.append(row);
      }
      if(focusedId!==null)[...results.querySelectorAll('[data-payment-booking]')].find(button=>button.dataset.paymentBooking===focusedId && !button.disabled)?.focus({preventScroll:true});
    }
    return Object.freeze({render});
  }
  const api=Object.freeze({filter,matches,create});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifePropertyPaymentFollowup=api;
})(typeof window==='undefined'?globalThis:window);
