const {test}=require('node:test'),assert=require('node:assert/strict'),appearance=require('../appearance.js');
test('appearance accepts only complete hex colours and known background tints without changing its input',()=>{
  const input={accent:'#B34463',background:'rose'},before=JSON.stringify(input);
  assert.deepEqual(appearance.normalize(input),{accent:'#b34463',background:'rose'});assert.equal(JSON.stringify(input),before);
  for(const accent of ['red','url(https://invalid.test)','</style>','#fff',null,12])assert.deepEqual(appearance.normalize({accent,background:'unknown'}),appearance.defaults);
});
test('custom colours retain readable foregrounds and selected text even for very bright or dark choices',()=>{
  for(let i=0;i<512;i++){
    const accent='#'+((i*32647)%16777216).toString(16).padStart(6,'0'),tokens=appearance.tokens({accent,background:'rose'});
    assert.equal(tokens['--action-fill'],accent);
    assert(appearance.contrast(tokens['--action-on'],accent)>=4.5,accent);
    assert(appearance.contrast(tokens['--action-hover-on'],tokens['--action-hover'])>=4.5,accent);
    for(const background of [tokens['--action-soft'],tokens['--bg'],'#ffffff'])assert(appearance.contrast(tokens['--action'],background)>=4.5,accent+' on '+background);
    assert(Object.values(tokens).every(value=>/^#[a-f0-9]{6}$/.test(value)));
  }
});
