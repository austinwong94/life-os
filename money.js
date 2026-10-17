const moneyOwners={personal:'Personal',villa:'Sunrise Villa',all:'Combined'};
const moneySections=[{id:'overview',label:'Overview',views:['overview']},{id:'spending',label:'Spending',views:['table','transactions','spending','budgets']},{id:'payments',label:'Payments',views:['upcoming','credit','loans']},{id:'accounts',label:'Accounts',views:['accounts']}];
const moneyCategories=['Sunrise Villa','Personal Spending','Entertainment','Others','Food & drinks','Shopping','Transport','Health','Travel','Housing','Subscriptions','Cleaning','Utilities','Maintenance','Loans','Other'];
function moneyCategoryOptions(){return [...new Set([...moneyCategories,...moneyLedger().entries.map(e=>e.category),...moneyLedger().budgets.map(b=>b.category)])].filter(c=>c && c!=='All').map(c=>[c,c]);}
function moneyLedger(boardId=state.activeBoardId) {
  const board=state.boards.find(item=>item.id===boardId);
  if(!board)throw new Error('This board no longer exists.');
  return LifeMoney.validate(board.money || LifeMoney.empty());
}
function moneyFormat(cents){return new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR'}).format(cents/100);}
function moneySession(boardId=state.activeBoardId) {
  const key=LifeStorageScope.key('life-os-money:'+boardId);
  let saved={};try{saved=JSON.parse(sessionStorage.getItem(key) || '{}');}catch{}
  const sheetDefaults={};for(const owner of Object.keys(moneyOwners)){
    const value=saved?.sheetDefaults?.[owner];if(typeof value?.accountId==='string' && typeof value?.category==='string' && value.category.trim())sheetDefaults[owner]={accountId:value.accountId,category:value.category};
  }
  return {
    sheetKeepDetails:saved?.sheetKeepDetails===true,sheetDefaults,
    sheetQuery:typeof saved?.sheetQuery==='string'?saved.sheetQuery:'',sheetQueryDraft:typeof saved?.sheetQueryDraft==='string'?saved.sheetQueryDraft:typeof saved?.sheetQuery==='string'?saved.sheetQuery:'',sheetOrder:saved?.sheetOrder==='newest'?'newest':'oldest',
    owner:['personal','villa','all'].includes(saved?.owner)?saved.owner:'personal',view:['overview','table','transactions','upcoming','loans','credit','spending','accounts','budgets'].includes(saved?.view)?saved.view:'overview',sectionViews:Object.fromEntries(moneySections.map(section=>[section.id,section.views.includes(saved?.sectionViews?.[section.id])?saved.sectionViews[section.id]:section.views[0]])),horizon:['month','30','90'].includes(saved?.horizon)?saved.horizon:'month',month:/^\d{4}-(0[1-9]|1[0-2])$/.test(saved?.month)?saved.month:getTodayKey().slice(0,7),purchaseCategory:typeof saved?.purchaseCategory==='string'?saved.purchaseCategory:'',sheetBucket:['paid','received','confirmed','considering','expected','transfer','adjustment'].includes(saved?.sheetBucket)?saved.sheetBucket:'all',sheetEdit:typeof saved?.sheetEdit==='string'?saved.sheetEdit:'',drafts:saved?.drafts && typeof saved.drafts==='object'?saved.drafts:{}};
}
function saveMoneySession(session,boardId=state.activeBoardId){sessionStorage.setItem(LifeStorageScope.key('life-os-money:'+boardId),JSON.stringify(session));}
function moneyEnd(session) {
  const today=getTodayKey();return session.horizon==='month'?LifePlanning.dateKey(new Date(new Date(today+'T12:00:00').getFullYear(),new Date(today+'T12:00:00').getMonth()+1,0)):LifePlanning.shift(today,Number(session.horizon));
}
function moneyConflict(boardId=state.activeBoardId){return (state.syncConflicts || []).some(c=>c.segments?.[1]===boardId && c.segments?.[2]==='money');}
function commitMoney(boardId,mutate,{undo=true}={}) {
  if(boardId!==state.activeBoardId)throw new Error('The active board changed. Reopen this entry on its original board.');
  if(moneyConflict(boardId))throw new Error('Review conflicting money records in Recovery before editing or relying on these balances.');
  const before=moneyLedger(boardId),after=LifeMoney.validate(mutate(before));
  for(const owner of ['personal','villa','all'])LifeMoney.summary(after,getTodayKey(),moneyEnd(moneySession()),owner);
  const board=state.boards.find(b=>b.id===boardId),hadLedger=Object.hasOwn(board,'money');board.money=after;
  if(!saveState()) {
    const current=state.boards.find(b=>b.id===boardId);if(hadLedger)current.money=before;else delete current.money;
    throw new Error('Not saved on this device. Your previous records were kept; this draft is available to retry.');
  }
  renderCardsOnly({force:true});
  if(undo)showUndoToast({message:'Money record saved.',onUndo:()=>{
    try{commitMoney(boardId,ledger=>{if(!LifeMoney.equal(ledger,after))throw new Error('Other money records changed after this action. Edit this entry instead of replacing newer records.');return before;},{undo:false});}
    catch(error){setSaveStatus(error.message,'error');}
  }});
  return after;
}
function moneySelect(options,value,onChange) {
  const select=planningNode('select');for(const [key,label] of options){const option=planningNode('option','',label);option.value=key;select.append(option);}select.value=value;select.onchange=()=>onChange(select.value);return select;
}
function moneyDialogForm(title,key,defaults,build,onSave) {
  const boardId=state.activeBoardId,session=moneySession(),draft={...defaults,...session.drafts[key]};
  const dialog=dailyDialog(title);dialog.classList.add('money-dialog');
  const form=planningNode('form','money-form'),error=planningNode('p','money-message');error.setAttribute('role','status');form.append(error);
  const remember=()=>{try{const current=moneySession(boardId);current.drafts[key]=draft;saveMoneySession(current,boardId);}catch{error.textContent='Draft could not be retained on this device. Keep this form open and save your entry.';}};
  const field=(label,property,type='text',options)=>{
    const input=options?moneySelect(options,draft[property],value=>{draft[property]=value;remember();}):type==='textarea'?planningNode('textarea'):planningInput(type,draft[property],value=>{draft[property]=value;remember();});
    if(type==='textarea'){input.value=draft[property] || '';input.oninput=()=>{draft[property]=input.value;remember();};}
    if(property.toLowerCase().includes('amount') || property.toLowerCase().includes('balance') || ['opening','reserve','limit','actual'].includes(property)){input.inputMode='decimal';input.placeholder='0.00';}
    const wrapper=planningField(label,input);form.append(wrapper);return {input,wrapper};
  };
  build({form,field,draft,remember,dialog});
  const actions=planningNode('div','money-actions');const save=planningButton('Save',null,'check');save.type='submit';
  actions.append(planningButton('Cancel',()=>dialog.close()),save);form.append(actions);
  form.onsubmit=async event=>{
    event.preventDefault();save.disabled=true;
    try{if(boardId!==state.activeBoardId)throw new Error('Board changed. This draft belongs to its original board.');await onSave(draft,boardId);const current=moneySession(boardId);delete current.drafts[key];try{saveMoneySession(current,boardId);}catch{}dialog.close();}
    catch(e){error.textContent=e.message;save.disabled=false;}
  };dialog.append(form);return dialog;
}
function openMoneyAccount(account,credit=false) {
  const ledger=moneyLedger(),expected=account?LifeMoney.copy(account):undefined,id=account?.id || createId();
  moneyDialogForm(account?'Edit account':credit?'Add credit card':'Add account','account-'+(account?.id || (credit?'credit':'new')),{name:account?.name || '',type:account?.type || (credit?'credit':'cash'),owner:account?.owner || (moneySession().owner==='villa'?'villa':'personal'),opening:account?(account.openingCents/100).toFixed(2):'',openingDate:account?.openingDate || getTodayKey(),reserve:account?(account.reservedCents/100).toFixed(2):'0.00'},({form,field,draft})=>{
    field('Account name','name');const owner=field('Money belongs to','owner','text',Object.entries(moneyOwners).filter(([key])=>key!=='all'));
    const used=Boolean(account && ledger.entries.some(e=>e.accountId===account.id || e.toAccountId===account.id));
    const type=field('Account type','type','text',[['cash','Bank / cash'],['credit','Credit card']]);type.input.disabled=used;
    const opening=field('Opening balance (RM)','opening'),date=field('Opening date','openingDate','date');opening.input.disabled=used;date.input.disabled=used;owner.input.disabled=used;
    if(used)form.append(planningNode('p','money-message','Opening balance is fixed after entries exist. Use Check balance to reconcile.'));
    const hint=planningNode('p','money-message');form.append(hint);
    const reserve=field('Protected reserve (RM)','reserve');
    const update=()=>{const label=draft.type==='credit'?'Opening amount owed (RM)':'Opening balance (RM)';opening.wrapper.querySelector('span').textContent=label;opening.input.setAttribute('aria-label',label);reserve.wrapper.hidden=draft.type==='credit';hint.textContent=draft.type==='credit'?'Enter total outstanding debt at the start of this date, including unbilled instalment principal. Existing debt is not new spending. Do not enter card numbers or security codes.':'Opening balance is the start-of-day balance. Add only transactions not already included in it.';};form.addEventListener('change',update);update();
  },(draft,boardId)=>{
    if(draft.openingDate>getTodayKey())throw new Error('Opening date cannot be in the future.');
    commitMoney(boardId,current=>{if(expected && current.entries.some(e=>e.accountId===id || e.toAccountId===id) && (draft.type!==(expected.type || 'cash') || draft.owner!==expected.owner || draft.openingDate!==expected.openingDate || LifeMoney.cents(draft.opening)!==expected.openingCents))throw new Error('Transactions now exist for this account. Reopen it before changing its opening balance.');return LifeMoney.change(current,'accounts',{...expected,id,type:draft.type,name:draft.name.trim(),owner:draft.owner,openingCents:LifeMoney.cents(draft.opening),openingDate:draft.openingDate,reservedCents:draft.type==='credit'?0:LifeMoney.cents(draft.reserve)},expected);});
  });
}
function openMoneyEntry(kind='expense',entry) {
  if(entry?.paymentPlan){openMoneyCardPlan(entry);return;}
  if(entry?.monthBill){openMoneyCardBill(entry);return;}
  const ledger=moneyLedger(),accounts=ledger.accounts;if(!accounts.length){openMoneyAccount();return;}
  const expected=entry?LifeMoney.copy(entry):undefined,id=entry?.id || createId(),isVirtual=Boolean(entry?.virtual);
  const preferred=accounts.find(a=>a.owner===moneySession().owner) || accounts[0];
  const defaults={kind:entry?.kind || (['upcoming','monthly'].includes(kind)?'expense':kind),title:entry?.title || '',amount:entry?(entry.amountCents/100).toFixed(2):'',accountId:entry?.accountId || preferred.id,toAccountId:entry?.toAccountId || accounts.find(a=>a.id!==preferred.id)?.id || '',status:entry?.status || (['upcoming','monthly'].includes(kind)?'planned':'settled'),date:entry?.date || getTodayKey(),dueDate:entry?.dueDate || getTodayKey(),category:entry?.category || 'Other',note:entry?.note || '',source:entry?.source || '',reference:entry?.reference || '',repeat:entry?.repeat || (kind==='monthly'?'monthly':'none'),endDate:entry?.endDate || ''};
  moneyDialogForm(entry?'Edit money entry':'Add money entry','entry-'+(entry?.id || kind),defaults,({form,field,draft})=>{
    field('Amount (RM)','amount');field('Entry name','title');
    const type=field('Entry type','kind','text',[['expense','Expense'],['income','Income'],['transfer','Transfer']]);type.input.disabled=entry?.kind==='adjustment' || Boolean(entry?.scheduleId) || Boolean(entry && ledger.entries.some(e=>e.scheduleId===entry.id));
    field('Account','accountId','text',accounts.map(a=>[a.id,a.name+' · '+moneyOwners[a.owner]]));
    const destination=field('Destination account','toAccountId','text',accounts.map(a=>[a.id,a.name+' · '+moneyOwners[a.owner]]));
    field('Status','status','text',[['settled',draft.kind==='income'?'Received / recorded':'Paid / recorded'],['planned','Upcoming'],['released','Released, not received'],['cancelled','Cancelled']]);
    const paidDate=field('Payment / receipt date','date','date'),dueDate=field('Expected / due date','dueDate','date');
    field('Category','category','text',moneyCategoryOptions());
    const repeat=field('Repeat','repeat','text',[['none','Once'],['monthly','Every month']]);repeat.input.disabled=isVirtual || Boolean(entry?.scheduleId);
    const end=field('Stop repeating after (optional)','endDate','date');
    const source=field('Income source (optional)','source','text',[['','Other / not specified'],['Airbnb','Airbnb'],['Direct booking','Direct booking'],['Other','Other']]);
    const reference=field('Reservation / payment reference (optional)','reference');field('Notes (optional)','note','textarea');
    let purchasePlan;if(entry?.purchaseIntent!==undefined){if(draft.purchaseIntent===undefined)draft.purchaseIntent=entry.purchaseIntent;purchasePlan=field('Purchase plan','purchaseIntent','text',[['considering','Considering - budget only'],['committed','Committed - include in forecast']]);}
    const update=()=>{destination.wrapper.hidden=draft.kind!=='transfer';source.wrapper.hidden=reference.wrapper.hidden=draft.kind!=='income';repeat.wrapper.hidden=draft.kind==='transfer' || draft.status!=='planned';end.wrapper.hidden=draft.repeat!=='monthly' || draft.status!=='planned';paidDate.wrapper.hidden=draft.status!=='settled';dueDate.wrapper.hidden=draft.status==='settled';if(purchasePlan)purchasePlan.wrapper.hidden=draft.kind!=='expense' || draft.repeat!=='none' || draft.status!=='planned';};
    form.addEventListener('change',update);update();
    if(draft.kind==='income')form.append(planningNode('p','money-message','Enter the net amount you expect to receive. Released payouts remain projected until money reaches your account.'));
  },async(draft,boardId)=>{
    if(draft.status==='released' && draft.kind!=='income')throw new Error('Released applies to income only. Use Upcoming for a payment.');
    if(draft.status==='settled' && draft.date>getTodayKey())throw new Error('Paid or received date cannot be in the future. Choose Upcoming instead.');
    if(draft.repeat==='monthly' && draft.status!=='planned')throw new Error('A recurring bill is a schedule. Choose Upcoming; record each payment from Due & expected.');
    const recordId=!entry && draft.kind==='income' && draft.source==='Airbnb' && draft.reference.trim()?'payout_'+(await LifeStateMerge.fingerprint({account:draft.accountId,reference:draft.reference.trim(),dueDate:draft.dueDate})).slice(0,32):id;
    const next={...expected,id:recordId,kind:draft.kind,title:draft.title.trim(),amountCents:LifeMoney.cents(draft.amount),accountId:draft.accountId,toAccountId:draft.kind==='transfer'?draft.toAccountId:undefined,status:draft.status,date:draft.date,dueDate:draft.dueDate,category:draft.category,note:draft.note,source:draft.kind==='income'?draft.source:'',reference:draft.reference.trim(),repeat:draft.kind==='transfer'?'none':draft.repeat,endDate:draft.endDate};delete next.virtual;
    if(draft.purchaseIntent!==undefined && next.kind==='expense' && next.repeat==='none' && !next.scheduleId)next.purchaseIntent=draft.purchaseIntent;else delete next.purchaseIntent;
    commitMoney(boardId,current=>{
      if(isVirtual && !LifeMoney.equal(LifeMoney.upcoming(current,entry.dueDate).find(e=>e.id===entry.id),expected))throw new Error('This recurring payment changed. Reopen it before editing.');
      if(next.source==='Airbnb' && next.reference && current.entries.some(e=>!e.voidedAt && (!entry || e.id!==recordId) && e.kind==='income' && e.source==='Airbnb' && e.reference===next.reference && e.accountId===next.accountId && e.dueDate===next.dueDate))throw new Error('A payout with this reference, account and expected date already exists. Edit it instead.');
      return LifeMoney.change(current,'entries',next,isVirtual?undefined:expected);
    });
  });
}
function openMoneySettle(entry,{purchase=false}={}) {
  const loan=moneyLedger().entries.find(e=>e.id===entry.scheduleId && e.loan);
  const cardCharge=entry.kind==='expense' && LifeMoney.isCredit(moneyLedger().accounts.find(a=>a.id===entry.accountId));
  const paymentId=createId();
  moneyDialogForm(loan?'Record loan instalment':purchase?'Confirm purchase':entry.kind==='income'?'Record received payout':'Record payment','settle-'+entry.id,{amount:((entry.monthBill?LifeMoney.billRemaining(moneyLedger(),entry):entry.amountCents)/100).toFixed(2),date:getTodayKey(),bankBalance:''},({form,field})=>{
    field('Actual amount (RM)','amount');field(entry.kind==='income'?'Received date':'Paid date','date','date');
    if(loan){field('Bank balance after payment (RM, optional)','bankBalance');form.append(planningNode('p','money-message','Interest does not reduce the loan balance. Leave the bank balance blank unless you have the updated statement.'));}
    else form.append(planningNode('p','money-message',entry.monthBill?'A partial payment reduces the remaining bill. The unpaid remainder stays due.':cardCharge?'Records a charge to the credit card, not a payment from your bank.':purchase?'Save only after purchase. This updates the same purchase, not a duplicate.':'Records this payment once. Use Credit cards for finite card instalment plans.'));
  },(draft,boardId)=>{
    commitMoney(boardId,current=>{
      if(loan && !LifeMoney.equal(current.entries.find(e=>e.id===loan.id),loan))throw new Error('The loan changed while this form was open. Reopen the repayment before saving.');
      const next=entry.monthBill?LifeMoney.payBill(current,entry,LifeMoney.cents(draft.amount),draft.date,getTodayKey(),paymentId):LifeMoney.settle(current,entry,LifeMoney.cents(draft.amount),draft.date,getTodayKey());
      if(!loan || !draft.bankBalance.trim())return next;
      if(draft.date<loan.loan.balanceDate)throw new Error('This payment predates the latest bank balance. Leave the balance blank to keep the newer statement.');
      const balancePaymentIds=next.entries.filter(e=>e.scheduleId===loan.id && !e.voidedAt && e.status==='settled' && e.date===draft.date).map(e=>e.id);
      return LifeMoney.change(next,'entries',{...loan,loan:{...loan.loan,balanceCents:LifeMoney.cents(draft.bankBalance),balanceDate:draft.date,balanceUpdatedAt:Date.now(),balancePaymentIds}},loan);
    });
  });
}

function openMoneySpending(status='planned') {
  if(!['planned','settled'].includes(status))status='planned';
  const ledger=moneyLedger(),accounts=ledger.accounts.filter(a=>moneySession().owner==='all' || a.owner===moneySession().owner);
  if(!accounts.length){openMoneyAccount();return;}
  const id=createId();
  const paid=status==='settled';
  moneyDialogForm(paid?'Record purchase':'Plan spending',paid?'spending-new-settled':'spending-new',{title:'',amount:'',accountId:accounts[0].id,dueDate:getTodayKey(),category:moneySession().purchaseCategory || (moneySession().owner==='villa'?'Sunrise Villa':'Personal Spending'),purchaseIntent:'considering',note:''},({form,field})=>{
    field('Item or payment','title');field(paid?'Actual amount (RM)':'Expected amount (RM)','amount');field(paid?'Paid date':'Expected payment date','dueDate','date');field('Pay from','accountId','text',accounts.map(a=>[a.id,a.name]));field('Category','category','text',moneyCategoryOptions());
    if(!paid)field('Purchase plan','purchaseIntent','text',[['considering','Considering - budget only'],['committed','Committed - include in forecast']]);
    field('Notes (optional)','note','textarea');if(paid)form.append(planningNode('p','money-message','For purchases already paid. This is added to actual spending and deducted from the selected account.'));
  },(draft,boardId)=>{
    if(paid && draft.dueDate>getTodayKey())throw new Error('Paid date cannot be in the future. Keep this as a planned purchase until paid.');
    return commitMoney(boardId,current=>LifeMoney.change(current,'entries',{id,title:draft.title.trim(),amountCents:LifeMoney.cents(draft.amount),accountId:draft.accountId,kind:'expense',status,repeat:'none',date:draft.dueDate,dueDate:draft.dueDate,category:draft.category,note:draft.note,spendingPlan:true,purchaseIntent:draft.purchaseIntent},undefined));
  });
}

function openMoneyLoan(entry) {
  const ledger=moneyLedger(),accounts=ledger.accounts.filter(a=>moneySession().owner==='all' || a.owner===moneySession().owner);
  if(!accounts.length){openMoneyAccount();return;}
  const expected=entry?LifeMoney.copy(entry):undefined,id=entry?.id || createId(),detail=entry?.loan?LifeMoney.loanDetail(ledger,id,getTodayKey()):null;
  const expectedPayments=ledger.entries.filter(e=>e.scheduleId===id);
  let firstDate=entry?.loan?.startDate || entry?.dueDate || getTodayKey();
  if(entry && !entry.loan){for(let month=0;month<=1200;month++){const date=LifeMoney.monthDate(entry.dueDate,month);if(!date || date>=getTodayKey()){firstDate=date || entry.dueDate;break;}}}
  if(entry && !entry.loan){const unpaid=LifeMoney.upcoming(ledger,LifeMoney.monthDate(getTodayKey(),2)).find(e=>e.scheduleId===id);if(unpaid)firstDate=unpaid.dueDate;}
  moneyDialogForm(entry?.loan?'Edit loan':'Add loan','loan-'+(entry?.id || 'new'),{title:entry?.title || '',bank:entry?.loan?.bank || '',balance:entry?.loan?(entry.loan.balanceCents/100).toFixed(2):'',balanceDate:entry?.loan?.balanceDate || getTodayKey(),amount:entry?(entry.amountCents/100).toFixed(2):'',accountId:entry?.accountId || accounts[0].id,dueDate:firstDate,remaining:detail?String(detail.remaining):'',termMode:'payments',endMonth:entry?.endDate?.slice(0,7) || '',finalAmount:entry?.loan?.finalCents!==undefined?(entry.loan.finalCents/100).toFixed(2):'',note:entry?.note || ''},({form,field,draft})=>{
    field('Loan name','title');field('Bank / lender','bank');field('Balance shown by bank (RM)','balance');field('Statement date','balanceDate','date');field('Monthly instalment (RM)','amount');
    const account=field('Pay from','accountId','text',accounts.map(a=>[a.id,a.name]));
    const first=field('First tracked due date','dueDate','date');const used=Boolean(entry && ledger.entries.some(e=>e.scheduleId===id));account.input.disabled=used;first.input.disabled=used && Boolean(entry.loan);
    field('Remaining term','termMode','text',[['payments','Number of repayments'],['end','Final repayment month']]);
    const count=field('Repayments left','remaining'),month=field('Final repayment month','endMonth','month');count.input.inputMode='numeric';
    const toggle=()=>{count.wrapper.hidden=draft.termMode!=='payments';month.wrapper.hidden=draft.termMode!=='end';};form.addEventListener('change',toggle);toggle();
    field('Final instalment (RM, if different)','finalAmount');field('Notes (optional)','note','textarea');
    form.append(planningNode('p','money-message','Bank balance and scheduled repayments are different figures. Neither is an early-settlement quote.'));
  },(draft,boardId)=>{
    if(draft.balanceDate>getTodayKey())throw new Error('The statement date cannot be in the future.');
    const paid=entry?ledger.entries.filter(e=>e.scheduleId===id && !e.voidedAt && e.status==='settled' && e.occurrenceDate>=draft.dueDate).length:0;
    let remaining;
    if(draft.termMode==='end'){
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.endMonth))throw new Error('Choose the final repayment month.');
      const [ey,em]=draft.endMonth.split('-').map(Number),[sy,sm]=draft.dueDate.split('-').map(Number);remaining=(ey-sy)*12+em-sm+1-paid;
    }else {if(!/^\d+$/.test(draft.remaining))throw new Error('Enter a whole number of repayments.');remaining=Number(draft.remaining);}
    const now=Date.now(),next={...expected,id,title:draft.title.trim(),kind:'expense',status:'planned',repeat:'monthly',accountId:draft.accountId,amountCents:LifeMoney.cents(draft.amount),date:entry?.date || draft.dueDate,dueDate:entry?.dueDate || draft.dueDate,category:entry?.category || 'Loans',note:draft.note,loan:{...entry?.loan,bank:draft.bank.trim(),balanceCents:LifeMoney.cents(draft.balance),balanceDate:draft.balanceDate,balanceUpdatedAt:now,startDate:draft.dueDate}};
    if(entry?.loan && next.loan.balanceCents===entry.loan.balanceCents && next.loan.balanceDate===entry.loan.balanceDate)next.loan.balanceUpdatedAt=entry.loan.balanceUpdatedAt || 0;
    else next.loan.balancePaymentIds=ledger.entries.filter(e=>e.scheduleId===id && !e.voidedAt && e.status==='settled' && e.date===draft.balanceDate).map(e=>e.id);
    if(draft.finalAmount.trim())next.loan.finalCents=LifeMoney.cents(draft.finalAmount);else delete next.loan.finalCents;
    commitMoney(boardId,current=>{
      if(!LifeMoney.equal(current.entries.filter(e=>e.scheduleId===id),expectedPayments))throw new Error('Repayment records changed while this form was open. Reopen the loan before changing its remaining term.');
      return LifeMoney.saveLoan(current,next,expected,remaining,now);
    });
  });
}

