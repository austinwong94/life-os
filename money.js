const moneyOwners={personal:'Personal',villa:'Sunrise Villa',all:'Combined'};
const moneyCategories=['Food & drinks','Shopping','Transport','Health','Travel','Housing','Subscriptions','Cleaning','Utilities','Maintenance','Other'];
function moneyLedger(boardId=state.activeBoardId) {
  const board=state.boards.find(item=>item.id===boardId);
  if(!board)throw new Error('This board no longer exists.');
  return LifeMoney.validate(board.money || LifeMoney.empty());
}
function moneyFormat(cents){return new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR'}).format(cents/100);}
function moneySession(boardId=state.activeBoardId) {
  const key=LifeStorageScope.key('life-os-money:'+boardId);
  let saved={};try{saved=JSON.parse(sessionStorage.getItem(key) || '{}');}catch{}
  return {owner:['personal','villa','all'].includes(saved?.owner)?saved.owner:'personal',view:['overview','transactions','upcoming','accounts','budgets'].includes(saved?.view)?saved.view:'overview',horizon:['month','30','90'].includes(saved?.horizon)?saved.horizon:'month',drafts:saved?.drafts && typeof saved.drafts==='object'?saved.drafts:{}};
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
    if(property.toLowerCase().includes('amount') || ['opening','reserve','limit','actual'].includes(property)){input.inputMode='decimal';input.placeholder='0.00';}
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
  moneyDialogForm(entry.kind==='income'?'Record received payout':'Record payment','settle-'+entry.id,{amount:(entry.amountCents/100).toFixed(2),date:getTodayKey()},({form,field})=>{field('Actual amount (RM)','amount');field(entry.kind==='income'?'Received date':'Paid date','date','date');form.append(planningNode('p','money-message','This settles the whole entry. For installments, record each installment as a separate upcoming entry.'));},(draft,boardId)=>{
    commitMoney(boardId,current=>LifeMoney.settle(current,entry,LifeMoney.cents(draft.amount),draft.date,getTodayKey()));
  });
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
  if(record.voidedAt)node.append(planningNode('p','','Voided'));return node;
}
function openMoneyOptions(entry) {
  const boardId=state.activeBoardId,dialog=dailyDialog(entry.title),actions=planningNode('div','money-actions');dialog.append(actions);
  if(entry.voidedAt){actions.append(planningButton('Restore entry',()=>{try{commitMoney(boardId,current=>{const next={...entry};delete next.voidedAt;if(next.scheduleId && next.status==='cancelled')next.status='planned';return LifeMoney.change(current,'entries',next,entry);});dialog.close();}catch(e){dialog.append(planningNode('p','money-message',e.message));}},'rotate-ccw'));}
  else if(entry.kind!=='adjustment')actions.append(planningButton('Edit entry',()=>{dialog.close();openMoneyEntry(entry.kind,entry);},'pencil'));
  if(!entry.voidedAt && ['planned','released'].includes(entry.status))actions.append(planningButton(entry.kind==='income'?'Mark received':'Mark paid',()=>{dialog.close();openMoneySettle(entry);},'check'));
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
function renderMoneyWorkspace() {
  const root=planningNode('section','money-workspace');root.setAttribute('aria-label','Money');elements.boardGrid.append(root);
  let ledger;try{ledger=moneyLedger();}catch(e){root.append(planningNode('p','money-message',e.message));return;}
  const session=moneySession(),today=getTodayKey(),end=moneyEnd(session);let summary;
  try{summary=LifeMoney.summary(ledger,today,end,session.owner);}catch(e){root.append(planningNode('p','money-alert',e.message),planningButton('Download money records',exportMoneyCsv,'download'));return;}
  const change=(key,value)=>{session[key]=value;try{saveMoneySession(session);}catch{}renderCardsOnly({force:true});};
  const header=planningNode('header','money-heading'),heading=planningNode('div');heading.append(planningNode('h2','','Money'),planningNode('p','money-subtitle',state.board.name+' · '+formatReadableDateKey(today)));header.append(heading,planningButton('Add entry',()=>openMoneyEntry(),'plus'));root.append(header);
  const controls=planningNode('div','money-controls');controls.append(planningField('Money view',moneySelect(Object.entries(moneyOwners),session.owner,value=>change('owner',value))),planningField('Forecast through',moneySelect([['month','End of this month'],['30','Next 30 days'],['90','Next 90 days']],session.horizon,value=>change('horizon',value))),planningButton('Add summary card',addMoneySummaryCard,'layout-grid'),planningIcon('Download money records',exportMoneyCsv,'download'));root.append(controls);
  if(moneyConflict())root.append(planningNode('p','money-alert','Balances need review: conflicting financial records are not confirmed.'),planningButton('Review changes',openRecovery));
  if(!summary.hasAccounts){root.append(planningNode('p','money-empty','Add a bank or cash account with its opening balance. No income or spending is assumed.'),planningButton('Add account',()=>openMoneyAccount(),'plus'));return;}
  const stats=planningNode('div','money-stats');stats.append(moneyStat('Recorded balance',summary.actualCents,'Bank / cash records, not a live bank feed',summary.actualCents<0),moneyStat('Upcoming payments',summary.committedCents,'Unpaid commitments through '+formatReadableDateKey(end)),moneyStat('After commitments',summary.availableCents,'Excludes '+moneyFormat(summary.reserveCents)+' protected reserve',summary.availableCents<0),moneyStat('Projected balance',summary.projectedCents,'Includes '+moneyFormat(summary.incomingCents)+' expected receipts; not spendable yet',summary.projectedCents<0));if(!moneyConflict())root.append(stats);
  const views=planningNode('div','money-tabs');views.setAttribute('role','group');views.setAttribute('aria-label','Money pages');for(const [key,label] of [['overview','Overview'],['transactions','Entries'],['upcoming','Due & expected'],['accounts','Accounts'],['budgets','Budgets']]){const button=planningButton(label,()=>change('view',key));button.setAttribute('aria-pressed',String(session.view===key));views.append(button);}root.append(views);
  const body=planningNode('div','money-content');root.append(body);
  if(session.view==='overview') {
    const actions=planningNode('div','money-actions');for(const [label,kind] of [['Expense','expense'],['Income / Airbnb payout','income'],['Upcoming payment','upcoming'],['Transfer','transfer']])actions.append(planningButton(label,()=>openMoneyEntry(kind),'plus'));body.append(actions);
    const monthly=planningNode('div','money-monthly');monthly.append(planningNode('h3','','This month'),planningNode('p','',moneyFormat(summary.spentCents)+' spent · '+moneyFormat(summary.receivedCents)+' received'));body.append(monthly);
    if(summary.lowCents<0)body.append(planningNode('p','money-alert','Possible cash shortfall: '+moneyFormat(summary.lowCents)+'. Receipts may arrive after bills; verify dates before spending.'));
    body.append(planningNode('h3','','Cash flow through '+formatReadableDateKey(end)));
    for(const point of summary.timeline){const row=planningNode('div','money-timeline');row.append(planningNode('strong','',formatReadableDateKey(point.date)),planningNode('span','',moneyFormat(point.balanceCents)),planningNode('small','',point.entries.map(e=>e.title+(e.dueDate<today?' (overdue)':'')).join(' · ')));body.append(row);}
    if(!summary.timeline.length)body.append(planningNode('p','money-empty','No upcoming receipts or payments recorded in this period.'));
    body.append(planningNode('h3','','Recent entries'));renderMoneyRows(body,[...ledger.entries].filter(e=>e.repeat==='none' && !e.voidedAt && e.status==='settled' && e.date<=today && (session.owner==='all' || ledger.accounts.find(a=>a.id===e.accountId)?.owner===session.owner || e.kind==='transfer' && ledger.accounts.find(a=>a.id===e.toAccountId)?.owner===session.owner)).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt-a.updatedAt).slice(0,5),ledger);
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
    if(interactive){
      const select=moneySelect(Object.entries(moneyOwners),owner,value=>{const live=state.cards.find(c=>c.id===card.id);if(!live)return;const previous=live.moneyOwner;live.moneyOwner=value;if(!saveState()){if(previous===undefined)delete live.moneyOwner;else live.moneyOwner=previous;}renderCardsOnly({force:true});});select.setAttribute('aria-label','Summary money view');root.append(select);
      root.append(planningButton('Open Money',()=>{const session=moneySession();session.owner=owner;try{saveMoneySession(session);}catch{}setWorkspaceMode('money');},'bar-chart'));
    }
  }catch(e){root.append(planningNode('p','money-alert',e.message));}return root;
}
function moneyReadable(board) {
  if(!board.money)return '';let ledger;try{ledger=LifeMoney.validate(board.money);}catch{return '<h3>Money</h3><p>Money records need review. Keep the JSON backup as well.</p>';}
  const table=(headers,rows)=>'<table><thead><tr>'+headers.map(label=>'<th>'+escapeHtml(label)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+escapeHtml(cell ?? '')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  return '<section><h3>Money records · MYR</h3>'+table(['Account','Owner','Opening date','Opening balance','Reserve'],ledger.accounts.map(a=>[a.name,moneyOwners[a.owner],a.openingDate,moneyFormat(a.openingCents),moneyFormat(a.reservedCents)]))+table(['Entry','Kind','Amount','Status','Account','Recorded date','Due date','Repeat','Source','Reference','Notes'],ledger.entries.map(e=>[e.title,e.kind,moneyFormat(e.amountCents),e.voidedAt?'Voided':e.status,ledger.accounts.find(a=>a.id===e.accountId)?.name,e.date,e.dueDate,e.repeat,e.source,e.reference,e.note]))+table(['Month','Owner','Category','Budget'],ledger.budgets.map(b=>[b.month,moneyOwners[b.owner],b.category,moneyFormat(b.limitCents)]))+ledger.entries.filter(e=>e.history?.length).map(e=>'<details><summary>'+escapeHtml(e.title)+' · edit history</summary>'+table(['Edited at','Previous record'],e.history.map(h=>[new Date(h.at).toISOString(),Object.entries(h.record).map(([k,v])=>k+': '+v).join('; ')]))+'</details>').join('')+'</section>';
}
function exportMoneyCsv() {
  const ledger=moneyLedger(),rows=[['Record type','Name','Owner / account','Amount (RM)','Status','Recorded / opening date','Due date / budget month','Category','Source','Reference','Notes','Destination account']];
  for(const a of ledger.accounts)rows.push(['Opening balance',a.name,moneyOwners[a.owner],(a.openingCents/100).toFixed(2),'Recorded',a.openingDate,'','','','','','']);
  for(const e of ledger.entries)rows.push([e.kind,e.title,ledger.accounts.find(a=>a.id===e.accountId)?.name,(e.amountCents/100).toFixed(2),e.voidedAt?'Voided':e.status,e.date,e.dueDate,e.category,e.source,e.reference,e.note,ledger.accounts.find(a=>a.id===e.toAccountId)?.name]);
  for(const b of ledger.budgets)rows.push(['Budget',b.category,moneyOwners[b.owner],(b.limitCents/100).toFixed(2),'Budget','',b.month,b.category,'','','','']);
  const safe=value=>{let text=String(value ?? '');if(/^[\s]*[=+\-@]/.test(text) && !/^-?\d+(?:\.\d{1,2})?$/.test(text) || /^[\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const blob=new Blob(['\ufeff'+rows.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=planningNode('a');link.href=url;link.download='Life-OS-Money-'+getTodayKey()+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
