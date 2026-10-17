const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {initializePropertyPeriod,enhancePropertyPeriod:enhance}=require('../tools/property-period.cjs');

test('property importer retains the same single month navigator as maintained source',()=>{
  const source=fs.readFileSync('property-runtime.js','utf8');
  assert(source.includes(initializePropertyPeriod.toString()));
  assert.equal(enhance(source),source);
  const oldWrapper="[['.month-switcher','Period','property-period'],['.focus-panel','Payment summary','property-payment-summary']]";
  const currentWrapper="[['.focus-panel','Payment summary','property-payment-summary']]";
  const preceding=source.replace(initializePropertyPeriod.toString()+'\ninitializePropertyPeriod();\n','').replace(currentWrapper,oldWrapper);
  assert.equal(enhance(preceding),source);
  assert.match(fs.readFileSync('tools/build-property-operations.cjs','utf8'),/runtime=enhancePropertyPeriod\(runtime\)/);
});

test('property period generation refuses partial, duplicated or unfamiliar startup code',()=>{
  const source=fs.readFileSync('property-runtime.js','utf8');
  assert.throws(()=>enhance(source.replace('initializePropertyPeriod();','')),/source changed/);
  assert.throws(()=>enhance('unfamiliar source'),/source changed/);
  const preceding=source.replace(initializePropertyPeriod.toString()+'\ninitializePropertyPeriod();\n','').replace("[['.focus-panel','Payment summary','property-payment-summary']]","[['.month-switcher','Period','property-period'],['.focus-panel','Payment summary','property-payment-summary']]");
  assert.throws(()=>enhance(preceding+preceding),/source changed/);
});
