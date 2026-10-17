const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../meal-reuse.js'),M=require('../state-merge.js');
const food={id:'item',foodId:'egg',name:'Egg',servingUnit:'egg',servingGrams:50,amount:2,unit:'serving',calories:78,protein:6.3,carbs:0.6,fat:5.3,fiber:0,source:'Original label',extra:{keep:true}};
const fixture=()=>({id:'health',cards:[{id:'food',type:'food',foodEntries:{'2026-10-15':{meals:[{id:'breakfast',name:'Breakfast',items:[structuredClone(food)]}],updatedAt:1},'2026-10-16':{meals:[{id:'current',name:'Breakfast',items:[]}],updatedAt:2}},foodTargets:{'2026-10':{calories:2200}},extra:'keep'}]});
const command=board=>R.create(board,'food','2026-10-15','breakfast','2026-10-16');
test('preview is read-only, names a separate meal and assigns fresh item and meal IDs',()=>{
  const board=fixture(),before=structuredClone(board),c=command(board);
  assert.deepEqual(board,before);assert.equal(c.meal.name,'Breakfast 2');assert.notEqual(c.meal.id,c.source.id);assert.notEqual(c.meal.items[0].id,food.id);
  assert.deepEqual({...c.meal.items[0],id:food.id},food);
});
test('apply only appends a meal to the chosen day, preserving all source data and monthly targets',()=>{
  const board=fixture(),before=structuredClone(board),c=command(board),tx=R.apply(board,c,{now:123});
  assert.deepEqual(board.cards[0].foodEntries['2026-10-15'],before.cards[0].foodEntries['2026-10-15']);
  assert.deepEqual(board.cards[0].foodTargets,before.cards[0].foodTargets);assert.deepEqual(board.cards[0].foodEntries['2026-10-16'].meals[0],before.cards[0].foodEntries['2026-10-16'].meals[0]);
  assert.equal(board.cards[0].foodEntries['2026-10-16'].updatedAt,123);R.restore(board,tx);assert.deepEqual(board,before);
});
test('retrying an already applied command is refused instead of duplicating meals',()=>{
  const board=fixture(),c=command(board);R.apply(board,c);const before=structuredClone(board);assert.throws(()=>R.apply(board,c),/changed/);assert.deepEqual(board,before);
});
test('source, destination, board identity, moved card and unresolved comparisons are guarded',()=>{
  for(const mutate of [b=>b.id='other',b=>b.cards[0].id='moved',b=>b.cards[0].archivedAt=1,b=>b.cards.push(structuredClone(b.cards[0])),b=>b.cards[0].foodEntries['2026-10-15'].meals[0].items[0].amount=3,b=>b.cards[0].foodEntries['2026-10-16'].meals[0].name='New name']){
    const board=fixture(),c=command(board);mutate(board);const before=structuredClone(board);assert.throws(()=>R.apply(board,c));assert.deepEqual(board,before);
  }
  const board=fixture(),c=command(board),before=structuredClone(board);assert.throws(()=>R.apply(board,c,{conflicts:[{segments:['boards','health','cards','food','foodEntries']}]}),/conflicting/);assert.deepEqual(board,before);
});
test('invalid or missing nutrition bases remain untouched instead of becoming guesses',()=>{
  for(const patch of [{servingGrams:0},{protein:-1},{unit:'kg'},{amount:'2'},{name:''},{calories:0,protein:0,carbs:0,fat:0,fiber:0}]){
    const board=fixture();Object.assign(board.cards[0].foodEntries['2026-10-15'].meals[0].items[0],patch);const before=structuredClone(board);
    assert.equal(R.sources(board.cards[0])[0].usable,false);assert.throws(()=>command(board),/reviewed/);assert.deepEqual(board,before);
  }
});
test('invalid dates, duplicate identities and tampered previews are rejected before mutation',()=>{
  const board=fixture();assert.throws(()=>R.create(board,'food','2026-02-31','breakfast','2026-10-16'));
  assert.throws(()=>R.create(board,'food','2026-10-15','breakfast','__proto__'));
  for(const mutate of [c=>c.meal.items[0].calories=900,c=>c.meal.id='current',c=>c.meal.items[0].id=c.meal.id]){
    const b=fixture(),c=command(b);mutate(c);const before=structuredClone(b);assert.throws(()=>R.apply(b,c));assert.deepEqual(b,before);
  }
});
test('Undo refuses later edits, but a refused save can roll back and retry the same fresh IDs',()=>{
  const board=fixture(),c=command(board),tx=R.apply(board,c,{now:123}),undo=R.restore(board,tx);R.restore(board,undo);assert.deepEqual(board.cards[0].foodEntries['2026-10-16'],tx.after);
  R.restore(board,tx);R.apply(board,c,{now:123});board.cards[0].foodEntries['2026-10-16'].meals[0].name='Edited later';const before=structuredClone(board);assert.throws(()=>R.restore(board,tx),/changed again/);assert.deepEqual(board,before);
});
test('independent concurrent meal additions merge without sharing IDs or replacing either addition',()=>{
  const base={boards:[fixture()]},left=structuredClone(base),right=structuredClone(base);
  R.apply(left.boards[0],command(left.boards[0]));R.apply(right.boards[0],command(right.boards[0]));
  const merged=M.merge(base,left,right);assert.deepEqual(merged.conflicts,[]);const meals=merged.boards[0].cards[0].foodEntries['2026-10-16'].meals;
  assert.equal(meals.length,3);assert.equal(new Set(meals.map(meal=>meal.id)).size,3);
});
test('reusing into a previously absent day can be undone without creating or changing other dates',()=>{
  const board=fixture(),before=structuredClone(board),c=R.create(board,'food','2026-10-15','breakfast','2026-10-17');const tx=R.apply(board,c);assert.equal(board.cards[0].foodEntries['2026-10-17'].meals.length,1);R.restore(board,tx);assert.deepEqual(board,before);
});
