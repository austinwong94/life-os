(function(root) {
  'use strict';
  const text = value => typeof value === 'string' ? value : '';
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  function collect(board) {
    const active=board?.cards || [],cards=[...active,...(board?.archivedCards || [])];
    return cards.flatMap((card,index) => {
      if(!card || typeof card!=='object')return [];
      const base={boardId:board.id,cardId:card.id,sourceIndex:index,sourceTitle:text(card.title),archived:index>=active.length || Boolean(card.archivedAt),type:card.type};
      if(card.type==='diary')return Object.entries(card.diaryEntries || {}).flatMap(([dateKey,entry])=>{
        if(!validDate(dateKey) || !entry || !(text(entry.sentence).trim() || text(entry.thoughts).trim() || text(entry.feeling)))return [];
        return [{...base,key:JSON.stringify([index,dateKey]),dateKey,sentence:text(entry.sentence),body:text(entry.thoughts),feeling:text(entry.feeling),updatedAt:Number(entry.updatedAt)||0}];
      });
      if(card.type==='sidenote')return Object.entries(card.sideNoteEntries || {}).flatMap(([dateKey,entry])=>{
        if(!validDate(dateKey) || !entry)return [];
        const notes=Array.isArray(entry.notes)?entry.notes:[{text:entry.note || entry.text}];
        return notes.flatMap((note,n)=>text(note?.text).trim()?[{...base,key:JSON.stringify([index,dateKey,n]),dateKey,body:text(note.text),updatedAt:Number(note.updatedAt || entry.updatedAt)||0}]:[]);
      });
      if(card.type==='quote' && text(card.quote).trim())return [{...base,key:JSON.stringify([index,'quote']),dateKey:'',body:text(card.quote),updatedAt:Number(card.updatedAt)||0}];
      return [];
    }).sort((a,b)=>b.dateKey.localeCompare(a.dateKey) || b.updatedAt-a.updatedAt || a.key.localeCompare(b.key));
  }
  function filter(rows,{type='all',query='',date='',includeArchived=true}={}) {
    const needle=text(query).trim().toLocaleLowerCase();
    return rows.filter(row=>(type==='all' || row.type===type) && (!date || row.dateKey===date) && (includeArchived || !row.archived) && (!needle || [row.body,row.sentence,row.sourceTitle,row.feeling].join('\n').toLocaleLowerCase().includes(needle)));
  }
  const api=Object.freeze({collect,filter,validDate});
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.LifeRecords=api;
})(typeof window==='undefined'?globalThis:window);

