(function(root){
  'use strict';
  const M=root.LifeMoney || (typeof require==='function'?require('./money-store.js'):null);
  const columnCount=26;
  const headers=['Item','Amount (RM)','Status','Category','Account','Paid / due date','Notes',...Array.from({length:columnCount-7},(_,i)=>'Detail '+String.fromCharCode(72+i))];
  const labels={paid:'Paid',confirmed:'Confirmed upcoming',considering:'Considering',received:'Received',expected:'Expected income'};
  const editable=e=>!e.virtual && !e.scheduleId && !e.loan && !e.paymentPlan && !e.monthBill && !e.billId && !e.voidedAt && e.repeat==='none' && ['income','expense'].includes(e.kind) && ['planned','released','settled'].includes(e.status);
  const text=value=>value==null?'':String(value);
  const valuesFor=row=>Array.from({length:columnCount},(_,x)=>text(row?.[x]));
  function snapshot(input,session,today){
    const ledger=M.validate(input),sheet=M.worksheet(ledger,session.month,today,session.owner,session.purchaseCategory,session.sheetBucket,session.sheetQuery,session.sheetOrder);
    const rows=sheet.rows.map(row=>({entry:M.copy(row.entry),editable:editable(row.entry),values:[row.entry.title,(row.amountCents/100).toFixed(2),M.worksheetStatus(row,ledger.accounts.find(a=>a.id===row.entry.accountId)),row.entry.category,ledger.accounts.find(a=>a.id===row.entry.accountId).name,row.date,row.entry.note,...headers.slice(7).map((_,i)=>text(row.entry.sheetCells?.[String.fromCharCode(72+i)]))]}));
    return {version:1,ledger,today,month:session.month,owner:session.owner,rows,data:[headers.slice(),...rows.map(row=>row.values.slice())]};
  }
  function prepare(base,data,current,today,ids){
    if(base.version!==1 || !Array.isArray(data) || data.length>5000 || data.some(row=>!Array.isArray(row) || row.length>columnCount))throw new Error('Unsupported worksheet. Keep the draft and reopen this sheet.');
    if(today!==base.today)throw new Error('The day changed. Your draft is kept; reopen and review its dates before saving.');
    if(!M.equal(current,base.ledger))throw new Error('Money records changed in another tab or device. Your sheet draft is kept; review the latest records before saving.');
    if(!M.equal((data[0] || []).slice(0,7).map(text),headers.slice(0,7)) || (data[0] || []).slice(7).some((value,i)=>text(value)!=='' && text(value)!==headers[i+7]))throw new Error('The first row contains protected column names.');
    let next=M.validate(current),changed=0;
    for(let y=1;y<Math.max(data.length,base.rows.length+1);y++){
      const values=valuesFor(data[y]),original=base.rows[y-1],hasValue=values.some(value=>value.trim());
      if(original && M.equal(values,valuesFor(original.values)))continue;
      if(original && !original.editable)throw new Error('Row '+(y+1)+' is a scheduled or specialized record. Use its row options.');
      if(!hasValue){if(original)throw new Error('Row '+(y+1)+' cannot delete a saved record. Use its row options to void it.');continue;}
      try{
        const [title,amount,status,category,accountName,date,note]=values;
        if(!original && !values.slice(0,7).some(value=>value.trim()))throw new Error('Detail cells need a money item and amount in columns A and B before saving. Your draft is kept.');
        if(!title.trim())throw new Error('Enter an item name.');
        const fallbackDate=base.month===today.slice(0,7)?today:base.month+'-01',when=date.trim() || fallbackDate;
        if(!M.validDate(when))throw new Error('Use a valid date in YYYY-MM-DD format.');
        const charged=status.trim().toLowerCase()==='charged to card';
        const stage=Object.keys(labels).find(key=>key===status.trim().toLowerCase() || labels[key].toLowerCase()===status.trim().toLowerCase()) || (charged?'paid':!status.trim()?(when>today?'confirmed':'paid'):null);
        if(!stage)throw new Error('Status must be Paid, Confirmed upcoming, Considering, Received or Expected income.');
        const expected=original?.entry,settled=['paid','received'].includes(stage),kind=['received','expected'].includes(stage)?'income':'expense';
        if(expected && (expected.kind!==kind || expected.status==='settled' && !settled))throw new Error('Use row options to change the payment type or reopen a paid record.');
        if(settled && when>today)throw new Error('A future payment is not paid yet. Choose Confirmed upcoming or Expected income.');
        const candidates=next.accounts.filter(a=>base.owner==='all' || a.owner===base.owner);
        const matches=accountName.trim()?next.accounts.filter(a=>a.name===accountName):[];
        const account=accountName.trim()?(matches.length===1?matches[0]:expected && matches.find(a=>a.id===expected.accountId)):expected?next.accounts.find(a=>a.id===expected.accountId):candidates[0];
        if(!account)throw new Error('Choose an unambiguous existing account name.');
        if(charged && !M.isCredit(account))throw new Error('Charged to card requires a credit-card account.');
        if(base.owner!=='all' && account.owner!==base.owner)throw new Error('This account belongs to another Money view.');
        const id=expected?.id || ids[y];
        if(!id)throw new Error('Reopen this draft before saving a new row.');
        const record={...expected,id,title:title.trim(),amountCents:M.cents(amount),kind,accountId:account.id,status:settled?'settled':expected?.status==='released'?'released':'planned',repeat:'none',date:settled?when:expected?.date || when,dueDate:settled?expected?.dueDate || when:when,category:category.trim() || (account.owner==='villa'?'Sunrise Villa':'Personal Spending'),note};
        // Extra columns belong to the record ID, not its current row/filter position.
        if(expected?.sheetCells || values.slice(7).some(value=>value!==''))record.sheetCells={...expected?.sheetCells,...Object.fromEntries(values.slice(7).map((value,i)=>[String.fromCharCode(72+i),value]))};
        if(kind==='expense' && !settled)record.purchaseIntent=stage==='considering'?'considering':'committed';
        if(record.source==='Airbnb' && record.reference && next.entries.some(e=>!e.voidedAt && e.id!==id && e.kind==='income' && e.source==='Airbnb' && e.reference===record.reference && e.accountId===account.id && e.dueDate===record.dueDate))throw new Error('This Airbnb payout reference already exists.');
        next=M.change(next,'entries',record,expected);changed++;
      }catch(error){throw new Error('Row '+(y+1)+': '+error.message);}
    }
    return {ledger:next,changed};
  }
  const api={headers,columnCount,valuesFor,labels,editable,snapshot,prepare};root.LifeMoneyWorkbook=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
