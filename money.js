const moneyOwners={personal:'Personal',villa:'Sunrise Villa',all:'Combined'};
const moneyCategories=['Food & drinks','Shopping','Transport','Health','Travel','Housing','Subscriptions','Cleaning','Utilities','Maintenance','Loans','Other'];
function moneyLedger(boardId=state.activeBoardId) {
  const board=state.boards.find(item=>item.id===boardId);
  if(!board)throw new Error('This board no longer exists.');
  return LifeMoney.validate(board.money || LifeMoney.empty());
}
function moneyFormat(cents){return new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR'}).format(cents/100);}
function moneySession(boardId=state.activeBoardId) {
  const key=LifeStorageScope.key('life-os-money:'+boardId);
  let saved={};try{saved=JSON.parse(sessionStorage.getItem(key) || '{}');}catch{}
  return {owner:['personal','villa','all'].includes(saved?.owner)?saved.owner:'personal',view:['overview','transactions','upcoming','loans','spending','accounts','budgets'].includes(saved?.view)?saved.view:'overview',horizon:['month','30','90'].includes(saved?.horizon)?saved.horizon:'month',drafts:saved?.drafts && typeof saved.drafts==='object'?saved.drafts:{}};
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
function openMoneyAccount(account) {
  const ledger=moneyLedger(),expected=account?LifeMoney.copy(account):undefined,id=account?.id || createId();
  moneyDialogForm(account?'Edit account':'Add account','account-'+(account?.id || 'new'),{name:account?.name || '',owner:account?.owner || (moneySession().owner==='villa'?'villa':'personal'),opening:account?(account.openingCents/100).toFixed(2):'',openingDate:account?.openingDate || getTodayKey(),reserve:account?(account.reservedCents/100).toFixed(2):'0.00'},({form,field})=>{
    field('Account name','name');const owner=field('Money belongs to','owner','text',Object.entries(moneyOwners).filter(([key])=>key!=='all'));
    const used=Boolean(account && ledger.entries.some(e=>e.accountId===account.id || e.toAccountId===account.id));
    const opening=field('Opening balance (RM)','opening'),date=field('Opening date','openingDate','date');opening.input.disabled=used;date.input.disabled=used;owner.input.disabled=used;
    if(used)form.append(planningNode('p','money-message','Opening balance is fixed after entries exist. Use Check balance to reconcile.'));
    else form.append(planningNode('p','money-message','Opening balance is the start-of-day balance. Add only transactions not already included in it. Bank/cash accounts only; credit-card debt is not supported yet.'));
    field('Protected reserve (RM)','reserve');
  },(draft,boardId)=>{
    if(draft.openingDate>getTodayKey())throw new Error('Opening date cannot be in the future.');
    commitMoney(boardId,current=>LifeMoney.change(current,'accounts',{...expected,id,name:draft.name.trim(),owner:draft.owner,openingCents:LifeMoney.cents(draft.opening),openingDate:draft.openingDate,reservedCents:LifeMoney.cents(draft.reserve)},expected));
  });
}
function openMoneyEntry(kind='expense',entry) {
  const ledger=moneyLedger(),accounts=ledger.accounts;if(!accounts.length){openMoneyAccount();return;}
  const expected=entry?LifeMoney.copy(entry):undefined,id=entry?.id || createId(),isVirtual=Boolean(entry?.virtual);
  const preferred=accounts.find(a=>a.owner===moneySession().owner) || accounts[0];
  const defaults={kind:entry?.kind || (kind==='upcoming'?'expense':kind),title:entry?.title || '',amount:entry?(entry.amountCents/100).toFixed(2):'',accountId:entry?.accountId || preferred.id,toAccountId:entry?.toAccountId || accounts.find(a=>a.id!==preferred.id)?.id || '',status:entry?.status || (kind==='upcoming'?'planned':'settled'),date:entry?.date || getTodayKey(),dueDate:entry?.dueDate || getTodayKey(),category:entry?.category || 'Other',note:entry?.note || '',source:entry?.source || '',reference:entry?.reference || '',repeat:entry?.repeat || 'none',endDate:entry?.endDate || ''};
  moneyDialogForm(entry?'Edit money entry':'Add money entry','entry-'+(entry?.id || kind),defaults,({form,field,draft})=>{
    field('Amount (RM)','amount');field('Entry name','title');
    const type=field('Entry type','kind','text',[['expense','Expense'],['income','Income'],['transfer','Transfer']]);type.input.disabled=entry?.kind==='adjustment' || Boolean(entry?.scheduleId) || Boolean(entry && ledger.entries.some(e=>e.scheduleId===entry.id));
    field('Account','accountId','text',accounts.map(a=>[a.id,a.name+' · '+moneyOwners[a.owner]]));
    const destination=field('Destination account','toAccountId','text',accounts.map(a=>[a.id,a.name+' · '+moneyOwners[a.owner]]));
    field('Status','status','text',[['settled',draft.kind==='income'?'Received / recorded':'Paid / recorded'],['planned','Upcoming'],['released','Released, not received'],['cancelled','Cancelled']]);
    const paidDate=field('Payment / receipt date','date','date'),dueDate=field('Expected / due date','dueDate','date');
    field('Category','category','text',moneyCategories.map(label=>[label,label]));
    const repeat=field('Repeat','repeat','text',[['none','Once'],['monthly','Every month']]);repeat.input.disabled=isVirtual || Boolean(entry?.scheduleId);
    const end=field('Stop repeating after (optional)','endDate','date');
    const source=field('Income source (optional)','source','text',[['','Other / not specified'],['Airbnb','Airbnb'],['Direct booking','Direct booking'],['Other','Other']]);
    const reference=field('Reservation / payment reference (optional)','reference');field('Notes (optional)','note','textarea');
    const update=()=>{destination.wrapper.hidden=draft.kind!=='transfer';source.wrapper.hidden=reference.wrapper.hidden=draft.kind!=='income';repeat.wrapper.hidden=draft.kind==='transfer' || draft.status!=='planned';end.wrapper.hidden=draft.repeat!=='monthly' || draft.status!=='planned';paidDate.wrapper.hidden=draft.status!=='settled';dueDate.wrapper.hidden=draft.status==='settled';};
    form.addEventListener('change',update);update();
    if(draft.kind==='income')form.append(planningNode('p','money-message','Enter the net amount you expect to receive. Released payouts remain projected until money reaches your account.'));
  },async(draft,boardId)=>{
    if(draft.status==='released' && draft.kind!=='income')throw new Error('Released applies to income only. Use Upcoming for a payment.');
    if(draft.status==='settled' && draft.date>getTodayKey())throw new Error('Paid or received date cannot be in the future. Choose Upcoming instead.');
    if(draft.repeat==='monthly' && draft.status!=='planned')throw new Error('A recurring bill is a schedule. Choose Upcoming; record each payment from Due & expected.');
    const recordId=!entry && draft.kind==='income' && draft.source==='Airbnb' && draft.reference.trim()?'payout_'+(await LifeStateMerge.fingerprint({account:draft.accountId,reference:draft.reference.trim(),dueDate:draft.dueDate})).slice(0,32):id;
    const next={...expected,id:recordId,kind:draft.kind,title:draft.title.trim(),amountCents:LifeMoney.cents(draft.amount),accountId:draft.accountId,toAccountId:draft.kind==='transfer'?draft.toAccountId:undefined,status:draft.status,date:draft.date,dueDate:draft.dueDate,category:draft.category,note:draft.note,source:draft.kind==='income'?draft.source:'',reference:draft.reference.trim(),repeat:draft.kind==='transfer'?'none':draft.repeat,endDate:draft.endDate};delete next.virtual;
    commitMoney(boardId,current=>{
      if(isVirtual && !LifeMoney.equal(LifeMoney.upcoming(current,entry.dueDate).find(e=>e.id===entry.id),expected))throw new Error('This recurring payment changed. Reopen it before editing.');
      if(next.source==='Airbnb' && next.reference && current.entries.some(e=>!e.voidedAt && (!entry || e.id!==recordId) && e.kind==='income' && e.source==='Airbnb' && e.reference===next.reference && e.accountId===next.accountId && e.dueDate===next.dueDate))throw new Error('A payout with this reference, account and expected date already exists. Edit it instead.');
      return LifeMoney.change(current,'entries',next,isVirtual?undefined:expected);
    });
  });
}
function openMoneySettle(entry) {
  const loan=moneyLedger().entries.find(e=>e.id===entry.scheduleId && e.loan);
  moneyDialogForm(loan?'Record loan instalment':entry.kind==='income'?'Record received payout':'Record payment','settle-'+entry.id,{amount:(entry.amountCents/100).toFixed(2),date:getTodayKey(),bankBalance:''},({form,field})=>{
    field('Actual amount (RM)','amount');field(entry.kind==='income'?'Received date':'Paid date','date','date');
    if(loan){field('Bank balance after payment (RM, optional)','bankBalance');form.append(planningNode('p','money-message','Interest does not reduce the loan balance. Leave the bank balance blank unless you have the updated statement.'));}
    else form.append(planningNode('p','money-message','This settles the whole entry. For installments, record each installment as a separate upcoming entry.'));
  },(draft,boardId)=>{
    commitMoney(boardId,current=>{
      if(loan && !LifeMoney.equal(current.entries.find(e=>e.id===loan.id),loan))throw new Error('The loan changed while this form was open. Reopen the repayment before saving.');
      const next=LifeMoney.settle(current,entry,LifeMoney.cents(draft.amount),draft.date,getTodayKey());
      if(!loan || !draft.bankBalance.trim())return next;
      if(draft.date<loan.loan.balanceDate)throw new Error('This payment predates the latest bank balance. Leave the balance blank to keep the newer statement.');
      const balancePaymentIds=next.entries.filter(e=>e.scheduleId===loan.id && !e.voidedAt && e.status==='settled' && e.date===draft.date).map(e=>e.id);
      return LifeMoney.change(next,'entries',{...loan,loan:{...loan.loan,balanceCents:LifeMoney.cents(draft.bankBalance),balanceDate:draft.date,balanceUpdatedAt:Date.now(),balancePaymentIds}},loan);
    });
  });
}

function openMoneySpending() {
  const ledger=moneyLedger(),accounts=ledger.accounts.filter(a=>moneySession().owner==='all' || a.owner===moneySession().owner);
  if(!accounts.length){openMoneyAccount();return;}
  const id=createId();
  moneyDialogForm('Plan spending','spending-new',{title:'',amount:'',accountId:accounts[0].id,dueDate:getTodayKey(),category:'Other',note:''},({field})=>{
    field('Item or payment','title');field('Expected amount (RM)','amount');field('Expected payment date','dueDate','date');field('Pay from','accountId','text',accounts.map(a=>[a.id,a.name]));field('Category','category','text',moneyCategories.map(c=>[c,c]));field('Notes (optional)','note','textarea');
  },(draft,boardId)=>commitMoney(boardId,current=>LifeMoney.change(current,'entries',{id,title:draft.title.trim(),amountCents:LifeMoney.cents(draft.amount),accountId:draft.accountId,kind:'expense',status:'planned',repeat:'none',date:draft.dueDate,dueDate:draft.dueDate,category:draft.category,note:draft.note,spendingPlan:true},undefined)));
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
  moneyDialogForm('Check balance','check-'+account.id,{actual:(openingBalance/100).toFixed(2),note:''},({form,field})=>{field('Balance shown by your bank / wallet (RM)','actual');field('Reason for difference (optional)','note','textarea');form.append(planningNode('p','money-message','A difference creates a dated balance adjustment. It is not counted as income or spending.'));},async(draft)=>{
    const adjustmentId='check_'+(await LifeStateMerge.fingerprint({accountId:account.id,previousCheck:account.reconciliationId || 'opening'})).slice(0,32);
    commitMoney(boardId,current=>{
      if(!LifeMoney.equal(current,openingLedger))throw new Error('Money records changed while you checked the balance. Reopen Check balance.');
      const actual=LifeMoney.cents(draft.actual),delta=actual-openingBalance,now=Date.now();let next=current;
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
  if(record.voidedAt)node.append(planningNode('p','','Voided'));return node;
}
function openMoneyOptions(entry) {
  if(entry.loan && entry.repeat==='monthly'){openMoneyLoanOptions(entry);return;}
  const boardId=state.activeBoardId,dialog=dailyDialog(entry.title),actions=planningNode('div','money-actions');dialog.append(actions);
  if(entry.voidedAt){actions.append(planningButton('Restore entry',()=>{try{commitMoney(boardId,current=>{const next={...entry};delete next.voidedAt;if(next.scheduleId && next.status==='cancelled')next.status='planned';return LifeMoney.change(current,'entries',next,entry);});dialog.close();}catch(e){dialog.append(planningNode('p','money-message',e.message));}},'rotate-ccw'));}
  else if(entry.kind!=='adjustment')actions.append(planningButton('Edit entry',()=>{dialog.close();openMoneyEntry(entry.kind,entry);},'pencil'));
  if(!entry.voidedAt && ['planned','released'].includes(entry.status))actions.append(planningButton(entry.kind==='income'?'Mark received':'Mark paid',()=>{dialog.close();openMoneySettle(entry);},'check'));
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
function moneyStat(label,value,detail,warning=false) {
  const node=planningNode('div','money-stat'+(warning?' is-warning':''));node.append(planningNode('span','',label),planningNode('strong','',moneyFormat(value)),planningNode('small','',detail));return node;
}
function renderMoneyRows(root,rows,ledger) {
  if(!rows.length){root.append(planningNode('p','money-empty','No entries for this view.'));return;}
  for(const entry of rows) {
    const row=planningNode('article','money-row'),copy=planningNode('div','money-row-copy'),account=ledger.accounts.find(a=>a.id===entry.accountId);
    copy.append(planningNode('strong','',entry.title),planningNode('small','',[(entry.status==='settled'?entry.date:entry.dueDate),account?.name,entry.category,entry.source,entry.status==='released'?'Released, not received':entry.status==='planned'?'Upcoming':entry.voidedAt?'Voided':entry.status==='cancelled'?'Cancelled':'Recorded'].filter(Boolean).join(' · ')));
    const value=planningNode('strong','money-row-amount '+(entry.kind==='expense'?'is-outgoing':''),moneyFormat(entry.amountCents));
    const original={...entry};delete original.effectCents;
    row.append(copy,value,planningIcon('Options: '+entry.title,()=>openMoneyOptions(original),'more-vertical'));root.append(row);
  }
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
function renderMoneyWorkspace() {
  const root=planningNode('section','money-workspace');root.setAttribute('aria-label','Money');elements.boardGrid.append(root);
  let ledger;try{ledger=moneyLedger();}catch(e){root.append(planningNode('p','money-message',e.message));return;}
  const session=moneySession(),today=getTodayKey(),end=moneyEnd(session);let summary;
  try{summary=LifeMoney.summary(ledger,today,end,session.owner);}catch(e){root.append(planningNode('p','money-alert',e.message),planningButton('Download money records',exportMoneyCsv,'download'));return;}
  const change=(key,value)=>{session[key]=value;try{saveMoneySession(session);}catch{}renderCardsOnly({force:true});};
  const pages=[['overview','Overview'],['loans','Loans'],['spending','Planned spending'],['transactions','Entries'],['upcoming','Due & expected'],['accounts','Accounts'],['budgets','Budgets']];
  const header=planningNode('header','money-heading'),heading=planningNode('div');heading.append(planningNode('h2','','Money'),planningNode('p','money-subtitle',state.board.name+' · '+formatReadableDateKey(today)));header.append(heading,session.view==='loans'?planningButton('Add loan',()=>openMoneyLoan(),'plus'):session.view==='spending'?planningButton('Plan spending',openMoneySpending,'plus'):planningButton('Add entry',()=>openMoneyEntry(),'plus'));root.append(header);
  const controls=planningNode('div','money-controls'),pagePicker=planningField('Money page',moneySelect(pages,session.view,value=>change('view',value)));pagePicker.classList.add('money-page-picker');controls.append(pagePicker,planningField('Money view',moneySelect(Object.entries(moneyOwners),session.owner,value=>change('owner',value))));
  if(session.view!=='loans')controls.append(planningField('Forecast through',moneySelect([['month','End of this month'],['30','Next 30 days'],['90','Next 90 days']],session.horizon,value=>change('horizon',value))));
  if(!['loans','spending'].includes(session.view))controls.append(planningButton('Add summary card',addMoneySummaryCard,'layout-grid'));
  controls.append(planningIcon('Download money records',exportMoneyCsv,'download'));root.append(controls);
  if(moneyConflict())root.append(planningNode('p','money-alert','Balances need review: conflicting financial records are not confirmed.'),planningButton('Review changes',openRecovery));
  if(!summary.hasAccounts){root.append(planningNode('p','money-empty','Add a bank or cash account with its opening balance. No income or spending is assumed.'),planningButton('Add account',()=>openMoneyAccount(),'plus'));return;}
  const stats=planningNode('div','money-stats');stats.append(moneyStat('Recorded balance',summary.actualCents,'Bank / cash records, not a live bank feed',summary.actualCents<0),moneyStat('Upcoming payments',summary.committedCents,'Unpaid commitments through '+formatReadableDateKey(end)),moneyStat('After commitments',summary.availableCents,'Excludes '+moneyFormat(summary.reserveCents)+' protected reserve',summary.availableCents<0),moneyStat('Projected balance',summary.projectedCents,'Includes '+moneyFormat(summary.incomingCents)+' expected receipts; not spendable yet',summary.projectedCents<0));if(!moneyConflict() && !['loans','spending'].includes(session.view))root.append(stats);
  const views=planningNode('div','money-tabs');views.setAttribute('role','group');views.setAttribute('aria-label','Money pages');for(const [key,label] of pages){const button=planningButton(label,()=>change('view',key));button.setAttribute('aria-pressed',String(session.view===key));views.append(button);}root.append(views);
  const body=planningNode('div','money-content');root.append(body);
  if(session.view==='overview') {
    const actions=planningNode('div','money-actions');for(const [label,kind] of [['Expense','expense'],['Income / Airbnb payout','income'],['Upcoming payment','upcoming'],['Transfer','transfer']])actions.append(planningButton(label,()=>openMoneyEntry(kind),'plus'));body.append(actions);
    const monthly=planningNode('div','money-monthly');monthly.append(planningNode('h3','','This month'),planningNode('p','',moneyFormat(summary.spentCents)+' spent · '+moneyFormat(summary.receivedCents)+' received'));body.append(monthly);
    const loans=LifeMoney.loanTotals(ledger,today,session.owner);
    if(loans.rows.length){const line=planningNode('div','money-loan-overview');line.append(planningNode('p','',moneyFormat(loans.balanceCents)+' bank loan balances · '+moneyFormat(loans.monthlyCents)+' monthly instalments'),planningButton('View loans',()=>change('view','loans')));body.append(line);}
    if(summary.lowCents<0)body.append(planningNode('p','money-alert','Possible cash shortfall: '+moneyFormat(summary.lowCents)+'. Receipts may arrive after bills; verify dates before spending.'));
    body.append(planningNode('h3','','Cash flow through '+formatReadableDateKey(end)));
    for(const point of summary.timeline){const row=planningNode('div','money-timeline');row.append(planningNode('strong','',formatReadableDateKey(point.date)),planningNode('span','',moneyFormat(point.balanceCents)),planningNode('small','',point.entries.map(e=>e.title+(e.dueDate<today?' (overdue)':'')).join(' · ')));body.append(row);}
    if(!summary.timeline.length)body.append(planningNode('p','money-empty','No upcoming receipts or payments recorded in this period.'));
    body.append(planningNode('h3','','Recent entries'));renderMoneyRows(body,[...ledger.entries].filter(e=>e.repeat==='none' && !e.voidedAt && e.status==='settled' && e.date<=today && (session.owner==='all' || ledger.accounts.find(a=>a.id===e.accountId)?.owner===session.owner || e.kind==='transfer' && ledger.accounts.find(a=>a.id===e.toAccountId)?.owner===session.owner)).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt-a.updatedAt).slice(0,5),ledger);
  } else if(session.view==='loans') {
    renderMoneyLoans(body,ledger,session.owner);
  } else if(session.view==='spending') {
    const rows=ledger.entries.filter(e=>e.kind==='expense' && e.status==='planned' && e.repeat==='none' && !e.scheduleId && !e.voidedAt && (session.owner==='all' || ledger.accounts.find(a=>a.id===e.accountId)?.owner===session.owner)).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.id.localeCompare(b.id));
    const soon=rows.filter(e=>e.dueDate<=end),later=rows.filter(e=>e.dueDate>end);
    if(!moneyConflict()){const totals=planningNode('div','money-stats money-spending-stats');totals.append(moneyStat('Planned spending',soon.reduce((sum,e)=>sum+e.amountCents,0),'Through '+formatReadableDateKey(end)),moneyStat('After all commitments',summary.availableCents,'Includes loans, bills and protected reserves',summary.availableCents<0));body.append(totals);}
    body.append(planningNode('h3','','Through '+formatReadableDateKey(end)),planningNode('p','money-message','Included once in upcoming payments and projected balance.'));renderMoneyRows(body,soon,ledger);
    if(later.length){body.append(planningNode('h3','','Later planned spending'));renderMoneyRows(body,later,ledger);}
  } else if(session.view==='upcoming') {
    body.append(planningButton('Add upcoming payment',()=>openMoneyEntry('upcoming'),'plus'));renderMoneyRows(body,summary.future,ledger);
    const schedules=ledger.entries.filter(e=>e.repeat==='monthly' && !e.voidedAt && (session.owner==='all' || ledger.accounts.find(a=>a.id===e.accountId)?.owner===session.owner));
    if(schedules.length){body.append(planningNode('h3','','Recurring schedules'));renderMoneyRows(body,schedules,ledger);}
  } else if(session.view==='transactions') {
    const rows=ledger.entries.filter(e=>e.repeat==='none' && (session.owner==='all' || ledger.accounts.find(a=>a.id===e.accountId)?.owner===session.owner || e.kind==='transfer' && ledger.accounts.find(a=>a.id===e.toAccountId)?.owner===session.owner)).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt-a.updatedAt);renderMoneyRows(body,rows,ledger);
  } else if(session.view==='accounts') {
    body.append(planningButton('Add account',()=>openMoneyAccount(),'plus'));
    for(const account of ledger.accounts.filter(a=>session.owner==='all' || a.owner===session.owner)){const row=planningNode('article','money-account');row.append(planningNode('strong','',account.name),planningNode('p','',moneyOwners[account.owner]+' · '+moneyFormat(LifeMoney.balance(ledger,account.id,today))),planningNode('small','',account.reconciledAt?'Last checked '+formatRecordDateTime(account.reconciledAt):'Not reconciled yet'));const actions=planningNode('div','money-actions');actions.append(planningButton('Check balance',()=>openMoneyReconcile(account),'check'),planningIcon('Edit account: '+account.name,()=>openMoneyAccount(account),'pencil'));row.append(actions);body.append(row);}
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
    else{root.append(moneyStat('Recorded balance',data.actualCents,'Not a live bank feed'),moneyStat('After commitments',data.availableCents,'After unpaid bills and protected reserves',data.availableCents<0),planningNode('p','',moneyFormat(data.projectedCents)+' projected · includes expected receipts'));}
    const loans=LifeMoney.loanTotals(ledger,getTodayKey(),owner);if(loans.rows.length && !moneyConflict())root.append(planningNode('p','',moneyFormat(loans.balanceCents)+' bank loan balances · '+moneyFormat(loans.monthlyCents)+' monthly instalments'));
    if(interactive){
      const select=moneySelect(Object.entries(moneyOwners),owner,value=>{const live=state.cards.find(c=>c.id===card.id);if(!live)return;const previous=live.moneyOwner;live.moneyOwner=value;if(!saveState()){if(previous===undefined)delete live.moneyOwner;else live.moneyOwner=previous;}renderCardsOnly({force:true});});select.setAttribute('aria-label','Summary money view');root.append(select);
      root.append(planningButton('Open Money',()=>{const session=moneySession();session.owner=owner;try{saveMoneySession(session);}catch{}setWorkspaceMode('money');},'bar-chart'));
    }
  }catch(e){root.append(planningNode('p','money-alert',e.message));}return root;
}
function moneyReadable(board) {
  if(!board.money)return '';let ledger;try{ledger=LifeMoney.validate(board.money);}catch{return '<h3>Money</h3><p>Money records need review. Keep the JSON backup as well.</p>';}
  const table=(headers,rows)=>'<table><thead><tr>'+headers.map(label=>'<th>'+escapeHtml(label)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+escapeHtml(cell ?? '')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  const loanTable=table(['Loan','Bank','Bank balance','Statement date','Monthly instalment','Repayments left','Scheduled finish','Remaining scheduled payments','Status'],LifeMoney.loans(ledger,getTodayKey()).map(item=>[item.entry.title,item.entry.loan.bank,moneyFormat(item.balanceCents),item.balanceDate,moneyFormat(item.entry.amountCents),item.remaining,item.finishDate,moneyFormat(item.scheduledCents),item.entry.voidedAt?'Removed from tracker':'Tracked']));
  const historyText=record=>Object.entries(record).flatMap(([key,value])=>key==='loan' && value?[['Bank',value.bank],['Bank balance',moneyFormat(value.balanceCents)],['Statement date',value.balanceDate],['Tracked repayments',value.installments],['Final instalment',value.finalCents!==undefined?moneyFormat(value.finalCents):'Standard']]:[[key,value]]).map(([key,value])=>key+': '+value).join('; ');
  return '<section><h3>Money records · MYR</h3>'+table(['Account','Owner','Opening date','Opening balance','Reserve'],ledger.accounts.map(a=>[a.name,moneyOwners[a.owner],a.openingDate,moneyFormat(a.openingCents),moneyFormat(a.reservedCents)]))+table(['Entry','Kind','Amount','Status','Account','Recorded date','Due date','Repeat','Source','Reference','Notes'],ledger.entries.map(e=>[e.title,e.kind,moneyFormat(e.amountCents),e.voidedAt?'Voided':e.status,ledger.accounts.find(a=>a.id===e.accountId)?.name,e.date,e.dueDate,e.repeat,e.source,e.reference,e.note]))+loanTable+table(['Month','Owner','Category','Budget'],ledger.budgets.map(b=>[b.month,moneyOwners[b.owner],b.category,moneyFormat(b.limitCents)]))+ledger.entries.filter(e=>e.history?.length).map(e=>'<details><summary>'+escapeHtml(e.title)+' · edit history</summary>'+table(['Edited at','Previous record'],e.history.map(h=>[new Date(h.at).toISOString(),historyText(h.record)]))+'</details>').join('')+'</section>';
}
function exportMoneyCsv() {
  const ledger=moneyLedger(),rows=[['Record type','Name','Owner / account','Amount (RM)','Status','Recorded / opening date','Due date / budget month','Category','Source','Reference','Notes','Destination account','Repayments left','Monthly instalment (RM)','Scheduled finish']];
  for(const a of ledger.accounts)rows.push(['Opening balance',a.name,moneyOwners[a.owner],(a.openingCents/100).toFixed(2),'Recorded',a.openingDate,'','','','','','']);
  for(const e of ledger.entries)rows.push([e.kind,e.title,ledger.accounts.find(a=>a.id===e.accountId)?.name,(e.amountCents/100).toFixed(2),e.voidedAt?'Voided':e.status,e.date,e.dueDate,e.category,e.source,e.reference,e.note,ledger.accounts.find(a=>a.id===e.toAccountId)?.name]);
  for(const b of ledger.budgets)rows.push(['Budget',b.category,moneyOwners[b.owner],(b.limitCents/100).toFixed(2),'Budget','',b.month,b.category,'','','','']);
  for(const item of LifeMoney.loans(ledger,getTodayKey()))rows.push(['Loan balance (not a cash transaction)',item.entry.title,item.entry.loan.bank,(item.balanceCents/100).toFixed(2),item.entry.voidedAt?'Removed':'Tracked',item.balanceDate,'','Loans','','',item.entry.note,'',item.remaining,(item.entry.amountCents/100).toFixed(2),item.finishDate]);
  const safe=value=>{let text=String(value ?? '');if(/^[\s]*[=+\-@]/.test(text) && !/^-?\d+(?:\.\d{1,2})?$/.test(text) || /^[\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const blob=new Blob(['\ufeff'+rows.map(row=>Array.from({length:rows[0].length},(_,i)=>safe(row[i])).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=planningNode('a');link.href=url;link.download='Life-OS-Money-'+getTodayKey()+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
