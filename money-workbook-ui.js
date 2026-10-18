(function(root){
  'use strict';
  let active=null;
  function dispose(){
    const record=active;if(!record)return;
    if(!record.skipDraft){if(record.sheet?.edition)record.sheet.closeEditor(record.sheet.edition[0],true);record.remember?.();}
    active=null;record.observer?.disconnect();record.cornerObserver?.disconnect();
    if(record.host.spreadsheet)jspreadsheet.destroy(record.host,true);
    jspreadsheet.current=null;
  }
  function render(parent,ledger,session){
    dispose();
    const boardId=state.activeBoardId,key='workbook-'+session.owner+'-'+session.month;
    const retained=session.drafts[key],base=retained?.version===1?retained.base:LifeMoneyWorkbook.snapshot(ledger,session,getTodayKey());
    const data=retained?.version===1?LifeMoney.copy(retained.data):LifeMoney.copy(base.data),ids=retained?.ids || {};
    data[0]=LifeMoneyWorkbook.headers.slice();
    const panel=planningNode('section','money-workbook'),toolbar=planningNode('div','money-workbook-toolbar'),status=planningNode('p','money-message money-workbook-status'),host=planningNode('div','money-workbook-grid');
    status.setAttribute('role','status');host.setAttribute('role','region');host.setAttribute('aria-label','Money spreadsheet');host.tabIndex=0;
    const record={boardId,key,base,host,ids,sheet:null,skipDraft:false,dirty:Boolean(retained),zoom:session.sheetZoom || 100,rows:Math.max(retained?.rowCount || 100,data.length+30)};active=record;
    const save=planningButton('Save sheet',null,'check'),add=planningButton('Add 100 rows',null,'plus');save.disabled=!record.dirty;
    const cellName=planningNode('input'),value=planningNode('textarea'),bar=planningNode('div','money-workbook-cellbar'),footer=planningNode('div','money-workbook-footer'),sum=planningNode('output');
    cellName.readOnly=true;cellName.value='A2';cellName.setAttribute('aria-label','Selected cells');value.setAttribute('aria-label','Cell value');
    const options=planningIcon('Selected row options',()=>{const row=base.rows[(record.selection?.[1] || 1)-1];if(row)openMoneyOptions(row.entry);},'more-vertical');options.disabled=true;
    const finish=()=>{if(record.sheet?.edition)record.sheet.closeEditor(record.sheet.edition[0],true);};
    record.remember=()=>{
      if(record.skipDraft || !record.sheet)return;
      const changed=LifeMoney.copy(record.sheet.getData());
      if(record.sheet.edition){const[cell,,x,y]=record.sheet.edition,input=cell.querySelector('input,textarea');if(input){changed[y] ||= [];changed[y][x]=input.value;}}
      const current=moneySession(boardId);
      if(!record.dirty && LifeMoney.equal(changed.slice(0,base.data.length).map(LifeMoneyWorkbook.valuesFor),base.data.map(LifeMoneyWorkbook.valuesFor)) && !changed.slice(base.data.length).some(row=>row.some(v=>String(v??'').trim())))return;
      record.dirty=true;save.disabled=false;
      current.drafts[key]={version:1,base,data:changed,ids,rowCount:record.rows};
      try{saveMoneySession(current,boardId);status.classList.remove('is-error');status.textContent='Unsaved sheet · kept in this tab';}catch{status.classList.add('is-error');status.textContent='Draft storage is unavailable. Keep this sheet open and save or copy your cells.';}
    };
    const selected=(sheet,x1,y1,x2,y2)=>{
      record.selection=[x1,y1,x2,y2];const name=jspreadsheet.helpers.getCellNameFromCoords;
      cellName.value=name(x1,y1)+(x1===x2 && y1===y2?'':':'+name(x2,y2));value.value=String(sheet.getValueFromCoords(x1,y1)??'');value.disabled=y1===0 || Boolean(base.rows[y1-1] && !base.rows[y1-1].editable);options.disabled=!base.rows[y1-1];
      let total=0,count=0;for(let y=Math.min(y1,y2);y<=Math.max(y1,y2);y++)for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++){const raw=String(sheet.getValueFromCoords(x,y)??'');if(y>0 && /^-?\d+(?:\.\d{1,2})?$/.test(raw)){try{total+=LifeMoney.cents(raw,{signed:true});count++;}catch{}}}
      sum.textContent=Number.isSafeInteger(total)?count+' numeric cells · Sum '+moneyFormat(total):'Selection total is outside the supported range';
    };
    const undo=planningIcon('Undo cell edit',()=>{finish();record.sheet?.undo();record.remember();},'rotate-ccw'),redo=planningIcon('Redo cell edit',()=>{finish();record.sheet?.redo();record.remember();},'rotate-ccw');redo.classList.add('money-workbook-redo');
    const zoom=planningNode('div','money-workbook-zoom'),level=planningNode('select');zoom.setAttribute('role','group');zoom.setAttribute('aria-label','Sheet zoom');level.setAttribute('aria-label','Sheet zoom level');
    for(const percent of [50,60,70,75,80,90,100,110,125,150]){const option=planningNode('option','',percent+'%');option.value=String(percent);level.append(option);}
    if(!Array.from(level.options).some(option=>Number(option.value)===record.zoom)){const option=planningNode('option','',record.zoom+'%');option.value=String(record.zoom);level.append(option);}
    const applyZoom=()=>{host.style.setProperty('--money-sheet-scale',record.zoom/100);level.value=String(record.zoom);smaller.disabled=record.zoom<=50;larger.disabled=record.zoom>=150;record.resize?.();};
    const changeZoom=percent=>{finish();record.zoom=Math.max(50,Math.min(150,percent));if(!Array.from(level.options).some(option=>Number(option.value)===record.zoom)){const option=planningNode('option','',record.zoom+'%');option.value=String(record.zoom);level.append(option);}applyZoom();const current=moneySession(boardId);current.sheetZoom=record.zoom;try{saveMoneySession(current,boardId);}catch{status.classList.add('is-error');status.textContent='Zoom changed for this view, but its preference could not be saved.';}};
    const smaller=planningIcon('Zoom sheet out',()=>changeZoom(record.zoom-10),'zoom-out'),larger=planningIcon('Zoom sheet in',()=>changeZoom(record.zoom+10),'zoom-in');level.onchange=()=>changeZoom(Number(level.value));
    zoom.append(smaller,level,larger);applyZoom();
    toolbar.append(undo,redo,add,options,zoom,save);bar.append(cellName,value);footer.append(planningNode('span','',session.month+' · '+moneyOwners[session.owner]+' · A–Z'),sum);
    panel.append(toolbar,bar,status,host,footer);parent.append(panel);
    host.addEventListener('input',()=>record.remember());
    // CE falls back to legacy `which` even when `buttons` is explicitly zero.
    // Focus/zoom scrolling can otherwise turn a released click into a range drag.
    for(const type of ['mouseover','mousemove'])host.addEventListener(type,event=>{if(event.buttons===0 && jspreadsheet.current===record.sheet)jspreadsheet.isMouseAction=false;},true);
    value.oninput=()=>{if(record.sheet && record.selection){const[x,y]=record.selection;if(String(record.sheet.getValueFromCoords(x,y)??'')!==value.value){record.sheet.setValueFromCoords(x,y,value.value);record.remember();}}};
    value.onkeydown=event=>{if(event.key==='Enter' && !event.shiftKey){event.preventDefault();const[x,y]=record.selection || [0,1];record.sheet?.updateSelectionFromCoords(x,y+1);host.focus();}};
    add.onclick=()=>{finish();if(record.rows>=2000){status.textContent='This sheet supports up to 2,000 rows. Save these rows before continuing in another month.';return;}record.sheet.insertRow(100,record.rows-1,false,true);record.rows+=100;record.remember();};
    save.onclick=()=>{
      finish();record.remember();save.disabled=true;
      try{
        if(boardId!==state.activeBoardId)throw new Error('Return to the original board to save this sheet.');
        const current=moneySession(boardId);if(current.month!==session.month || current.owner!==session.owner)throw new Error('The worksheet view changed. Reopen the original draft.');
        const values=record.sheet.getData();for(let y=1;y<values.length;y++)if(!base.rows[y-1] && values[y].some(v=>String(v??'').trim()))ids[y] ||= createId();record.remember();
        const prepared=LifeMoneyWorkbook.prepare(base,values,moneyLedger(boardId),getTodayKey(),ids);
        if(!prepared.changed){status.textContent='No changed money rows to save.';save.disabled=false;return;}
        const retainedDraft=LifeMoney.copy(moneySession(boardId).drafts[key]);delete current.drafts[key];saveMoneySession(current,boardId);record.skipDraft=true;
        try{commitMoney(boardId,latest=>{if(!LifeMoney.equal(latest,base.ledger))throw new Error('Money records changed. Your worksheet draft is kept.');return prepared.ledger;});}
        catch(error){record.skipDraft=false;const retry=moneySession(boardId);retry.drafts[key]=retainedDraft;saveMoneySession(retry,boardId);throw error;}
      }catch(error){status.classList.add('is-error');status.textContent=error.message;save.disabled=false;}
    };
    const cells={};for(let y=0;y<data.length;y++)if(y===0 || base.rows[y-1] && !base.rows[y-1].editable)for(let x=0;x<LifeMoneyWorkbook.columnCount;x++)cells[jspreadsheet.helpers.getCellNameFromCoords(x,y)]={readOnly:true};
    jspreadsheet(host,{root:host,toolbar:false,tabs:false,parseHTML:false,parseFormulas:false,contextMenu:()=>false,
      worksheets:[{data,columns:Array.from({length:LifeMoneyWorkbook.columnCount},(_,x)=>({type:'text',title:String.fromCharCode(65+x),width:[220,125,180,170,190,150,280][x] || 160,align:'left',wordWrap:x>=6})),cells,minDimensions:[LifeMoneyWorkbook.columnCount,record.rows],defaultRowHeight:30,tableOverflow:true,tableWidth:'100%',tableHeight:'480px',allowInsertRow:true,allowDeleteRow:false,allowInsertColumn:false,allowDeleteColumn:false,allowRenameColumn:false,columnSorting:false,rowDrag:false,columnDrag:false,wordWrap:false,secureFormulas:false}],
      onbeforeinsertrow:(sheet,row,count)=>sheet.options.data.length+(Number(count)||1)<=2000,
      onbeforechange:(sheet,cell,x,y,next)=>y===0 || base.rows[y-1] && !base.rows[y-1].editable?sheet.getValueFromCoords(x,y):next,
      onafterchanges:()=>record.remember(),onundo:()=>record.remember(),onredo:()=>record.remember(),onselection:selected,
      onload:()=>{
        if(active!==record || !host.isConnected){jspreadsheet.destroy(host,true);return;}
        record.sheet=host.spreadsheet.worksheets[0];record.sheet.updateSelectionFromCoords(0,1);
        const content=host.querySelector('.jss_content'),scroll=content.onscroll;
        // CE 5.0.4 closes editors on every viewport scroll, including focus scrolls.
        // Retain its scroll bookkeeping without ending an actively focused editor.
        content.onscroll=event=>{
          const editor=record.sheet.edition;
          if(!editor?.[0].contains(document.activeElement))return scroll?.call(content,event);
          record.sheet.edition=null;
          try{return scroll?.call(content,event);}finally{record.sheet.edition=editor;}
        };
        // CE positions the fill handle in viewport pixels, but scroll offsets are
        // unscaled CSS pixels. Keep it in sheet coordinates at every zoom level.
        record.alignCorner=()=>{
          const last=record.sheet.highlighted?.at(-1)?.element,corner=record.sheet.corner;if(!last || !corner)return;
          const cell=last.getBoundingClientRect(),viewport=content.getBoundingClientRect(),scale=record.zoom/100;
          const left=(cell.left-viewport.left+cell.width)/scale+content.scrollLeft-4,top=(cell.top-viewport.top+cell.height)/scale+content.scrollTop-4;
          if(!Number.isFinite(parseFloat(corner.style.left)) || Math.abs(parseFloat(corner.style.left)-left)>.05)corner.style.left=Math.round(left*100)/100+'px';
          if(!Number.isFinite(parseFloat(corner.style.top)) || Math.abs(parseFloat(corner.style.top)-top)>.05)corner.style.top=Math.round(top*100)/100+'px';
        };
        record.cornerObserver=new MutationObserver(record.alignCorner);record.cornerObserver.observe(record.sheet.corner,{attributes:true,attributeFilter:['style']});
        record.resize=()=>{content.style.maxWidth=panel.clientWidth/(record.zoom/100)+'px';record.alignCorner();};record.resize();record.observer=new ResizeObserver(record.resize);record.observer.observe(panel);
        if(record.dirty)status.textContent='Unsaved sheet · kept in this tab';
      },
      updateTable:(sheet,cell,x,y,raw)=>{cell.setAttribute('aria-label',jspreadsheet.helpers.getCellNameFromCoords(x,y)+': '+String(raw??''));if(y===0)cell.classList.add('money-workbook-label');}
    });
    return panel;
  }
  root.LifeMoneyWorkbookUI={render,dispose,active:()=>active};
})(typeof globalThis!=='undefined'?globalThis:this);
