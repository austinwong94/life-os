/* Inactive adapter. No application imports, writes or migration. */
(function(root){
  'use strict';
  const mergeApi=typeof module==='object' && module.exports?require('../state-merge.js'):root.LifeStateMerge;
  const copy=value=>JSON.parse(JSON.stringify(value)),own=(value,key)=>Object.hasOwn(value,key);
  const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
  const unsafe=new Set(['__proto__','prototype','constructor']);
  const projections=['activeBoardId','board','cards','archivedCards'];
  const boardFields=['name','visibility','layout','columnCount','savedLayout','appearance'];
  function refuse(){const error=new Error('This workspace needs explicit review. No records were replaced.');error.name='DeltaReconcileReviewError';throw error;}
  function define(target,key,value){Object.defineProperty(target,key,{value,enumerable:true,writable:true,configurable:true});}
  function slot(value,key){return own(value,key)?{present:true,value:copy(value[key])}:{present:false};}
  function identities(rows){
    if(!Array.isArray(rows) || rows.some(row=>!object(row) || typeof row.id!=='string' || !row.id || unsafe.has(row.id)) || new Set(rows.map(row=>row.id)).size!==rows.length)refuse();
  }
  function inspect(value){
    if(!object(value) || !Array.isArray(value.boards))refuse();identities(value.boards);
    function safeKeys(node){
      if(node===null || typeof node!=='object')return;
      for(const key of Object.keys(node)){if(unsafe.has(key))refuse();safeKeys(node[key]);}
      if(Array.isArray(node) && node.some(item=>object(item) && own(item,'id')))identities(node);
    }
    for(const board of value.boards){
      safeKeys(board);
      for(const key of ['cards','archivedCards'])if(own(board,key))identities(board[key]);
      const ids=[...(board.cards || []),...(board.archivedCards || [])].map(card=>card.id);
      if(new Set(ids).size!==ids.length)refuse();
    }
    if(own(value,'deletedBoardIds')){
      if(!object(value.deletedBoardIds) || Object.entries(value.deletedBoardIds).some(([id,stamp])=>unsafe.has(id) || !Number.isSafeInteger(stamp) || stamp<0 || stamp && value.boards.some(board=>board.id===id)))refuse();
    }
    const projected=projections.some(key=>own(value,key));
    if(projected){
      if(projections.some(key=>!own(value,key)) || typeof value.activeBoardId!=='string')refuse();
      const board=value.boards.find(board=>board.id===value.activeBoardId);if(!board)refuse();
      const expected=Object.fromEntries(boardFields.filter(key=>own(board,key)).map(key=>[key,board[key]]));
      if(!mergeApi.equal(value.board,expected) || !mergeApi.equal(value.cards,board.cards || []) || !mergeApi.equal(value.archivedCards,board.archivedCards || []))refuse();
    }
    return projected;
  }
  function plan(base,local,remote){
    if(!mergeApi || typeof mergeApi.merge!=='function' || typeof mergeApi.equal!=='function')refuse();
    base=copy(base);local=copy(local);remote=copy(remote);
    const projected=inspect(base);if(inspect(local)!==projected || inspect(remote)!==projected)refuse();
    const conflicts=[];
    const byId=value=>new Map(value.boards.map(board=>[board.id,board]));
    const bm=byId(base),lm=byId(local),rm=byId(remote);
    // The existing merger favours tombstones. Never hide a concurrent board edit.
    for(const id of new Set([...bm.keys(),...lm.keys(),...rm.keys()])){
      const b=bm.get(id),l=lm.get(id),r=rm.get(id);
      if(b && (!l && r && !mergeApi.equal(b,r) || !r && l && !mergeApi.equal(b,l)) || !b && l && r && !mergeApi.equal(l,r)){
        conflicts.push({kind:b?'board-lifecycle':'board-identity',segments:['boards',id],base:b?{present:true,value:copy(b)}:{present:false},local:l?{present:true,value:copy(l)}:{present:false},remote:r?{present:true,value:copy(r)}:{present:false}});
      }
    }
    const merged=mergeApi.merge(base,local,remote);conflicts.push(...merged.conflicts);
    const state={};
    function field(b,l,r,key,path){
      const bs=slot(b,key),ls=slot(l,key),rs=slot(r,key);
      if(mergeApi.equal(ls,rs) || mergeApi.equal(bs,rs))return ls;
      if(mergeApi.equal(bs,ls))return rs;
      if(path.length===1 && key==='updatedAt' && [bs,ls,rs].every(s=>s.present && Number.isSafeInteger(s.value) && s.value>=0))return {present:true,value:Math.max(ls.value,rs.value)};
      if(path.length===1 && key==='updatedBy' && [bs,ls,rs].every(s=>s.present && typeof s.value==='string'))return ls;
      if(path.length===1 && key==='hasUserChanges' && [bs,ls,rs].every(s=>s.present && typeof s.value==='boolean'))return {present:true,value:ls.value || rs.value};
      if([bs,ls,rs].every(s=>s.present && object(s.value))){
        const result={};for(const child of new Set([...Object.keys(bs.value),...Object.keys(ls.value),...Object.keys(rs.value)])){
          const next=field(bs.value,ls.value,rs.value,child,[...path,child]);if(next.present)define(result,child,next.value);
        }return {present:true,value:result};
      }
      conflicts.push({kind:'workspace-field',segments:path,base:bs,local:ls,remote:rs});return ls;
    }
    for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
      if(key==='boards' || projected && projections.includes(key))continue;
      const value=field(base,local,remote,key,[key]);if(value.present)define(state,key,value.value);
    }
    state.boards=merged.boards;
    if(projected){
      state.activeBoardId=local.activeBoardId;
      const board=state.boards.find(board=>board.id===state.activeBoardId);
      if(!board)conflicts.push({kind:'active-board-removed',segments:['boards',state.activeBoardId]});
      else{
        state.board=Object.fromEntries(boardFields.filter(key=>own(board,key)).map(key=>[key,copy(board[key])]));
        state.cards=copy(board.cards || []);state.archivedCards=copy(board.archivedCards || []);
      }
    }
    if(!conflicts.length)inspect(state);
    return {state,conflicts};
  }
  const api={plan};
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeExperimentalBoardReconcile=api;
})(globalThis);
