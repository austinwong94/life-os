(function(root) {
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const validDate=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  const safeId=value=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value) && !['__proto__','constructor','prototype'].includes(value);
  const owners=['personal','villa'];
  const collections=['accounts','entries','budgets'];
  function cents(value,{signed=false}={}) {
    const raw=String(value).trim();
    if(!(signed?/^-?\d+(?:\.\d{1,2})?$/:/^\d+(?:\.\d{1,2})?$/).test(raw))throw new Error('Enter an amount with at most two decimal places.');
    const negative=raw.startsWith('-'),[whole,fraction='']=raw.replace('-','').split('.');
    const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    if(!Number.isSafeInteger(amount) || amount>100000000000)throw new Error('Amount is outside the supported range.');
    return negative?-amount:amount;
  }
  function checkedSum(values) {
    const result=values.reduce((sum,value)=>sum+value,0);
    if(!Number.isSafeInteger(result))throw new Error('The total is outside the supported range.');
    return result;
  }
  function empty(){return {schemaVersion:1,currency:'MYR',accounts:[],entries:[],budgets:[]};}
  function validate(ledger) {
    if(!ledger || ledger.schemaVersion!==1 || ledger.currency!=='MYR')throw new Error('Unsupported money ledger. Keep a backup and review this record.');
    const inspect=value=>{if(value && typeof value==='object')for(const key of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(key))throw new Error('Unsafe money record.');inspect(value[key]);}};inspect(ledger);
    for(const kind of collections)if(!Array.isArray(ledger[kind]) || !ledger[kind].every(record=>record && safeId(record.id)) || new Set(ledger[kind].map(record=>record.id)).size!==ledger[kind].length)throw new Error('Money records need unique IDs.');
    const amount=value=>Number.isSafeInteger(value) && Math.abs(value)<=100000000000;
    for(const account of ledger.accounts) {
      if(typeof account.name!=='string' || !account.name.trim() || !owners.includes(account.owner) || !validDate(account.openingDate) || !amount(account.openingCents) || account.openingCents<0 || !amount(account.reservedCents) || account.reservedCents<0)throw new Error('Check the account name, opening balance, date and reserve.');
    }
    const accounts=new Map(ledger.accounts.map(account=>[account.id,account]));
    for(const entry of ledger.entries) {
      const account=accounts.get(entry.accountId);
      if(!account || !['income','expense','transfer','adjustment'].includes(entry.kind) || !['planned','released','settled','cancelled'].includes(entry.status) || typeof entry.title!=='string' || !entry.title.trim() || typeof entry.note!=='string' || typeof entry.category!=='string' || !amount(entry.amountCents) || (entry.kind!=='adjustment' && entry.amountCents<=0) || !validDate(entry.dueDate) || !validDate(entry.date) || !['none','monthly'].includes(entry.repeat))throw new Error('Check this money entry and its account, amount and dates.');
      if(entry.kind==='adjustment' && (entry.status!=='settled' || entry.repeat!=='none'))throw new Error('A balance adjustment must be recorded, not scheduled.');
      if(entry.status==='released' && entry.kind!=='income')throw new Error('Only income can be released before receipt.');
      if(entry.repeat==='monthly' && (!['income','expense'].includes(entry.kind) || entry.status!=='planned' || entry.scheduleId))throw new Error('Only planned income or payments can repeat monthly.');
      if(entry.endDate && (!validDate(entry.endDate) || entry.endDate<entry.dueDate))throw new Error('Repeat end date must follow its first due date.');
      if(entry.kind==='transfer') {
        const destination=accounts.get(entry.toAccountId);
        if(!destination || destination.id===account.id || entry.repeat!=='none')throw new Error('Choose two different accounts for a transfer.');
        if(entry.status==='settled' && entry.date<destination.openingDate)throw new Error('Transfer date precedes the destination opening balance.');
      }
      if(entry.status==='settled' && entry.date<account.openingDate)throw new Error('Entry date precedes the opening balance. Do not count history already included in that balance.');
      if(entry.scheduleId) {
        const schedule=ledger.entries.find(record=>record.id===entry.scheduleId);
        if(!schedule || schedule.repeat!=='monthly' || !validDate(entry.occurrenceDate) || entry.id!==occurrenceId(schedule.id,entry.occurrenceDate) || entry.repeat!=='none')throw new Error('This recurring payment cannot be identified safely.');
      }
      if(entry.loan) {
        const loan=entry.loan;
        if(entry.kind!=='expense' || (entry.repeat!=='monthly' && !entry.scheduleId) || typeof loan.bank!=='string' || !loan.bank.trim() || !amount(loan.balanceCents) || loan.balanceCents<0 || !validDate(loan.balanceDate) || !Number.isSafeInteger(loan.installments) || loan.installments<0 || loan.installments>1200)throw new Error('Check the bank, statement balance, statement date and number of loan repayments.');
        if(loan.startDate!==undefined && !validDate(loan.startDate))throw new Error('Check the first tracked loan due date.');
        if(loan.finalCents!==undefined && (!amount(loan.finalCents) || loan.finalCents<=0))throw new Error('The final instalment must be a positive amount.');
        if(loan.balancePaymentIds!==undefined && (!Array.isArray(loan.balancePaymentIds) || !loan.balancePaymentIds.every(safeId)))throw new Error('Check the statement payment references.');
        if(entry.repeat==='monthly' && (!validDate(entry.endDate) || entry.endDate!==monthDate(loan.startDate || entry.dueDate,Math.max(0,loan.installments-1)) || entry.status!=='planned'))throw new Error('The loan repayment schedule and remaining term do not match.');
      }
    }
    for(const budget of ledger.budgets)if(!owners.includes(budget.owner) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(budget.month) || !amount(budget.limitCents) || budget.limitCents<0 || typeof budget.category!=='string' || budget.id!==budgetId(budget.owner,budget.month,budget.category))throw new Error('Check the monthly budget.');
    return copy(ledger);
  }
  function budgetId(owner,month,category='All'){return 'budget_'+owner+'_'+month+'_'+encodeURIComponent(category).replaceAll('%','_');}
  function occurrenceId(id,date){return 'occ_'+id+'_'+date;}
  function monthDate(anchor,offset) {
    const [year,month,day]=anchor.split('-').map(Number),ordinal=year*12+month-1+offset,y=Math.floor(ordinal/12),m=ordinal%12+1;
    if(y>9999)return null;
    const last=new Date(Date.UTC(y,m,0)).getUTCDate();
    return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(day,last)).padStart(2,'0');
  }
  function upcoming(ledger,end) {
    validate(ledger);if(!validDate(end))throw new Error('Choose a valid forecast date.');
    const existing=new Map(ledger.entries.map(entry=>[entry.id,entry])),rows=[];
    for(const entry of ledger.entries) {
      if(entry.voidedAt || entry.status==='cancelled')continue;
      if(entry.repeat==='monthly') {
        const anchor=entry.loan?.startDate || entry.dueDate;
        const [ey,em]=end.split('-').map(Number),[sy,sm]=anchor.split('-').map(Number),count=(ey-sy)*12+em-sm;
        if(count>1200)throw new Error('Choose a forecast within 100 years of the recurring payment.');
        for(let index=0;index<=count && (!entry.loan || index<entry.loan.installments);index++) {
          const day=monthDate(anchor,index);if(!day || day>end || entry.endDate && day>entry.endDate)break;
          const id=occurrenceId(entry.id,day);
          // Settled, cancelled and voided occurrences suppress the same bill;
          // a recurring template is never a second financial transaction.
          const recorded=existing.get(id);
          if(recorded && (!entry.loan || !recorded.voidedAt && recorded.status!=='cancelled'))continue;
          const row={...copy(entry),id,scheduleId:entry.id,occurrenceDate:day,dueDate:day,date:day,repeat:'none',virtual:true};
          if(entry.loan && index===entry.loan.installments-1 && entry.loan.finalCents!==undefined)row.amountCents=entry.loan.finalCents;
          delete row.loan;
          rows.push(row);
        }
      } else if(['planned','released'].includes(entry.status) && entry.dueDate<=end) {
        const schedule=entry.scheduleId && existing.get(entry.scheduleId);
        if(schedule?.loan && (schedule.voidedAt || schedule.status==='cancelled' || entry.occurrenceDate<(schedule.loan.startDate || schedule.dueDate) || entry.occurrenceDate>schedule.endDate || schedule.loan.installments===0))continue;
        rows.push(copy(entry));
      }
    }
    return rows.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.id.localeCompare(b.id));
  }
  function balance(ledger,accountId,today) {
    const account=ledger.accounts.find(item=>item.id===accountId);if(!account || account.openingDate>today)return null;
    return checkedSum([account.openingCents,...ledger.entries.filter(e=>!e.voidedAt && e.status==='settled' && e.repeat==='none' && e.date<=today).map(e=>e.accountId===accountId?(e.kind==='expense' || e.kind==='transfer'?-e.amountCents:e.amountCents):e.kind==='transfer' && e.toAccountId===accountId?e.amountCents:0)]);
  }
  function signedEffect(entry,accounts) {
    const from=accounts.has(entry.accountId),to=entry.kind==='transfer' && accounts.has(entry.toAccountId);
    if(entry.kind==='transfer')return (to?entry.amountCents:0)-(from?entry.amountCents:0);
    return from?(entry.kind==='expense'?-entry.amountCents:entry.amountCents):0;
  }
  function summary(ledger,today,end,owner='personal') {
    validate(ledger);if(!validDate(today) || !validDate(end) || end<today || ![...owners,'all'].includes(owner))throw new Error('Choose a valid date range and money view.');
    const accounts=ledger.accounts.filter(a=>(owner==='all' || a.owner===owner) && a.openingDate<=today),ids=new Set(accounts.map(a=>a.id));
    const actual=checkedSum(accounts.map(a=>balance(ledger,a.id,today))),reserve=checkedSum(accounts.map(a=>a.reservedCents));
    const future=upcoming(ledger,end).map(entry=>({...entry,effectCents:signedEffect(entry,ids)})).filter(e=>ids.has(e.accountId) || e.kind==='transfer' && ids.has(e.toAccountId));
    const incoming=checkedSum(future.map(e=>Math.max(0,e.effectCents))),committed=checkedSum(future.map(e=>Math.max(0,-e.effectCents)));
    let running=actual;const timeline=[],grouped=new Map();
    for(const entry of future){const day=entry.dueDate<today?today:entry.dueDate;if(!grouped.has(day))grouped.set(day,[]);grouped.get(day).push(entry);}
    for(const [date,entries] of [...grouped].sort(([a],[b])=>a.localeCompare(b))) {
      // Outgoings before receipts on the same date is the conservative floor.
      const out=checkedSum(entries.map(e=>Math.min(0,e.effectCents))),net=checkedSum(entries.map(e=>e.effectCents));
      const lowCents=running+out;running+=net;timeline.push({date,balanceCents:running,lowCents,entries});
    }
    const month=today.slice(0,7),settled=ledger.entries.filter(e=>!e.voidedAt && e.repeat==='none' && e.status==='settled' && e.date<=today && e.date.startsWith(month) && ids.has(e.accountId));
    const spent=checkedSum(settled.filter(e=>e.kind==='expense').map(e=>e.amountCents)),received=checkedSum(settled.filter(e=>e.kind==='income').map(e=>e.amountCents));
    const budget=ledger.budgets.filter(b=>!b.voidedAt && b.month===month && b.owner===owner).map(b=>({...b,spentCents:checkedSum(settled.filter(e=>e.kind==='expense' && (b.category==='All' || e.category===b.category)).map(e=>e.amountCents))}));
    return {actualCents:actual,reserveCents:reserve,committedCents:committed,incomingCents:incoming,availableCents:actual-committed-reserve,projectedCents:actual+incoming-committed,spentCents:spent,receivedCents:received,future,timeline,budgets:budget,hasAccounts:accounts.length>0,lowCents:Math.min(actual,...timeline.map(row=>row.lowCents))};
  }
  function change(input,collection,record,expected,now=Date.now()) {
    const ledger=validate(input);if(!collections.includes(collection) || !safeId(record?.id))throw new Error('Unknown money record.');
    const index=ledger[collection].findIndex(item=>item.id===record.id),current=index<0?undefined:ledger[collection][index];
    if(!equal(current,expected))throw new Error('This money record changed in another tab or device. Review it before saving.');
    const next={...copy(record),updatedAt:now,createdAt:current?.createdAt || now,history:[...(current?.history || []),...(current?[{at:now,record:Object.fromEntries(Object.entries(current).filter(([key])=>key!=='history'))}]:[])]};
    if(index<0)ledger[collection].push(next);else ledger[collection][index]=next;
    return validate(ledger);
  }
  function loanDetail(input,id,today) {
    const ledger=validate(input),entry=ledger.entries.find(e=>e.id===id && e.repeat==='monthly' && e.loan);
    if(!entry || !validDate(today))throw new Error('Choose an existing loan and a valid date.');
    const payments=ledger.entries.filter(e=>e.scheduleId===id && !e.voidedAt && e.status==='settled' && e.date<=today);
    const paid=new Set(payments.map(e=>e.occurrenceDate));
    const dates=Array.from({length:entry.loan.installments},(_,index)=>monthDate(entry.loan.startDate || entry.dueDate,index));
    const remainingDates=dates.filter(date=>!paid.has(date));
    const scheduled=remainingDates.map(date=>ledger.entries.find(e=>e.id===occurrenceId(id,date) && !e.voidedAt && e.status==='planned')?.amountCents ?? (date===dates.at(-1)?entry.loan.finalCents ?? entry.amountCents:entry.amountCents));
    const balanceNeedsUpdate=payments.some(e=>e.date>entry.loan.balanceDate || e.date===entry.loan.balanceDate && ((e.updatedAt || 0)>(entry.loan.balanceUpdatedAt || 0) || Array.isArray(entry.loan.balancePaymentIds) && !entry.loan.balancePaymentIds.includes(e.id)));
    return {id,entry,paid:dates.filter(date=>paid.has(date)).length,remaining:remainingDates.length,overdue:remainingDates.filter(date=>date<today).length,nextDate:remainingDates[0] || '',finishDate:remainingDates.at(-1) || '',scheduledCents:checkedSum(scheduled),balanceCents:entry.loan.balanceCents,balanceDate:entry.loan.balanceDate,balanceNeedsUpdate};
  }
  function loans(input,today,owner='all') {
    const ledger=validate(input);
    if(!validDate(today) || ![...owners,'all'].includes(owner))throw new Error('Choose a valid loan view.');
    return ledger.entries.filter(e=>e.loan && e.repeat==='monthly' && (owner==='all' || ledger.accounts.find(a=>a.id===e.accountId)?.owner===owner)).map(e=>loanDetail(ledger,e.id,today));
  }
  function loanTotals(input,today,owner='all') {
    const rows=loans(input,today,owner).filter(item=>!item.entry.voidedAt);
    return {rows,balanceCents:checkedSum(rows.map(item=>item.balanceCents)),monthlyCents:checkedSum(rows.filter(item=>item.remaining).map(item=>item.entry.amountCents)),scheduledCents:checkedSum(rows.map(item=>item.scheduledCents))};
  }
  function saveLoan(input,record,expected,remaining,now=Date.now()) {
    const ledger=validate(input);
    if(!Number.isSafeInteger(remaining) || remaining<0 || remaining>1200)throw new Error('Enter a whole number of repayments from 0 to 1200.');
    const children=ledger.entries.filter(e=>e.scheduleId===record.id);
    const anchor=record.loan?.startDate || record.dueDate;
    if(expected && children.length && (record.dueDate!==expected.dueDate || record.accountId!==expected.accountId || expected.loan && anchor!==(expected.loan.startDate || expected.dueDate)))throw new Error('The first due date and payment account are fixed after repayment records exist. Existing payments have been kept.');
    const paid=children.filter(e=>!e.voidedAt && e.status==='settled' && e.occurrenceDate>=anchor).length;
    const installments=remaining+paid;
    if(installments>1200)throw new Error('The complete repayment schedule cannot exceed 1200 months.');
    return change(ledger,'entries',{...record,endDate:monthDate(anchor,Math.max(0,installments-1)),loan:{...record.loan,installments}},expected,now);
  }
  function settle(input,entry,amountCents,date,today,now=Date.now()) {
    if(!validDate(date) || date>today)throw new Error('Received or paid date cannot be in the future.');
    const parent=input.entries.find(e=>e.id===entry.scheduleId);
    if(parent?.loan && amountCents!==entry.amountCents)throw new Error('Record a full instalment. For a revised amount, edit the scheduled payment first; partial payments are not treated as a completed month.');
    if(entry.virtual) {
      const current=upcoming(input,entry.dueDate).find(e=>e.id===entry.id);
      if(!equal(current,entry))throw new Error('This scheduled payment changed. Review it before recording.');
      const next={...copy(entry),amountCents,date,status:'settled'};delete next.virtual;
      const previous=input.entries.find(e=>e.id===entry.id);
      const schedule=input.entries.find(e=>e.id===entry.scheduleId);
      return change(input,'entries',next,schedule?.loan?previous:undefined,now);
    }
    return change(input,'entries',{...copy(entry),amountCents,date,status:'settled'},entry,now);
  }
  const api={empty,cents,validate,summary,balance,upcoming,change,settle,validDate,owners,collections,budgetId,occurrenceId,monthDate,loanDetail,loans,loanTotals,saveLoan,copy,equal};root.LifeMoney=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
