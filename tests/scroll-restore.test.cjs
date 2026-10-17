const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const start=app.indexOf('function captureScrollPosition() {'),end=app.indexOf('\nfunction renderBoardColumns(',start);
assert(start>=0 && end>start);
function fixture(){
  const frames=new Map(),writes=[],workspace={scrollTop:10};let id=0;
  const context={elements:{workspace},state:{activeBoardId:'board-a',ui:{workspaceMode:'board'},cards:[{id:'original',notes:'All original writing'}]},activeBoardPointers:new Set(),scrollRestoreFrame:null,scrollY:20,
    requestAnimationFrame(callback){frames.set(++id,callback);return id;},cancelAnimationFrame(frame){frames.delete(frame);},scrollTo(options){writes.push(options.top);context.scrollY=options.top;}};
  context.window=context;vm.createContext(context);vm.runInContext(app.slice(start,end),context);
  return{context,workspace,frames,writes,drain(){for(const [key,callback] of [...frames]){frames.delete(key);callback();}}};
}

test('uninterrupted board redraws still restore the intended window and workspace position',()=>{
  const f=fixture(),before=JSON.stringify(f.context.state);f.context.restoreScrollPosition({windowY:340,workspaceTop:90});
  assert.equal(f.context.scrollY,20);f.drain();assert.equal(f.context.scrollY,340);assert.equal(f.workspace.scrollTop,90);assert.equal(JSON.stringify(f.context.state),before);
});

test('scrolling after a redraw is scheduled cancels restoration rather than moving a reached control',()=>{
  for(const scroll of [f=>{f.context.scrollY=60.25;},f=>{f.workspace.scrollTop=50.5;}]){
    const f=fixture();f.context.restoreScrollPosition({windowY:340,workspaceTop:90});scroll(f);const reached=JSON.stringify(f.context.captureScrollPosition());f.drain();
    assert.equal(JSON.stringify(f.context.captureScrollPosition()),reached);assert.deepEqual(f.writes,[]);
  }
});

test('a newer redraw supersedes an older scroll callback and explicit non-preservation cancels it',()=>{
  const f=fixture();f.context.restoreScrollPosition({windowY:100,workspaceTop:30});f.context.restoreScrollPosition({windowY:500,workspaceTop:80});
  assert.equal(f.frames.size,1);f.drain();assert.deepEqual(f.writes,[500]);
  f.context.restoreScrollPosition({windowY:700,workspaceTop:100});f.context.restoreScrollPosition(null);assert.equal(f.frames.size,0);f.drain();assert.deepEqual(f.writes,[500]);
});

test('a pending press, board change or workspace change prevents an obsolete restoration',()=>{
  for(const change of [f=>f.context.activeBoardPointers.add(4),f=>{f.context.state.activeBoardId='board-b';},f=>{f.context.state.ui.workspaceMode='tasks';}]){
    const f=fixture();f.context.restoreScrollPosition({windowY:340,workspaceTop:90});change(f);const before=JSON.stringify(f.context.state);f.drain();
    assert.equal(f.context.scrollY,20);assert.equal(f.workspace.scrollTop,10);assert.deepEqual(f.writes,[]);assert.equal(JSON.stringify(f.context.state),before);
  }
});