function linkMoneyLoan() {
  const ledger=moneyLedger(),options=ledger.entries.filter(e=>e.kind==='expense' && e.repeat==='monthly' && !e.loan && !e.voidedAt && (moneySession().owner==='all' || ledger.accounts.find(a=>a.id===e.accountId)?.owner===moneySession().owner));
  moneyDialogForm('Use an existing payment','loan-link',{scheduleId:options[0]?.id || ''},({field})=>field('Recurring payment','scheduleId','text',options.map(e=>[e.id,e.title+' · '+moneyFormat(e.amountCents)])),(draft,boardId)=>{
    const current=moneyLedger().entries.find(e=>e.id===draft.scheduleId);
    if(!current || current.loan || current.voidedAt)throw new Error('Choose an existing recurring payment without a loan record.');
    window.setTimeout(()=>{if(state.activeBoardId===boardId)openMoneyLoan(current);},0);
  });
}

function openMoneyLoanOptions(entry) {
  const boardId=state.activeBoardId,dialog=dailyDialog(entry.title),actions=planningNode('div','money-actions');dialog.append(actions);
  actions.append(planningButton('Edit loan',()=>{dialog.close();openMoneyLoan(entry);},'pencil'));
  const detail=LifeMoney.loanDetail(moneyLedger(),entry.id,getTodayKey());
  const next=detail.nextDate && LifeMoney.upcoming(moneyLedger(),detail.nextDate).find(e=>e.scheduleId===entry.id);
  if(next && !entry.voidedAt)actions.append(planningButton('Record instalment',()=>{dialog.close();openMoneySettle(next);},'check'));
  actions.append(planningButton(entry.voidedAt?'Restore loan':'Remove loan',async()=>{
    if(!entry.voidedAt && !await confirmTaskAction('Remove this loan from the tracker?','This stops its forecast payments. It does not pay off the bank. Existing payment history remains available.','Remove loan',{danger:true}))return;
    try{commitMoney(boardId,current=>{const record={...entry};if(record.voidedAt)delete record.voidedAt;else record.voidedAt=Date.now();return LifeMoney.change(current,'entries',record,entry);});dialog.close();}catch(e){dialog.append(planningNode('p','money-message',e.message));}
  },entry.voidedAt?'rotate-ccw':'trash-2'));
  const history=planningNode('details','money-history');history.append(planningNode('summary','','Edit history & timestamps'));
  for(const version of entry.history || []){const block=moneyVersion(version.record);block.prepend(planningNode('p','',formatRecordDateTime(version.at)));history.append(block);}dialog.append(history);
}
function openMoneyReconcile(account) {
  const boardId=state.activeBoardId,expected=LifeMoney.copy(account),openingLedger=moneyLedger(),openingBalance=LifeMoney.balance(openingLedger,account.id,getTodayKey());
  const credit=LifeMoney.isCredit(account);
  moneyDialogForm('Check balance','check-'+account.id,{actual:((credit?-openingBalance:openingBalance)/100).toFixed(2),note:''},({form,field})=>{field(credit?'Total outstanding debt shown by bank (RM)':'Balance shown by your bank / wallet (RM)','actual');field('Reason for difference (optional)','note','textarea');form.append(planningNode('p','money-message','A difference creates a dated balance adjustment. It is not counted as income or spending.'));},async(draft)=>{
    const adjustmentId='check_'+(await LifeStateMerge.fingerprint({accountId:account.id,previousCheck:account.reconciliationId || 'opening'})).slice(0,32);
    commitMoney(boardId,current=>{
      if(!LifeMoney.equal(current,openingLedger))throw new Error('Money records changed while you checked the balance. Reopen Check balance.');
      const actual=LifeMoney.cents(draft.actual,{signed:credit})*(credit?-1:1),delta=actual-openingBalance,now=Date.now();let next=current;
      next=LifeMoney.change(next,'entries',{id:adjustmentId,kind:'adjustment',title:'Balance check · '+account.name,amountCents:delta,accountId:account.id,status:'settled',date:getTodayKey(),dueDate:getTodayKey(),repeat:'none',category:'Adjustment',note:draft.note,checkedBalanceCents:actual},undefined,now);
      return LifeMoney.change(next,'accounts',{...expected,reconciledAt:now,reconciliationId:adjustmentId},expected,now);
    });
  });
}
function openMoneyBudget(budget) {
  const owner=moneySession().owner==='villa'?'villa':'personal';
  moneyDialogForm('Monthly budget','budget-'+(budget?.id || owner),{owner:budget?.owner || owner,month:budget?.month || getTodayKey().slice(0,7),category:budget?.category || 'All',limit:budget?(budget.limitCents/100).toFixed(2):''},({field})=>{
    field('Money belongs to','owner','text',Object.entries(moneyOwners).filter(([key])=>key!=='all'));field('Budget month','month','month');field('Budget category','category','text',['All',...moneyCategories].map(label=>[label,label]));field('Spending limit (RM)','limit');
  },(draft,boardId)=>{
    const id=LifeMoney.budgetId(draft.owner,draft.month,draft.category);
    if(budget && id!==budget.id)throw new Error('Create a separate budget for another month or category. Historical budgets are kept.');
    commitMoney(boardId,current=>LifeMoney.change(current,'budgets',{...budget,id,owner:draft.owner,month:draft.month,category:draft.category,limitCents:LifeMoney.cents(draft.limit)},budget));
  });
}
function moneyVersion(record) {
  const node=planningNode('div','planner-conflict-version');
  node.append(planningNode('strong','',record.title || record.name || record.month+' · '+record.category));
  for(const [label,key] of [['Amount','amountCents'],['Opening','openingCents'],['Reserve','reservedCents'],['Budget','limitCents'],['Account','accountId'],['Owner','owner'],['Status','status'],['Recorded date','date'],['Due date','dueDate'],['Repeat','repeat'],['Reference','reference'],['Notes','note']])if(record[key]!==undefined)node.append(planningNode('p','',label+': '+(key.endsWith('Cents')?moneyFormat(record[key]):record[key])));
  if(record.loan)node.append(planningNode('p','','Bank: '+record.loan.bank),planningNode('p','','Statement balance: '+moneyFormat(record.loan.balanceCents)+' · '+record.loan.balanceDate),planningNode('p','','Tracked repayment count: '+record.loan.installments));
  if(record.paymentPlan)node.append(planningNode('p','','Card instalments: '+record.paymentPlan.count+' payments; final '+moneyFormat(record.paymentPlan.finalCents ?? record.amountCents)));
  if(record.monthBill)node.append(planningNode('p','','Card bill payment month: '+record.monthBill),planningNode('p','','Covered repayments: '+(record.coveredPaymentIds || []).join(', ')));
  if(record.type)node.append(planningNode('p','','Account type: '+(record.type==='credit'?'Credit card (debt)':'Bank / cash')));
  if(record.voidedAt)node.append(planningNode('p','','Voided'));return node;
}
function openMoneyOptions(entry) {
  if(entry.loan && entry.repeat==='monthly'){openMoneyLoanOptions(entry);return;}
  const boardId=state.activeBoardId,dialog=dailyDialog(entry.title),actions=planningNode('div','money-actions');dialog.append(actions);
  const bill=LifeMoney.coveringBill(moneyLedger(),entry),billCleared=entry.monthBill && entry.status==='planned' && LifeMoney.billRemaining(moneyLedger(),entry)===0;
  if(bill)dialog.append(planningNode('p','money-message','Included in '+bill.title+' for '+bill.monthBill+'. Record payment on the bill only.'));
  if(entry.voidedAt){actions.append(planningButton('Restore entry',()=>{try{commitMoney(boardId,current=>{const next={...entry};delete next.voidedAt;if(next.scheduleId && next.status==='cancelled')next.status='planned';return LifeMoney.change(current,'entries',next,entry);});dialog.close();}catch(e){dialog.append(planningNode('p','money-message',e.message));}},'rotate-ccw'));}
  else if(entry.kind!=='adjustment')actions.append(planningButton('Edit entry',()=>{dialog.close();openMoneyEntry(entry.kind,entry);},'pencil'));
  if(!entry.voidedAt && !bill && !billCleared && ['planned','released'].includes(entry.status) && entry.repeat!=='monthly')actions.append(planningButton(entry.kind==='income'?'Mark received':entry.kind==='expense' && LifeMoney.isCredit(moneyLedger().accounts.find(a=>a.id===entry.accountId))?'Record card charge':'Mark paid',()=>{dialog.close();openMoneySettle(entry);},'check'));
  if(!entry.voidedAt && entry.kind==='expense' && entry.repeat==='monthly')actions.append(planningButton('Track as loan',()=>{dialog.close();openMoneyLoan(entry);},'plus'));
  if(!entry.virtual){const history=planningNode('details','money-history');history.append(planningNode('summary','','Edit history & timestamps'));for(const version of entry.history || []){const block=moneyVersion(version.record);block.prepend(planningNode('p','',formatRecordDateTime(version.at)));history.append(block);}history.append(planningNode('p','','Created '+formatRecordDateTime(entry.createdAt)),planningNode('p','','Last edited '+formatRecordDateTime(entry.updatedAt)));dialog.append(history);}
  actions.append(planningButton(entry.virtual?'Cancel this occurrence':'Void entry',async()=>{
    const agreed=await confirmTaskAction(entry.virtual?'Cancel this payment?':'Void this money entry?',entry.repeat==='monthly'?'This stops future occurrences. Payments already recorded remain in history.':'This excludes the entry from balances without erasing its history.','Confirm void',{danger:true});
    if(!agreed)return;
    try{commitMoney(boardId,current=>{
      if(entry.virtual && !LifeMoney.equal(LifeMoney.upcoming(current,entry.dueDate).find(e=>e.id===entry.id),entry))throw new Error('This scheduled payment changed. Review it again.');
      const next={...entry,voidedAt:Date.now(),status:entry.virtual?'cancelled':entry.status};delete next.virtual;
      return LifeMoney.change(current,'entries',next,entry.virtual?undefined:entry);
    });dialog.close();}catch(e){dialog.append(planningNode('p','money-message',e.message));}
  },'trash-2'));
}
function moneyCardAccounts(ledger) {
  return ledger.accounts.filter(a=>LifeMoney.isCredit(a) && (moneySession().owner==='all' || a.owner===moneySession().owner));
}
function openMoneyCardPlan(entry) {
  const ledger=moneyLedger(),cards=moneyCardAccounts(ledger),banks=ledger.accounts.filter(a=>!LifeMoney.isCredit(a));
  if(!cards.length){openMoneyAccount(undefined,true);return;}
  if(!banks.length){openMoneyAccount();return;}
  const id=entry?.id || createId(),expected=entry?LifeMoney.copy(entry):undefined,chargeId='charge_'+id;
  const card=cards.find(c=>c.id===entry?.toAccountId) || cards[0],bank=banks.find(a=>a.id===entry?.accountId) || banks.find(a=>a.owner===card.owner) || banks[0];
  const defaults={title:entry?.title || '',accountId:bank.id,toAccountId:card.id,amount:entry?(entry.amountCents/100).toFixed(2):'',count:String(entry?.paymentPlan.count || 12),dueDate:entry?.dueDate || getTodayKey(),finalAmount:entry?.paymentPlan.finalCents!==undefined?(entry.paymentPlan.finalCents/100).toFixed(2):'',mode:'existing',purchaseAmount:'',purchaseDate:getTodayKey(),category:entry?.category || 'Personal Spending',note:entry?.note || ''};
  moneyDialogForm(entry?'Edit card instalments':'Add card instalments','card-plan-'+(entry?.id || 'new'),defaults,({form,field,draft})=>{
    field('Commitment name','title');field('Credit card','toAccountId','text',cards.map(a=>[a.id,a.name]));field('Pay from','accountId','text',banks.map(a=>[a.id,a.name]));
    field('Monthly payment (RM)','amount');const count=field(entry?'Total tracked payments':'Payments left to track','count','number');count.input.min='1';count.input.max='1200';count.input.step='1';
    field('First tracked payment date','dueDate','date');field('Final payment (RM, optional)','finalAmount');
    if(!entry){
      field('Purchase record','mode','text',[['existing','Existing debt - already in card balance'],['new','New purchase - record spending too']]);
      const purchase=field('Full purchase price (RM)','purchaseAmount'),date=field('Purchase date','purchaseDate','date'),category=field('Category','category','text',moneyCategoryOptions());
      const update=()=>{purchase.wrapper.hidden=date.wrapper.hidden=category.wrapper.hidden=draft.mode!=='new';};form.addEventListener('change',update);update();
    }
    field('Notes (optional)','note','textarea');
    form.append(planningNode('p','money-message',entry?'Total tracked payments includes those already paid. Existing repayments and purchase records are kept.':'Monthly repayments reduce your bank balance and card debt, not your spending again. Existing debt must already be included in the opening or checked card balance.'));
  },(draft,boardId)=>commitMoney(boardId,current=>{
    if(!/^\d+$/.test(draft.count))throw new Error('Enter a whole number of payments.');
    if(expected && current.entries.some(e=>e.scheduleId===id) && (draft.accountId!==expected.accountId || draft.toAccountId!==expected.toAccountId || draft.dueDate!==expected.dueDate))throw new Error('Accounts and first payment date are fixed after repayments exist.');
    const count=Number(draft.count),plan={count};if(draft.finalAmount.trim())plan.finalCents=LifeMoney.cents(draft.finalAmount);
    const next={...expected,id,title:draft.title.trim(),kind:'transfer',status:'planned',repeat:'monthly',accountId:draft.accountId,toAccountId:draft.toAccountId,amountCents:LifeMoney.cents(draft.amount),date:expected?.date || draft.dueDate,dueDate:draft.dueDate,endDate:LifeMoney.monthDate(draft.dueDate,count-1),category:draft.category,note:draft.note,paymentPlan:plan};
    let result=LifeMoney.change(current,'entries',next,expected);
    if(!entry && draft.mode==='new'){
      if(draft.purchaseDate>getTodayKey())throw new Error('Record a purchase only once it has happened.');
      result=LifeMoney.change(result,'entries',{id:chargeId,title:draft.title.trim(),kind:'expense',status:'settled',repeat:'none',accountId:draft.toAccountId,amountCents:LifeMoney.cents(draft.purchaseAmount),date:draft.purchaseDate,dueDate:draft.purchaseDate,category:draft.category,note:draft.note,linkedPlanId:id},undefined);
    }
    return result;
  }));
}
function openMoneyCardBill(entry) {
  const ledger=moneyLedger(),cards=moneyCardAccounts(ledger),banks=ledger.accounts.filter(a=>!LifeMoney.isCredit(a));
  if(!cards.length){openMoneyAccount(undefined,true);return;}if(!banks.length){openMoneyAccount();return;}
  const expected=entry?LifeMoney.copy(entry):undefined,id=entry?.id || createId();
  let coveredPaymentIds=entry?.coveredPaymentIds || [];
  moneyDialogForm(entry?'Edit card bill':'Add card bill','card-bill-'+(entry?.id || 'new'),{title:entry?.title || 'Credit-card bill',toAccountId:entry?.toAccountId || cards[0].id,accountId:entry?.accountId || banks.find(a=>a.owner===cards[0].owner)?.id || banks[0].id,amount:entry?((entry.status==='planned'?LifeMoney.billRemaining(ledger,entry):entry.amountCents)/100).toFixed(2):'',dueDate:entry?.dueDate || getTodayKey(),note:entry?.note || ''},({form,field,draft})=>{
    field('Bill name','title');field('Credit card','toAccountId','text',cards.map(a=>[a.id,a.name]));field('Pay from','accountId','text',banks.map(a=>[a.id,a.name]));field('Amount still to pay (RM)','amount');field('Payment due date','dueDate','date');field('Notes (optional)','note','textarea');
    const notice=planningNode('p','money-message');form.append(notice);
    const update=()=>{if(!LifeMoney.validDate(draft.dueDate))return;const month=draft.dueDate.slice(0,7),rows=LifeMoney.upcoming(ledger,month+'-'+new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate()).filter(e=>e.kind==='transfer' && e.toAccountId===draft.toAccountId && !e.monthBill && e.dueDate.startsWith(month));coveredPaymentIds=[...new Set([...(entry?.monthBill===month && entry.toAccountId===draft.toAccountId?entry.coveredPaymentIds || []:[]),...rows.map(e=>e.id)])];notice.textContent='Use the total remaining bill, including instalments due this payment month. '+(coveredPaymentIds.length?coveredPaymentIds.length+' scheduled card repayment(s) will be covered, not added again. ':'')+'This does not create a purchase or change card debt until a payment is recorded.';};form.addEventListener('change',update);update();
  },async(draft,boardId)=>{
    const recordId=entry?.id || 'cardbill_'+(await LifeStateMerge.fingerprint({cardId:draft.toAccountId,month:draft.dueDate.slice(0,7)})).slice(0,32);
    return commitMoney(boardId,current=>{
      if(expected && current.entries.some(e=>e.billId===id) && (draft.accountId!==expected.accountId || draft.toAccountId!==expected.toAccountId || draft.dueDate!==expected.dueDate))throw new Error('Payments already exist. Keep this bill on its original card, bank and payment date.');
      if(!entry && current.entries.some(e=>e.id===recordId))throw new Error('A bill for this credit card and payment month already exists. Edit or restore it instead.');
      const amountCents=LifeMoney.cents(draft.amount),partial=current.entries.filter(e=>e.billId===id && !e.voidedAt && e.status==='settled').reduce((sum,e)=>sum+e.amountCents,0);
      return LifeMoney.change(current,'entries',{...expected,id:recordId,title:draft.title.trim(),kind:'transfer',status:expected?.status || 'planned',repeat:'none',accountId:draft.accountId,toAccountId:draft.toAccountId,amountCents,billTotalCents:amountCents+partial,date:expected?.date || draft.dueDate,dueDate:draft.dueDate,monthBill:draft.dueDate.slice(0,7),coveredPaymentIds,category:'Credit-card repayment',note:draft.note},expected);
    });
  });
}
function renderMoneyCredit(root,ledger,session) {
  const today=getTodayKey(),cards=moneyCardAccounts(ledger),plans=LifeMoney.cardPlans(ledger,today,'all');
  const actions=planningNode('div','money-actions');actions.append(planningButton('Add credit card',()=>openMoneyAccount(undefined,true),'plus'),planningButton('Add card instalments',()=>openMoneyCardPlan(),'plus'));root.append(actions);
  if(!cards.length){root.append(planningNode('p','money-empty','No credit cards recorded. Your existing bank balances are unchanged.'));return;}
  for(const account of cards){
    const section=planningNode('section','money-credit-section');section.setAttribute('aria-label',account.name);
    const heading=planningNode('header','money-section-heading'),name=planningNode('div'),balance=LifeMoney.balance(ledger,account.id,today);
    name.append(planningNode('h3','',account.name),planningNode('p','money-message',moneyOwners[account.owner]+' · '+(balance===null?'Opening date is in the future':balance>0?moneyFormat(balance)+' credit balance':moneyFormat(-balance)+' outstanding')));heading.append(name,planningIcon('Edit account: '+account.name,()=>openMoneyAccount(account),'pencil'));section.append(heading);
    const cardActions=planningNode('div','money-actions');cardActions.append(planningButton('Check balance',()=>openMoneyReconcile(account),'check'));section.append(cardActions);
    const items=plans.filter(p=>p.entry.toAccountId===account.id);
    for(const item of items){const row=planningNode('article','money-commitment');const copy=planningNode('div');copy.append(planningNode('strong','',item.entry.title),planningNode('small','',item.remaining+' of '+item.entry.paymentPlan.count+' payments left'+(item.finishDate?' · ends '+formatReadableDateKey(item.finishDate):'')),planningNode('small','',moneyFormat(item.remainingCents)+' remaining scheduled repayments'));row.append(copy,planningNode('strong','',moneyFormat(item.entry.amountCents)+'/mo'),planningIcon('Options: '+item.entry.title,()=>openMoneyOptions(item.entry),'more-vertical'));section.append(row);}
    const bills=ledger.entries.filter(e=>e.toAccountId===account.id && e.monthBill && !e.voidedAt && e.status!=='cancelled').sort((a,b)=>b.dueDate.localeCompare(a.dueDate));
    if(bills.length){section.append(planningNode('h4','money-list-divider','Card bills'));renderMoneyRows(section,bills,ledger);}
    const due=LifeMoney.upcoming(ledger,moneyEnd(session)).filter(e=>e.toAccountId===account.id && !e.monthBill);
    if(due.length){section.append(planningNode('h4','money-list-divider','Scheduled repayments'));renderMoneyRows(section,due,ledger);}
    if(!items.length && !bills.length)section.append(planningNode('p','money-empty','Add your instalment commitments or a dated total bill. Purchases are recorded separately against this card.'));
    root.append(section);
  }
}
function renderMoneyMonth(root,ledger,session,change) {
  const monthly=LifeMoney.monthly(ledger,session.month,getTodayKey(),session.owner),section=planningNode('section','money-month-review');section.setAttribute('aria-label','Monthly spending');
  const heading=planningNode('header','money-section-heading'),input=planningInput('month',session.month,value=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(value))change('month',value);});
  heading.append(planningNode('h3','','Monthly spending'),planningField('Spending month',input));section.append(heading);
  const stats=planningNode('div','money-month-totals');stats.append(moneyStat('Spent',monthly.spentCents,'Purchases and recorded expenses'),moneyStat('Income received',monthly.receivedCents,'Money received, not expected'),moneyStat('Card repayments',monthly.repaymentsCents,'Cash paid to cards; not spending again'));section.append(stats);
  const list=planningNode('div','money-category-totals');
  for(const category of monthly.categories){const row=planningNode('div');row.append(planningNode('span','',category.name),planningNode('strong','',moneyFormat(category.spentCents)));list.append(row);}section.append(list);root.append(section);
}
function moneyStat(label,value,detail,warning=false) {
  const node=planningNode('div','money-stat'+(warning?' is-warning':''));node.append(planningNode('span','',label),planningNode('strong','',moneyFormat(value)),planningNode('small','',detail));return node;
}
function renderMoneyRows(root,rows,ledger) {
  if(!rows.length){root.append(planningNode('p','money-empty','No entries for this view.'));return;}
  for(const entry of rows) {
    const row=planningNode('article','money-row'),copy=planningNode('div','money-row-copy'),account=ledger.accounts.find(a=>a.id===entry.accountId);
    const destination=ledger.accounts.find(a=>a.id===entry.toAccountId),cardRepayment=entry.kind==='transfer' && LifeMoney.isCredit(destination);
    const frequency=entry.paymentPlan?entry.paymentPlan.count+' monthly payments':entry.repeat==='monthly'?'Every month':entry.scheduleId?'Monthly occurrence':'One time';
    copy.append(planningNode('strong','',entry.title),planningNode('small','',[(entry.status==='settled'?entry.date:entry.dueDate),cardRepayment?account?.name+' → '+destination.name:account?.name,entry.category,entry.source,frequency,entry.voidedAt?'Voided':entry.status==='cancelled'?'Cancelled':entry.status==='released'?'Released, not received':entry.status==='planned'?'Upcoming':cardRepayment?'Repaid (not new spending)':'Recorded'].filter(Boolean).join(' · ')));
    const value=planningNode('strong','money-row-amount '+(entry.kind==='expense'?'is-outgoing':''),moneyFormat(entry.remainingCents ?? (entry.monthBill && entry.status==='planned'?LifeMoney.billRemaining(ledger,entry):entry.amountCents)));
    const original={...entry};delete original.effectCents;delete original.remainingCents;
    row.append(copy,value,planningIcon('Options: '+entry.title,()=>openMoneyOptions(original),'more-vertical'));root.append(row);
  }
}
function renderMoneyPurchaseRows(root,rows,ledger,paid=false) {
  if(!rows.length){root.append(planningNode('p','money-empty',paid?'No confirmed purchases yet.':'No planned purchases in this category.'));return;}
  for(const entry of rows){
    const row=planningNode('article','money-purchase-row'+(paid?' is-purchased':'')),copy=planningNode('div','money-purchase-copy');
    copy.append(planningNode('strong','',entry.title));
    const meta=planningNode('div','money-purchase-meta');meta.append(planningNode('span','money-category-label',entry.category || 'Others'),planningNode('span','',(paid?'Paid ':'Target ')+formatReadableDateKey(paid?entry.date:entry.dueDate)));
    if(ledger.accounts.length>1)meta.append(planningNode('span','',ledger.accounts.find(a=>a.id===entry.accountId)?.name || ''));
    if(!paid && entry.purchaseIntent!=='considering')meta.append(planningNode('span','money-commitment-label','Committed, unpaid'));
    copy.append(meta);
    if(entry.note){const notes=planningNode('details','money-purchase-note');notes.append(planningNode('summary','','Notes'),planningNode('p','',entry.note));copy.append(notes);}
    const actions=planningNode('div','money-purchase-actions');
    if(!paid)actions.append(planningIcon('Confirm purchase: '+entry.title,()=>openMoneySettle(entry,{purchase:true}),'check'));
    actions.append(planningIcon('Options: '+entry.title,()=>openMoneyOptions(entry),'more-vertical'));
    row.append(copy,planningNode('strong','money-purchase-amount',moneyFormat(entry.amountCents)),actions);root.append(row);
  }
}
function renderMoneyPurchases(root,ledger,session,end) {
  const data=LifeMoney.purchases(ledger,getTodayKey(),session.owner,session.purchaseCategory);
  if(!moneyConflict()){
    const stats=planningNode('div','money-stats money-spending-stats');stats.append(moneyStat('Budget needed',data.plannedCents,data.planned.length+' planned item'+(data.planned.length===1?'':'s')+' · '+moneyFormat(data.committedCents)+' committed, unpaid'),moneyStat('Confirmed spent',data.purchasedCents,data.purchased.length+' paid purchase'+(data.purchased.length===1?'':'s')+' · already in actual spending'));root.append(stats);
  }
  if(data.categories.length){
    const categories=planningNode('details','money-category-breakdown');categories.open=innerWidth>700;categories.append(planningNode('summary','','Budget by category'));
    const table=planningNode('table');table.setAttribute('aria-label','Purchase totals by category');const head=planningNode('thead'),headRow=planningNode('tr');
    for(const label of ['Category','Budget needed','Spent'])headRow.append(planningNode('th','',label));head.append(headRow);table.append(head);const tbody=planningNode('tbody');
    for(const cat of data.categories){const row=planningNode('tr');const name=planningNode('th','',cat.name || 'Others');name.scope='row';row.append(name,planningNode('td','',moneyFormat(cat.plannedCents)),planningNode('td','',moneyFormat(cat.purchasedCents)));tbody.append(row);}table.append(tbody);categories.append(table);root.append(categories);
  }
  const sections=planningNode('div','money-purchase-sections');
  for(const paid of [false,true]){
    const section=planningNode('section','money-purchase-section'),heading=planningNode('header','money-section-heading'),title=planningNode('div');
    section.setAttribute('aria-label',paid?'Confirmed purchases':'Planned purchases');title.append(planningNode('h3','',paid?'Confirmed purchases':'Planned purchases'),planningNode('p','money-message',paid?'Paid and recorded.':"What you'd like to buy. Not spent yet."));
    heading.append(title,planningIcon(paid?'Record purchase':'Add planned purchase',()=>openMoneySpending(paid?'settled':'planned'),'plus'));section.append(heading);
    if(paid)renderMoneyPurchaseRows(section,data.purchased,ledger,true);
    else {
      const soon=data.planned.filter(e=>e.dueDate<=end),later=data.planned.filter(e=>e.dueDate>end);
      if(soon.length || !later.length)renderMoneyPurchaseRows(section,soon,ledger);
      if(later.length){section.append(planningNode('h4','money-list-divider','Later planned spending'));renderMoneyPurchaseRows(section,later,ledger);}
    }sections.append(section);
  }root.append(sections);
}
function renderMoneyLoans(root,ledger,owner) {
  const totals=LifeMoney.loanTotals(ledger,getTodayKey(),owner),actions=planningNode('div','money-actions');
  if(ledger.entries.some(e=>!e.voidedAt && !e.loan && e.kind==='expense' && e.repeat==='monthly' && (owner==='all' || ledger.accounts.find(a=>a.id===e.accountId)?.owner===owner)))actions.append(planningButton('Use existing payment',linkMoneyLoan,'link'));
  if(actions.children.length)root.append(actions);
  if(totals.rows.length>1 && !moneyConflict()){
    const stats=planningNode('div','money-stats money-loan-stats');stats.append(moneyStat('Total bank balances',totals.balanceCents,'From your dated bank statements'),moneyStat('Monthly instalments',totals.monthlyCents,'Included once in upcoming payments'));root.append(stats);
  }else if(!totals.rows.length)root.append(planningNode('p','money-empty','No loans recorded for this money view.'));
  const render=item=>{
    const row=planningNode('article','money-loan'),heading=planningNode('div','money-loan-heading'),name=planningNode('div');
    name.append(planningNode('h3','',item.entry.title),planningNode('small','',item.entry.loan.bank+' · '+(ledger.accounts.find(a=>a.id===item.entry.accountId)?.name || '')));
    heading.append(name,planningIcon('Loan options: '+item.entry.title,()=>openMoneyLoanOptions(item.entry),'more-vertical'));row.append(heading);
    const values=planningNode('dl','money-loan-values');
    for(const [label,value] of [['Bank balance',moneyFormat(item.balanceCents)],['Monthly instalment',moneyFormat(item.entry.amountCents)],['Repayments left',String(item.remaining)],['Next due',item.nextDate?formatReadableDateKey(item.nextDate):'None scheduled'],['Scheduled finish',item.finishDate?formatReadableDateKey(item.finishDate):'No payments left'],['Scheduled total',moneyFormat(item.scheduledCents)]]){
      const cell=planningNode('div');cell.append(planningNode('dt','',label),planningNode('dd','',value));values.append(cell);
    }row.append(values,planningNode('p','money-message','Bank balance as of '+formatReadableDateKey(item.balanceDate)));
    if(item.entry.loan.finalCents!==undefined)row.append(planningNode('p','money-message','Final instalment: '+moneyFormat(item.entry.loan.finalCents)));
    if(item.overdue && !item.entry.voidedAt)row.append(planningNode('p','money-alert',item.overdue+' overdue repayment'+(item.overdue===1?'':'s')+' still included.'));
    if(item.balanceNeedsUpdate && !item.entry.voidedAt)row.append(planningNode('p','money-message','Payments recorded since this balance. Update the bank statement balance when available.'));
    if(!item.remaining && item.balanceCents>0)row.append(planningNode('p','money-alert','No payments scheduled, but the bank balance is not zero. Check the remaining term or settlement amount.'));
    else if(item.remaining && item.balanceCents>item.scheduledCents)row.append(planningNode('p','money-message','Scheduled repayments are below the bank balance. Check the term and any final or balloon payment.'));
    return row;
  };
  for(const item of totals.rows)root.append(render(item));
  const removed=LifeMoney.loans(ledger,getTodayKey(),owner).filter(item=>item.entry.voidedAt);
  if(removed.length){const archive=planningNode('details','money-history');archive.append(planningNode('summary','','Removed loans ('+removed.length+')'));for(const item of removed)archive.append(render(item));root.append(archive);}
}
const moneySheetLabels={paid:'Paid',received:'Received',confirmed:'Confirmed upcoming',considering:'Considering',expected:'Expected income',transfer:'Transfers / repayments',adjustment:'Balance adjustments'};
function moneySheetEditable(entry){return ['expense','income'].includes(entry.kind) && entry.repeat==='none' && !entry.virtual && !['scheduleId','loan','paymentPlan','monthBill','billId','linkedPlanId'].some(key=>entry[key]);}
async function discardMoneySheetDraft(boardId,key,expected,{close=false}={}) {
  if(!await confirmTaskAction('Discard this row draft?','Your saved money record will not change. Only this unsaved row draft will be discarded.','Discard draft',{danger:true}))return;
  if(boardId!==state.activeBoardId)throw new Error('Return to the original board before discarding this draft.');
  const current=moneySession(boardId);
  if(!LifeMoney.equal(current.drafts[key],expected))throw new Error('This draft changed. Reopen it before discarding.');
  delete current.drafts[key];if(close && key==='sheet-'+current.sheetEdit)current.sheetEdit='';
  saveMoneySession(current,boardId);renderCardsOnly({force:true});
}
function moneySheetDrafts(root,ledger,session) {
  const drafts=Object.entries(session.drafts).filter(([key,draft])=>draft?.expected?.id && key==='sheet-'+draft.expected.id);
  if(!drafts.length)return;
  const boardId=state.activeBoardId,panel=planningNode('details','money-sheet-drafts');panel.append(planningNode('summary','','Unsaved row edits · '+drafts.length));
  const list=planningNode('ul'),error=planningNode('p','money-message');error.setAttribute('role','status');
  const report=e=>{error.textContent=e.message;if(!error.isConnected)setSaveStatus(e.message,'error');};
  for(const [key,draft] of drafts){
    const entry=ledger.entries.find(e=>e.id===draft.expected.id),available=entry && !entry.voidedAt && moneySheetEditable(entry);
    const title=draft.title || draft.expected.title || 'Untitled row',row=planningNode('li'),copy=planningNode('div','money-sheet-draft-copy'),actions=planningNode('div','money-actions');
    copy.append(planningNode('strong','money-sheet-draft-title',title),planningNode('small','',[draft.amount?'RM '+draft.amount:'',draft.date,'Unsaved · this tab'].filter(Boolean).join(' · ')));
    if(!available){copy.append(planningNode('small','','Saved row unavailable for table editing'));if(draft.note)copy.append(planningNode('p','money-sheet-draft-note',draft.note));}
    else if(!LifeMoney.equal(entry,draft.expected))copy.append(planningNode('small','','Saved row changed. Review before saving.'));
    if(available){const resume=planningButton('Resume',()=>{
      try{
        if(boardId!==state.activeBoardId)throw new Error('Return to the original board to resume this draft.');
        const current=moneySession(boardId),latest=moneyLedger(boardId).entries.find(e=>e.id===draft.expected.id);
        if(!current.drafts[key] || !latest || latest.voidedAt || !moneySheetEditable(latest))throw new Error('This row changed. Reopen the draft list.');
        // Follow the saved row, not the draft date; the existing stale-record guard still applies.
        current.month=(latest.status==='settled'?latest.date:latest.dueDate).slice(0,7);current.owner=moneyLedger(boardId).accounts.find(a=>a.id===latest.accountId).owner;
        current.purchaseCategory='';current.sheetBucket='all';current.sheetQuery='';current.sheetQueryDraft='';current.sheetEdit=latest.id;saveMoneySession(current,boardId);renderCardsOnly({force:true});document.querySelector('.money-sheet-edit-row input')?.focus();
      }catch(e){report(e);}
    },'pencil');resume.setAttribute('aria-label','Resume draft: '+title);actions.append(resume);}
    const discard=planningIcon('Discard draft: '+title,async()=>{try{await discardMoneySheetDraft(boardId,key,LifeMoney.copy(draft),{close:true});}catch(e){report(e);}},'trash-2');actions.append(discard);row.append(copy,actions);list.append(row);
  }
  panel.append(list,error);root.append(panel);
}
function moneySheetEditor(root,ledger,session,entry) {
  const boardId=state.activeBoardId,key='sheet-'+(entry?.id || 'new'),saved=session.drafts[key];
  const date=getTodayKey().startsWith(session.month)?getTodayKey():session.month+'-01';
  const preference=!entry && session.sheetKeepDetails?session.sheetDefaults[session.owner]:null;
  const retained=preference && ledger.accounts.some(a=>a.id===preference.accountId && (session.owner==='all' || a.owner===session.owner))?preference:null;
  const draft=saved || {id:entry?.id || createId(),expected:entry?LifeMoney.copy(entry):null,title:entry?.title || '',amount:entry?(entry.amountCents/100).toFixed(2):'',accountId:entry?.accountId || retained?.accountId || ledger.accounts.find(a=>session.owner==='all' || a.owner===session.owner)?.id || '',date:entry?(entry.status==='settled'?entry.date:entry.dueDate):date,category:entry?.category || session.purchaseCategory || retained?.category || (session.owner==='villa'?'Sunrise Villa':'Personal Spending'),stage:entry?(entry.kind==='income'?(entry.status==='settled'?'received':'expected'):entry.status==='settled'?'paid':entry.purchaseIntent==='considering'?'considering':'confirmed'):date>getTodayKey()?'confirmed':'paid',note:entry?.note || ''};
  const form=planningNode('form','money-sheet-editor');form.setAttribute('aria-label',entry?'Edit table row: '+entry.title:'New money row');
  const error=planningNode('p','money-message');error.setAttribute('role','status');
  let discard;
  const draftState=planningNode('small','money-sheet-draft-state',saved?'Unsaved · this tab':'');
  const remember=()=>{try{const current=moneySession(boardId);current.drafts[key]=draft;saveMoneySession(current,boardId);draftState.textContent='Unsaved · this tab';if(discard)discard.disabled=false;}catch{error.textContent='Draft could not be retained. Keep this row open until saved.';}};
  form.addEventListener('invalid',event=>{
    event.preventDefault();if(event.target!==form.querySelector(':invalid'))return;
    for(let parent=event.target.parentElement;parent && parent!==form;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
    error.textContent=event.target.validationMessage;requestAnimationFrame(()=>{if(form.isConnected)event.target.focus();});
  },true);
  let fieldRoot=form;
  const field=(label,property,type='text',options)=>{
    const input=options?moneySelect(options,draft[property],value=>{draft[property]=value;remember();}):planningInput(type,draft[property],value=>{draft[property]=value;remember();});
    if(property==='amount')input.inputMode='decimal';
    const wrapper=planningField(label,input);
    if(input.tagName==='SELECT'){
      const frame=planningNode('span','money-sheet-select');input.replaceWith(frame);frame.append(input);
    }
    fieldRoot.append(wrapper);return input;
  };
  field('Item','title').required=true;field('Amount (RM)','amount').required=true;
  const stages=entry?entry.status==='settled'?[draft.stage]:entry.kind==='income'?['expected']:['confirmed','considering']:['paid','confirmed','considering','received','expected'];
  field('Record status','stage','text',stages.map(value=>[value,moneySheetLabels[value]])).disabled=stages.length===1;
  const details=planningNode('details','money-sheet-details'),detailsHead=planningNode('summary','','Row details');detailsHead.setAttribute('aria-label','Row details');
  const detailsCopy=planningNode('small');detailsHead.append(detailsCopy);details.append(detailsHead);form.append(details);
  const detailFields=planningNode('div','money-sheet-detail-fields');details.append(detailFields);fieldRoot=detailFields;
  const categories=moneyCategoryOptions();if(draft.category && !categories.some(([value])=>value===draft.category))categories.push([draft.category,draft.category]);
  field('Category','category','text',categories);const dateInput=field('Paid / due date','date','date');dateInput.required=true;
  // Keep an existing/drafted account available across owner filters; never silently reassign it.
  field('Account','accountId','text',ledger.accounts.filter(a=>session.owner==='all' || a.owner===session.owner || a.id===draft.accountId).map(a=>[a.id,a.name+' · '+moneyOwners[a.owner]]));
  if(!entry){
    const keep=planningNode('input');keep.type='checkbox';keep.checked=session.sheetKeepDetails;keep.setAttribute('aria-label','Keep account and category');
    const label=planningNode('label','money-sheet-keep');label.append(keep,planningNode('span','','Keep account and category'));detailFields.append(label);
    const settingError='Repeat-entry setting was not saved. Your current row is unchanged.';
    keep.onchange=()=>{
      if(boardId!==state.activeBoardId){keep.checked=moneySession(boardId).sheetKeepDetails;error.textContent='Return to the original board before changing repeat-entry settings.';return;}
      const current=moneySession(boardId),before=current.sheetKeepDetails;current.sheetKeepDetails=keep.checked;
      try{saveMoneySession(current,boardId);if(error.textContent===settingError)error.textContent='';}catch{keep.checked=before;error.textContent=settingError;}
    };
  }
  const updateDetails=()=>{detailsCopy.textContent=[draft.category,ledger.accounts.find(a=>a.id===draft.accountId)?.name,draft.date].filter(Boolean).join(' · ');};form.addEventListener('input',updateDetails);form.addEventListener('change',updateDetails);updateDetails();
  const notes=planningNode('details','money-sheet-notes');notes.append(planningNode('summary','','Notes'));
  const note=planningNode('textarea');note.value=draft.note;note.setAttribute('aria-label','Row notes');note.oninput=()=>{draft.note=note.value;remember();};notes.append(note);detailFields.append(notes);form.append(error);
  const actions=planningNode('div','money-actions'),save=planningButton(entry?'Save row':'Add row',null,entry?'check':'plus');save.type='submit';
  const discardDraft=async()=>{try{await discardMoneySheetDraft(boardId,key,LifeMoney.copy(draft));}catch(e){error.textContent=e.message;if(!error.isConnected)setSaveStatus(e.message,'error');}};
  discard=entry?planningButton('Use latest saved row',discardDraft,'rotate-ccw'):planningIcon('Discard new row draft',discardDraft,'trash-2');discard.disabled=!saved;actions.append(discard);
  if(entry)actions.append(planningButton('Close row',()=>{const current=moneySession();current.sheetEdit='';saveMoneySession(current);renderCardsOnly({force:true});},'x'));
  actions.prepend(draftState);actions.append(save);form.append(actions);root.append(form);
  form.onsubmit=event=>{
    event.preventDefault();save.disabled=true;remember();
    try {
      const expected=draft.expected || undefined;
      if(entry && (!expected || expected.id!==entry.id))throw new Error('Reopen this row before editing.');
      const settled=['paid','received'].includes(draft.stage),kind=['received','expected'].includes(draft.stage)?'income':'expense';
      if(!LifeMoney.validDate(draft.date) || settled && draft.date>getTodayKey()){
        details.open=true;dateInput.focus();throw new Error(!LifeMoney.validDate(draft.date)?'Choose a valid paid or due date.':'A future payment is not paid yet. Choose an upcoming status.');
      }
      const next={...expected,id:draft.id,title:draft.title.trim(),amountCents:LifeMoney.cents(draft.amount),kind,accountId:draft.accountId,status:settled?'settled':expected?.status==='released'?'released':'planned',repeat:'none',date:settled?draft.date:expected?.date || draft.date,dueDate:settled?expected?.dueDate || draft.date:draft.date,category:draft.category,note:draft.note};
      if(kind==='expense' && !settled)next.purchaseIntent=draft.stage==='considering'?'considering':'committed';
      // Clear only this draft before the successful commit renders the next row.
      const current=moneySession(boardId),previousView={month:current.month,owner:current.owner,purchaseCategory:current.purchaseCategory,sheetBucket:current.sheetBucket,sheetQuery:current.sheetQuery,sheetQueryDraft:current.sheetQueryDraft,sheetDefaults:current.sheetDefaults};
      delete current.drafts[key];if(entry)current.sheetEdit='';
      current.month=(settled?next.date:next.dueDate).slice(0,7);
      const accountOwner=ledger.accounts.find(a=>a.id===next.accountId)?.owner;if(current.owner!=='all' && current.owner!==accountOwner)current.owner=accountOwner;
      if(!entry && current.sheetKeepDetails && accountOwner)current.sheetDefaults={...current.sheetDefaults,[current.owner]:{accountId:next.accountId,category:next.category}};
      if(current.purchaseCategory && current.purchaseCategory!==next.category)current.purchaseCategory='';if(current.sheetBucket!==draft.stage)current.sheetBucket='all';
      if(current.sheetQuery.trim() && ![next.title,next.note].some(text=>text.toLowerCase().includes(current.sheetQuery.trim().toLowerCase()))){current.sheetQuery='';current.sheetQueryDraft='';}
      saveMoneySession(current,boardId);
      try{commitMoney(boardId,value=>{
        if(next.source==='Airbnb' && next.reference && value.entries.some(e=>!e.voidedAt && e.id!==next.id && e.kind==='income' && e.source==='Airbnb' && e.reference===next.reference && e.accountId===next.accountId && e.dueDate===next.dueDate))throw new Error('A payout with this reference, account and expected date already exists. Edit it instead.');
        return LifeMoney.change(value,'entries',next,expected);
      });}
      catch(e){const restore=moneySession(boardId);Object.assign(restore,previousView);restore.drafts[key]=draft;if(entry)restore.sheetEdit=entry.id;saveMoneySession(restore,boardId);throw e;}
      const added=document.querySelector('.money-sheet-editor[aria-label="New money row"] input');added?.focus({preventScroll:true});
    }catch(e){error.textContent=e.message;save.disabled=false;}
  };
}
function moneySheetSearch(root,session) {
  const boardId=state.activeBoardId,tools=planningNode('div','money-controls money-sheet-tools'),form=planningNode('form','money-sheet-search');form.setAttribute('role','search');form.setAttribute('aria-label','Search money table');
  const error=planningNode('p','money-message');error.setAttribute('role','status');
  const apply=(patch,focus=false)=>{
    try{
      if(boardId!==state.activeBoardId)throw new Error('Return to the original board before changing this search.');
      const current=moneySession(boardId);Object.assign(current,patch);saveMoneySession(current,boardId);renderCardsOnly({force:true});if(focus)document.querySelector('.money-sheet-search input')?.focus({preventScroll:true});
    }catch(e){error.textContent=e.message;}
  };
  let clear;
  const input=planningInput('text',session.sheetQueryDraft,value=>{
    clear.disabled=!value && !session.sheetQuery;
    try{const current=moneySession(boardId);current.sheetQueryDraft=value;saveMoneySession(current,boardId);}catch{error.textContent='Search text could not be retained in this tab.';}
  });input.setAttribute('enterkeyhint','search');
  const submit=planningIcon('Search money rows',null,'search');submit.type='submit';
  clear=planningIcon('Clear money search',()=>apply({sheetQuery:'',sheetQueryDraft:''},true),'x');clear.disabled=!session.sheetQuery && !session.sheetQueryDraft;
  form.append(planningField('Search item or notes',input),submit,clear,error);form.onsubmit=event=>{event.preventDefault();apply({sheetQuery:input.value.trim(),sheetQueryDraft:input.value},true);};
  tools.append(form,planningField('Table order',moneySelect([['oldest','Date: oldest first'],['newest','Date: newest first']],session.sheetOrder,value=>apply({sheetOrder:value}))));root.append(tools);
}
function renderMoneySheet(root,ledger,session,change,summary,end) {
  const filters=planningNode('div','money-controls money-sheet-filters'),extra=planningNode('details','money-sheet-filter-panel');extra.append(planningNode('summary','',session.purchaseCategory || session.sheetBucket!=='all'?'Filters · active':'Filters'));
  const filterFields=planningNode('div','money-controls');filterFields.append(planningField('Table category',moneySelect([['','All categories'],...moneyCategoryOptions()],session.purchaseCategory,value=>change('purchaseCategory',value))),planningField('Table status',moneySelect([['all','All statuses'],...Object.entries(moneySheetLabels)],session.sheetBucket,value=>change('sheetBucket',value))));extra.append(filterFields);extra.open=Boolean(session.purchaseCategory || session.sheetBucket!=='all');
  const month=planningInput('month',session.month,()=>{});month.onblur=()=>{if(month.value!==session.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month.value))change('month',month.value);};
  filters.append(planningField('Table month',month),extra);root.append(filters);
  const balances=planningNode('div','money-stats money-sheet-balances');balances.setAttribute('aria-label','Account balances');
  balances.append(moneyStat('Current cash',summary.actualCents,'All categories · bank / cash only'),moneyStat('After commitments',summary.availableCents,'Through '+end+' · after reserves and unscheduled card debt',summary.availableCents<0),moneyStat('Projected cash',summary.projectedCents,'Through '+end+' · includes expected income',summary.projectedCents<0));
  if(!moneyConflict()){const panel=planningNode('details','money-sheet-balance-panel');panel.append(planningNode('summary','','Current cash · '+moneyFormat(summary.actualCents)),planningField('Forecast through',moneySelect([['month','End of this month'],['30','Next 30 days'],['90','Next 90 days']],session.horizon,value=>change('horizon',value))),balances);root.append(panel);}
  let sheet;try{sheet=LifeMoney.worksheet(ledger,session.month,getTodayKey(),session.owner,session.purchaseCategory,session.sheetBucket,session.sheetQuery,session.sheetOrder);}catch(e){root.append(planningNode('p','money-alert',e.message));return;}
  if(!moneyConflict())moneySheetEditor(root,ledger,session);
  moneySheetSearch(root,session);
  const scroll=planningNode('div','money-sheet-scroll'),table=planningNode('table','money-sheet');table.setAttribute('aria-label','Monthly money table');
  table.append(planningNode('caption','',session.month+' · '+moneyOwners[session.owner]+' · '+sheet.rows.length+' rows'+(session.sheetQuery?' · Search: '+session.sheetQuery:'')));
  const labels=['Item','Amount (RM)','Status','Category','Account','Paid / due date','Actions'],head=planningNode('thead'),header=planningNode('tr');
  for(const label of labels){const cell=planningNode('th','',label);cell.scope='col';header.append(cell);}head.append(header);table.append(head);
  const body=planningNode('tbody');table.append(body);
  for(const row of sheet.rows){
    const entry=row.entry,account=ledger.accounts.find(a=>a.id===entry.accountId),destination=ledger.accounts.find(a=>a.id===entry.toAccountId),tr=planningNode('tr');tr.dataset.entryId=entry.id;
    const status=row.bucket==='transfer'?(entry.status==='settled'?'Transfer recorded':'Transfer due'):row.bucket==='paid' && LifeMoney.isCredit(account)?'Charged to card':moneySheetLabels[row.bucket];
    for(const [index,value] of [entry.title,moneyFormat(row.amountCents),status,entry.category,account.name+(LifeMoney.isCredit(account)?' · Credit':'')+(destination?' → '+destination.name:''),row.date].entries()){
      const cell=planningNode('td',index===1?'money-sheet-amount':'',value);cell.dataset.label=labels[index];if(index===2)cell.dataset.status=row.bucket;tr.append(cell);
    }
    const cell=planningNode('td','money-sheet-actions');cell.dataset.label='Actions';
    if(!moneyConflict()){
      if(moneySheetEditable(entry))cell.append(planningIcon('Edit row: '+entry.title,()=>{const current=moneySession();current.sheetEdit=entry.id;saveMoneySession(current);renderCardsOnly({force:true});document.querySelector('.money-sheet-edit-row input')?.focus({preventScroll:true});},'pencil'));
      cell.append(planningIcon('Options: '+entry.title,()=>openMoneyOptions(entry),'more-vertical'));
    }
    tr.append(cell);body.append(tr);
    if(session.sheetEdit===entry.id && moneySheetEditable(entry) && !moneyConflict()){const editRow=planningNode('tr','money-sheet-edit-row'),editCell=planningNode('td');editCell.colSpan=7;moneySheetEditor(editCell,ledger,session,entry);editRow.append(editCell);body.append(editRow);}
  }
  scroll.append(table);root.append(scroll);
  if(!sheet.rows.length)root.append(planningNode('p','money-empty','No matching records for this month.'));
  if(!moneyConflict()){
    const totals=planningNode('dl','money-sheet-totals');totals.setAttribute('aria-label','Filtered monthly totals');
    for(const key of ['paid','confirmed','considering','received','expected']){const group=planningNode('div');group.append(planningNode('dt','',key==='paid'?'Spent':moneySheetLabels[key]),planningNode('dd','',moneyFormat(sheet.totals[key])));totals.append(group);}root.append(totals);
    const categories=planningNode('details','money-category-breakdown');categories.append(planningNode('summary','','Spending by category · '+session.month));
    const categoryTable=planningNode('table'),categoryHead=planningNode('thead'),categoryHeader=planningNode('tr');for(const label of ['Category','Spent','Confirmed','Considering']){const th=planningNode('th','',label);th.scope='col';categoryHeader.append(th);}categoryHead.append(categoryHeader);categoryTable.append(categoryHead);
    const categoryBody=planningNode('tbody');for(const group of sheet.categories){const row=planningNode('tr');for(const value of [group.name,moneyFormat(group.paid),moneyFormat(group.confirmed),moneyFormat(group.considering)])row.append(planningNode('td','',value));categoryBody.append(row);}categoryTable.append(categoryBody);categories.append(categoryTable);root.append(categories);
  }
}
function renderMoneyWorkspace() {
  const root=planningNode('section','money-workspace');root.setAttribute('aria-label','Money');elements.boardGrid.append(root);
  let ledger;try{ledger=moneyLedger();}catch(e){root.append(planningNode('p','money-message',e.message));return;}
  const session=moneySession(),today=getTodayKey(),end=moneyEnd(session);let summary;
  try{summary=LifeMoney.summary(ledger,today,end,session.owner);}catch(e){root.append(planningNode('p','money-alert',e.message),planningButton('Download money records',exportMoneyCsv,'download'));return;}
  const change=(key,value)=>{const current=moneySession();current[key]=value;if(key==='view'){const section=moneySections.find(s=>s.views.includes(value));if(section)current.sectionViews[section.id]=value;}try{saveMoneySession(current);}catch{}renderCardsOnly({force:true});};
  const pages=[['overview','Overview'],['table','Table'],['upcoming','Due & expected'],['transactions','Entries'],['credit','Credit cards'],['loans','Loans'],['spending','Purchases'],['accounts','Accounts'],['budgets','Budgets']];
  const section=moneySections.find(s=>s.views.includes(session.view));
  const header=planningNode('header','money-heading'),heading=planningNode('div');heading.append(planningNode('h2','','Money'),planningNode('p','money-subtitle',session.view==='spending'?'Purchases · all dates':state.board.name+' · '+formatReadableDateKey(today)));
  const primary=session.view==='credit'?planningButton('Add card bill',()=>openMoneyCardBill(),'plus'):session.view==='loans'?planningButton('Add loan',()=>openMoneyLoan(),'plus'):session.view==='spending'?planningButton('Plan spending',()=>openMoneySpending(),'plus'):planningButton('Add entry',()=>openMoneyEntry(),'plus');primary.classList.add('money-primary');
  const headerActions=planningNode('div','money-heading-actions');headerActions.append(planningIcon('Download money records',exportMoneyCsv,'download'),primary);header.append(heading,headerActions);root.append(header);
  const views=planningNode('nav','money-section-tabs');views.setAttribute('aria-label','Money sections');
  for(const item of moneySections){const button=planningButton(item.label,()=>change('view',session.sectionViews[item.id]));button.setAttribute('aria-pressed',String(item.id===section.id));views.append(button);}root.append(views);
  const controls=planningNode('div','money-controls'),pagePicker=planningField('Money page',moneySelect(pages.filter(([key])=>section.views.includes(key)),session.view,value=>change('view',value)));pagePicker.classList.add('money-page-picker');pagePicker.hidden=section.views.length<2;controls.append(pagePicker,planningField('Money view',moneySelect(Object.entries(moneyOwners),session.owner,value=>change('owner',value))));
  if(session.view==='spending')controls.append(planningField('Purchase category',moneySelect([['','All categories'],...moneyCategoryOptions()],session.purchaseCategory,value=>change('purchaseCategory',value))));
  if(['overview','upcoming'].includes(session.view))controls.append(planningField('Forecast through',moneySelect([['month','End of this month'],['30','Next 30 days'],['90','Next 90 days']],session.horizon,value=>change('horizon',value))));
  if(session.view==='accounts')controls.append(planningButton('Add summary card',addMoneySummaryCard,'layout-grid'));
  root.append(controls);
  if(moneyConflict())root.append(planningNode('p','money-alert','Balances need review: conflicting financial records are not confirmed.'),planningButton('Review changes',openRecovery));
  if(session.view==='table' && !moneyConflict())moneySheetDrafts(root,ledger,session);
  if(!summary.hasAccounts){root.append(planningNode('p','money-empty','Add a bank or cash account with its opening balance. No income or spending is assumed.'),planningButton('Add account',()=>openMoneyAccount(),'plus'));return;}
  const stats=planningNode('div','money-stats');stats.append(moneyStat('Recorded balance',summary.actualCents,'Bank / cash only, not credit limits',summary.actualCents<0),moneyStat('Upcoming payments',summary.committedCents,'Dated cash commitments through '+formatReadableDateKey(end)),moneyStat('After commitments',summary.availableCents,'After reserve and '+moneyFormat(summary.unscheduledCardCents)+' card debt / charges without scheduled payment',summary.availableCents<0),moneyStat('Projected balance',summary.projectedCents,'Cash after dated payments + '+moneyFormat(summary.incomingCents)+' expected income; not guaranteed',summary.projectedCents<0));if(!moneyConflict() && session.view==='overview')root.append(stats);
  const body=planningNode('div','money-content');root.append(body);
  if(session.view==='table') {
    renderMoneySheet(body,ledger,session,change,summary,end);
  } else if(session.view==='overview') {
    const quick=planningNode('details','money-quick-entries'),actions=planningNode('div','money-actions');quick.append(planningNode('summary','','Quick entries'));
    for(const [label,kind] of [['Expense','expense'],['Income / Airbnb payout','income'],['Upcoming payment','upcoming'],['Monthly bill','monthly'],['Transfer','transfer']])actions.append(planningButton(label,()=>openMoneyEntry(kind),'plus'));quick.append(actions);body.append(quick);
    renderMoneyMonth(body,ledger,session,change);
    if(summary.creditOwedCents){const line=planningNode('div','money-debt-overview');line.append(moneyStat('Credit-card debt',summary.creditOwedCents,'Includes tracked unbilled instalment principal'),planningButton('View credit cards',()=>change('view','credit'),'credit-card'));body.append(line);}
    if(summary.futureCardChargesCents)body.append(planningNode('p','money-message',moneyFormat(summary.futureCardChargesCents)+' upcoming charges to cards are not bank payments. Add the card bill when its payment amount and date are known.'));
    const loans=LifeMoney.loanTotals(ledger,today,session.owner);
    if(loans.rows.length){const line=planningNode('div','money-loan-overview');line.append(planningNode('p','',moneyFormat(loans.balanceCents)+' bank loan balances · '+moneyFormat(loans.monthlyCents)+' monthly instalments'),planningButton('View loans',()=>change('view','loans')));body.append(line);}
    if(summary.lowCents<0)body.append(planningNode('p','money-alert','Possible cash shortfall: '+moneyFormat(summary.lowCents)+'. Receipts may arrive after bills; verify dates before spending.'));
    const columns=planningNode('div','money-overview-columns'),cashflow=planningNode('section','money-cashflow'),recent=planningNode('section','money-recent');columns.append(cashflow,recent);body.append(columns);
    cashflow.append(planningNode('h3','','Cash flow through '+formatReadableDateKey(end)));
    for(const point of summary.timeline){const row=planningNode('div','money-timeline');row.append(planningNode('strong','',formatReadableDateKey(point.date)),planningNode('span','',moneyFormat(point.balanceCents)),planningNode('small','',point.entries.map(e=>e.title+(e.dueDate<today?' (overdue)':'')).join(' · ')));cashflow.append(row);}
    if(!summary.timeline.length)cashflow.append(planningNode('p','money-empty','No upcoming receipts or payments recorded in this period.'));
    recent.append(planningNode('h3','','Recent entries'));renderMoneyRows(recent,[...ledger.entries].filter(e=>e.repeat==='none' && !e.voidedAt && e.status==='settled' && e.date<=today && (session.owner==='all' || ledger.accounts.find(a=>a.id===e.accountId)?.owner===session.owner || e.kind==='transfer' && ledger.accounts.find(a=>a.id===e.toAccountId)?.owner===session.owner)).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt-a.updatedAt).slice(0,5),ledger);
  } else if(session.view==='loans') {
    renderMoneyLoans(body,ledger,session.owner);
  } else if(session.view==='credit') {
    renderMoneyCredit(body,ledger,session);
  } else if(session.view==='spending') {
    renderMoneyPurchases(body,ledger,session,end);
  } else if(session.view==='upcoming') {
    const actions=planningNode('div','money-actions');actions.append(planningButton('Add upcoming payment',()=>openMoneyEntry('upcoming'),'plus'),planningButton('Add monthly bill',()=>openMoneyEntry('monthly'),'plus'));body.append(actions);renderMoneyRows(body,summary.future,ledger);
    const schedules=ledger.entries.filter(e=>e.repeat==='monthly' && !e.voidedAt && (session.owner==='all' || ledger.accounts.find(a=>a.id===e.accountId)?.owner===session.owner));
    if(schedules.length){body.append(planningNode('h3','','Recurring schedules'));renderMoneyRows(body,schedules,ledger);}
  } else if(session.view==='transactions') {
    renderMoneyMonth(body,ledger,session,change);
    const rows=ledger.entries.filter(e=>e.repeat==='none' && (e.status==='settled'?e.date:e.dueDate).startsWith(session.month) && (session.owner==='all' || ledger.accounts.find(a=>a.id===e.accountId)?.owner===session.owner || e.kind==='transfer' && ledger.accounts.find(a=>a.id===e.toAccountId)?.owner===session.owner)).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt-a.updatedAt);renderMoneyRows(body,rows,ledger);
  } else if(session.view==='accounts') {
    body.append(planningButton('Add account',()=>openMoneyAccount(),'plus'));
    for(const account of ledger.accounts.filter(a=>session.owner==='all' || a.owner===session.owner)){const row=planningNode('article','money-account');row.append(planningNode('strong','',account.name),planningNode('p','',moneyOwners[account.owner]+' · '+(LifeMoney.isCredit(account)?moneyFormat(-LifeMoney.balance(ledger,account.id,today))+' owed':moneyFormat(LifeMoney.balance(ledger,account.id,today)))),planningNode('small','',account.reconciledAt?'Last checked '+formatRecordDateTime(account.reconciledAt):'Not reconciled yet'));const actions=planningNode('div','money-actions');actions.append(planningButton('Check balance',()=>openMoneyReconcile(account),'check'),planningIcon('Edit account: '+account.name,()=>openMoneyAccount(account),'pencil'));row.append(actions);body.append(row);}
  } else {
    body.append(planningButton('Set monthly budget',()=>openMoneyBudget(),'plus'));
    for(const budget of ledger.budgets.filter(b=>!b.voidedAt && (session.owner==='all' || b.owner===session.owner)).sort((a,b)=>b.month.localeCompare(a.month)||a.category.localeCompare(b.category))){const ids=new Set(ledger.accounts.filter(a=>a.owner===budget.owner).map(a=>a.id)),spent=ledger.entries.filter(e=>!e.voidedAt && e.status==='settled' && e.kind==='expense' && e.date<=today && e.date.startsWith(budget.month) && ids.has(e.accountId) && (budget.category==='All' || e.category===budget.category)).reduce((sum,e)=>sum+e.amountCents,0);const row=planningNode('article','money-account');row.append(planningNode('strong','',budget.month+' · '+moneyOwners[budget.owner]+' · '+budget.category),planningNode('p','',moneyFormat(spent)+' / '+moneyFormat(budget.limitCents)),planningNode('small',spent>budget.limitCents?'money-alert':'',moneyFormat(budget.limitCents-spent)+' remaining'),planningIcon('Edit budget: '+budget.month+' '+budget.category,()=>openMoneyBudget(budget),'pencil'));const meter=planningNode('progress');meter.max=Math.max(1,budget.limitCents);meter.value=Math.min(budget.limitCents,spent);meter.setAttribute('aria-label','Budget used');row.append(meter);body.append(row);}
  }
}
function addMoneySummaryCard() {
  if(state.cards.some(c=>c.type==='money')){setWorkspaceMode('board');return;}
  state.cards.push(makeCard({type:'money',title:'My money',category:'Finance',theme:'tide',timerMode:'none'}));
  if(!saveState()){state.cards=state.cards.filter(c=>c.type!=='money');setSaveStatus('Summary card could not be saved. Money records were kept.','error');return;}setWorkspaceMode('board');
}
function renderMoneyCard(card,interactive=true) {
  const root=planningNode('div','money-card'),owner=card.moneyOwner || 'personal';
  try{const ledger=moneyLedger(),session={horizon:'month'},data=LifeMoney.summary(ledger,getTodayKey(),moneyEnd(session),owner);
    root.append(planningNode('small','',moneyOwners[owner]+' · This month'));
    if(moneyConflict())root.append(planningNode('p','money-alert','Balances need review.'));
    else if(!data.hasAccounts)root.append(planningNode('p','','No account recorded yet.'));
    else{root.append(moneyStat('Recorded balance',data.actualCents,'Bank / cash; not a live bank feed'),moneyStat('After commitments',data.availableCents,'After bills, card debt and protected reserves',data.availableCents<0),planningNode('p','',moneyFormat(data.projectedCents)+' projected · includes expected receipts'));if(data.creditOwedCents)root.append(planningNode('p','',moneyFormat(data.creditOwedCents)+' credit-card debt'));}
    const loans=LifeMoney.loanTotals(ledger,getTodayKey(),owner);if(loans.rows.length && !moneyConflict())root.append(planningNode('p','',moneyFormat(loans.balanceCents)+' bank loan balances · '+moneyFormat(loans.monthlyCents)+' monthly instalments'));
    if(interactive){
      const select=moneySelect(Object.entries(moneyOwners),owner,value=>{const live=state.cards.find(c=>c.id===card.id);if(!live)return;const previous=live.moneyOwner;live.moneyOwner=value;if(!saveState()){if(previous===undefined)delete live.moneyOwner;else live.moneyOwner=previous;}renderCardsOnly({force:true});});select.setAttribute('aria-label','Summary money view');root.append(select);
      root.append(planningButton('Open Money',()=>{const session=moneySession();session.owner=owner;try{saveMoneySession(session);}catch{}setWorkspaceMode('money');},'bar-chart'));
    }
  }catch(e){root.append(planningNode('p','money-alert',e.message));}return root;
}
function moneyReadable(board) {
  if(!board.money)return '';let ledger;try{ledger=LifeMoney.validate(board.money);}catch{return '<h3>Money</h3><p>Money records need review. Keep the JSON backup as well.</p>';}
  const table=(headers,rows)=>'<table role="table"><thead role="rowgroup"><tr role="row">'+headers.map(label=>'<th role="columnheader" scope="col">'+escapeHtml(label)+'</th>').join('')+'</tr></thead><tbody role="rowgroup">'+rows.map(row=>'<tr role="row">'+row.map((cell,index)=>'<td role="cell" data-label="'+escapeAttribute(headers[index] || '')+'">'+escapeHtml(cell ?? '')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  const loanTable=table(['Loan','Bank','Bank balance','Statement date','Monthly instalment','Repayments left','Scheduled finish','Remaining scheduled payments','Status'],LifeMoney.loans(ledger,getTodayKey()).map(item=>[item.entry.title,item.entry.loan.bank,moneyFormat(item.balanceCents),item.balanceDate,moneyFormat(item.entry.amountCents),item.remaining,item.finishDate,moneyFormat(item.scheduledCents),item.entry.voidedAt?'Removed from tracker':'Tracked']));
  const plans=table(['Card instalment plan','Card','Monthly payment','Payments left','Finish','Scheduled balance'],LifeMoney.cardPlans(ledger,getTodayKey()).map(p=>[p.entry.title,ledger.accounts.find(a=>a.id===p.entry.toAccountId)?.name,moneyFormat(p.entry.amountCents),p.remaining,p.finishDate,moneyFormat(p.remainingCents)]));
  const historyText=record=>Object.entries(record).flatMap(([key,value])=>key==='loan' && value?[['Bank',value.bank],['Bank balance',moneyFormat(value.balanceCents)],['Statement date',value.balanceDate],['Tracked repayments',value.installments],['Final instalment',value.finalCents!==undefined?moneyFormat(value.finalCents):'Standard']]:key==='paymentPlan' && value?[['Instalment count',value.count],['Final payment',moneyFormat(value.finalCents ?? record.amountCents)]]:[[key,value]]).map(([key,value])=>key+': '+value).join('; ');
  return '<section><h3>Money records · MYR</h3>'+table(['Account','Type','Owner','Opening date','Opening balance / debt','Reserve'],ledger.accounts.map(a=>[a.name,LifeMoney.isCredit(a)?'Credit-card debt':'Bank / cash',moneyOwners[a.owner],a.openingDate,moneyFormat(a.openingCents),moneyFormat(a.reservedCents)]))+table(['Entry','Kind','Amount','Status','Account','Recorded date','Due date','Category','Purchase plan','Repeat','Source','Reference','Notes','Destination','Card bill month','Unpaid bill remainder'],ledger.entries.map(e=>[e.title,e.kind,moneyFormat(e.amountCents),e.voidedAt?'Voided':e.status,ledger.accounts.find(a=>a.id===e.accountId)?.name,e.date,e.dueDate,e.category,e.purchaseIntent==='considering'?'Considering - budget only':e.purchaseIntent==='committed'?'Committed':'',e.repeat,e.source,e.reference,e.note,ledger.accounts.find(a=>a.id===e.toAccountId)?.name,e.monthBill || '',e.monthBill?moneyFormat(LifeMoney.billRemaining(ledger,e)):'']))+plans+loanTable+table(['Month','Owner','Category','Budget'],ledger.budgets.map(b=>[b.month,moneyOwners[b.owner],b.category,moneyFormat(b.limitCents)]))+ledger.entries.filter(e=>e.history?.length).map(e=>'<details><summary>'+escapeHtml(e.title)+' · edit history</summary>'+table(['Edited at','Previous record'],e.history.map(h=>[new Date(h.at).toISOString(),historyText(h.record)]))+'</details>').join('')+'</section>';
}
function exportMoneyCsv() {
  const ledger=moneyLedger(),rows=[['Record type','Name','Owner / account','Amount (RM)','Status','Recorded / opening date','Due date / budget month','Category','Source','Reference','Notes','Destination account','Repayments left','Monthly instalment (RM)','Scheduled finish','Purchase plan','Card bill month','Unpaid bill remainder (RM)']];
  for(const a of ledger.accounts)rows.push([LifeMoney.isCredit(a)?'Opening credit-card debt':'Opening balance',a.name,moneyOwners[a.owner],(a.openingCents/100).toFixed(2),'Recorded',a.openingDate,'','','','','','']);
  for(const e of ledger.entries)rows.push([e.kind,e.title,ledger.accounts.find(a=>a.id===e.accountId)?.name,(e.amountCents/100).toFixed(2),e.voidedAt?'Voided':e.status,e.date,e.dueDate,e.category,e.source,e.reference,e.note,ledger.accounts.find(a=>a.id===e.toAccountId)?.name,'','','',e.purchaseIntent==='considering'?'Considering - budget only':e.purchaseIntent==='committed'?'Committed':'',e.monthBill || '',e.monthBill?(LifeMoney.billRemaining(ledger,e)/100).toFixed(2):'']);
  for(const b of ledger.budgets)rows.push(['Budget',b.category,moneyOwners[b.owner],(b.limitCents/100).toFixed(2),'Budget','',b.month,b.category,'','','','']);
  for(const item of LifeMoney.loans(ledger,getTodayKey()))rows.push(['Loan balance (not a cash transaction)',item.entry.title,item.entry.loan.bank,(item.balanceCents/100).toFixed(2),item.entry.voidedAt?'Removed':'Tracked',item.balanceDate,'','Loans','','',item.entry.note,'',item.remaining,(item.entry.amountCents/100).toFixed(2),item.finishDate]);
  for(const item of LifeMoney.cardPlans(ledger,getTodayKey()))rows.push(['Card instalment commitment (not new spending)',item.entry.title,ledger.accounts.find(a=>a.id===item.entry.toAccountId)?.name,(item.remainingCents/100).toFixed(2),'Tracked','','',item.entry.category,'','',item.entry.note,'',item.remaining,(item.entry.amountCents/100).toFixed(2),item.finishDate]);
  const safe=value=>{let text=String(value ?? '');if(/^[\s]*[=+\-@]/.test(text) && !/^-?\d+(?:\.\d{1,2})?$/.test(text) || /^[\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const blob=new Blob(['\ufeff'+rows.map(row=>Array.from({length:rows[0].length},(_,i)=>safe(row[i])).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=planningNode('a');link.href=url;link.download='Life-OS-Money-'+getTodayKey()+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