const recordSessions=new Map();
function recordSession() {
  if(!recordSessions.has(state.activeBoardId))recordSessions.set(state.activeBoardId,{view:'history',type:'all',query:'',date:'',includeArchived:true,previews:false,limit:30});
  return recordSessions.get(state.activeBoardId);
}
function renderRecordsWorkspace() {
  const session=recordSession(),root=elements.boardGrid,head=planningNode('header','records-head');
  head.append(planningNode('h2','','Records'),planningIcon('Download my information',exportReadableDataArchive,'download'));
  root.append(head);
  const tabs=planningNode('div','planning-tabs');
  for(const [key,label] of [['history','History'],['write','Write']]){
    const button=planningButton(label,()=>{if(isProtectedTextEditActive())document.activeElement?.blur();session.view=key;renderCardsOnly({force:true});});
    button.setAttribute('aria-pressed',String(session.view===key));tabs.append(button);
  }
  root.append(tabs);
  if(session.view==='write')return renderRecordWriter(root,session);
  const controls=planningNode('div','records-filters'),results=planningNode('section','records-history');results.setAttribute('aria-label','Saved writing');
  const update=()=>{session.limit=30;renderRecordHistory(results,session);};
  const dateInput=planningInput('date',session.date,value=>{session.date=value;update();});dateInput.setAttribute('aria-label','Recorded day');
  controls.append(planningField('Record type',planningSelect([['all','All writing'],['diary','Diary'],['sidenote','Notes'],['quote','Motivation']],session.type,value=>{session.type=value;update();})),
    planningField('Search your writing',planningInput('search',session.query,value=>{session.query=value;update();})),
    planningField('Recorded day',planningOptionalDate(dateInput,'Clear recorded day',()=>{session.date='';dateInput.value='';update();})));
  const preferences=planningNode('details','records-preferences');preferences.append(planningNode('summary','','Reading options'));
  const options=planningNode('div','records-options');preferences.append(options);
  for(const [key,label] of [['previews','Show content previews'],['includeArchived','Include archived sources']]){
    const check=planningInput('checkbox','',()=>{});check.checked=session[key];check.onchange=()=>{session[key]=check.checked;update();};
    const row=planningNode('label','records-check');row.append(check,planningNode('span','',label));options.append(row);
  }
  root.append(controls,preferences,results);renderRecordHistory(results,session);
}
function renderRecordHistory(root,session) {
  root.replaceChildren();
  // A projection over original records: no normalization, migration or duplicate copy.
  const rows=LifeRecords.filter(LifeRecords.collect({id:state.activeBoardId,cards:state.cards,archivedCards:getArchivedCards()}),session);
  root.append(planningNode('p','records-count',rows.length+' saved '+(rows.length===1?'record':'records')));
  if(!rows.length){root.append(planningNode('p','planning-empty',session.query || session.date?'No matching writing. Try another search or date.':'No writing recorded here yet.'));return;}
  for(const row of rows.slice(0,session.limit)){
    const item=planningNode('details','record-entry'),summary=planningNode('summary'),meta=planningNode('div','record-meta');
    meta.append(planningNode('time','',row.dateKey?formatReadableDateKey(row.dateKey):'Undated'),planningNode('span','',({diary:'Diary',sidenote:'Note',quote:'Motivation'})[row.type]),planningNode('span','',row.sourceTitle));
    if(row.dateKey)meta.firstChild.dateTime=row.dateKey;
    if(row.archived)meta.append(planningNode('span','record-archived','Archived source'));
    summary.append(meta);
    if(session.previews)summary.append(planningNode('p','record-preview',(row.sentence || row.body || row.feeling).slice(0,150)));
    item.append(summary);
    const content=planningNode('div','record-content');
    if(row.feeling)content.append(planningNode('p','record-feeling','Feeling: '+row.feeling));
    if(row.sentence)content.append(planningNode('p','record-sentence',row.sentence));
    if(row.body)content.append(planningNode('p','record-body',row.body));
    if(row.updatedAt && Number.isFinite(new Date(row.updatedAt).getTime()))content.append(planningNode('small','daily-muted','Last recorded '+formatRecordDateTime(row.updatedAt)));
    const matches=state.cards.filter(card=>card.id===row.cardId);
    if(!row.archived && matches.length===1 && ['diary','sidenote'].includes(row.type))content.append(planningButton('Continue writing',()=>{
      const card=state.cards.find(card=>card.id===row.cardId);if(!card)return;
      card[row.type==='diary'?'activeDate':'activeSideNoteDate']=row.dateKey;
      session.cardId=card.id;session.view='write';renderCardsOnly({force:true});
    },'pencil'));
    item.append(content);root.append(item);
  }
  if(rows.length>session.limit)root.append(planningButton('Show more ('+(rows.length-session.limit)+' remaining)',()=>{session.limit+=30;renderRecordHistory(root,session);},'plus'));
}
function renderRecordWriter(root,session) {
  const cards=state.cards.filter(card=>!card.archivedAt && ['diary','sidenote'].includes(card.type));
  if(!cards.length){root.append(planningButton('Add a diary or notes card',()=>openCardComposer(),'plus'));return;}
  const card=cards.find(card=>card.id===session.cardId) || cards[0];session.cardId=card.id;
  const options=planningNode('div','records-write-options');
  options.append(planningField('Writing source',planningSelect(cards.map(card=>[card.id,card.title+' · '+(card.type==='diary'?'Diary':'Notes')]),card.id,value=>{if(isProtectedTextEditActive())document.activeElement?.blur();session.cardId=value;renderCardsOnly({force:true});})),planningButton('Reports',openReportsModal,'bar-chart'));
  root.append(options);
  if(state.cards.filter(source=>source.id===card.id).length!==1){root.append(planningNode('p','planning-empty','This writing source has a duplicate identity. Its original records are available in History; editing is paused to protect both copies.'));return;}
  const editor=planningNode('section','records-editor');editor.dataset.id=card.id;
  editor.style.setProperty('--card-accent','#196b61');editor.style.setProperty('--card-soft','#e9f3ef');editor.style.setProperty('--card-ink','#24282d');editor.style.setProperty('--card-muted','#616973');
  editor.append(card.type==='diary'?renderDiary(card):renderSideNotes(card));root.append(editor);
}
