const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('property-runtime.js','utf8');
function extract(name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);assert(start>=0 && end>start);return source.slice(start,end);}
function helpers(){const c={};vm.createContext(c);for(const name of ['damageTotals','documentTotalFor','documentAmountDueFor','documentTypeCode'])vm.runInContext(extract(name),c);return c;}
test('damage fees use integer cents for item quantities, deposit and partial payments without changing source fields',()=>{
  const c=helpers(),doc={type:'Damage Fees',damageItems:[{description:'Sofa cover',quantity:1,unitPrice:120.15,custom:{keep:true}},{description:'Towels',quantity:3,unitPrice:12.34},{description:'Bed sheet',quantity:2,unitPrice:40.05}],damageDepositApplied:100,payments:[{amount:20.01},{amount:10.02}],accommodationFee:9999,securityDeposit:500},before=JSON.stringify(doc);
  assert.equal(c.documentTotalFor(doc),237.27);assert.equal(c.documentAmountDueFor(doc),107.24);assert.equal(JSON.stringify(c.damageTotals(doc)),JSON.stringify({total:237.27,deposit:100,paid:30.03,balance:107.24,overpayment:0}));assert.equal(JSON.stringify(doc),before);
});
test('damage balance clamps at zero and exposes overpayment instead of hiding it',()=>{
  const c=helpers();assert.equal(c.damageTotals({damageItems:[{quantity:1,unitPrice:10}],damageDepositApplied:5,payments:[{amount:6}]}).overpayment,1);assert.equal(c.documentAmountDueFor({type:'Damage Fees',damageItems:[]}),0);
});
test('legacy quotation invoice and receipt calculations and numbering remain unchanged',()=>{
  const c=helpers();for(const type of ['Quotation','Invoice','Official Receipt']){const doc={type,accommodationFee:1200,securityDeposit:500,damageItems:[{quantity:5,unitPrice:999}],damageDepositApplied:100};assert.equal(c.documentTotalFor(doc),1700);assert.equal(c.documentAmountDueFor(doc),1700);}assert.equal(c.documentAmountDueFor({type:'Invoice',accommodationFee:1200,securityDeposit:500,invoiceScope:'Balance Payment',previouslyReceived:300}),1400);assert.equal(c.documentTypeCode('Damage Fees'),'D');assert.equal(c.documentTypeCode('Official Receipt'),'R');
});
test('damage print escapes customer text and distinguishes invoice requests from received payments',()=>{
  const c=helpers();Object.assign(c,{issuers:{'Sunrise Villa Ventures':{}},escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),escapeMultiline:s=>c.escapeHtml(s).replaceAll('\n','<br>'),shortDate:s=>s,money:n=>'RM '+Number(n).toFixed(2)});vm.runInContext(extract('buildDamageMarkup'),c);
  const doc={type:'Damage Fees',issuer:'Sunrise Villa Ventures',guestName:'<script>guest</script>',code:'D-001',date:'2026-11-03',damageDate:'2026-11-03',checkIn:'2026-11-01',checkOut:'2026-11-02',damageKind:'Invoice',damageItems:[{description:'<img src=x>',quantity:2,unitPrice:20}],damageDepositApplied:10,payments:[],remarks:'Line one\nLine two'};
  const invoice=c.buildDamageMarkup(doc);assert.match(invoice,/Damage Compensation Invoice/);assert.match(invoice,/not proof of payment/);assert.match(invoice,/&lt;script&gt;/);assert.doesNotMatch(invoice,/<script>|<img/);assert.match(invoice,/Line one<br>Line two/);assert.match(invoice,/RM 30.00/);
  const receipt=c.buildDamageMarkup({...doc,damageKind:'Receipt',payments:[{date:'2026-11-03',amount:30,mode:'Transfer',reference:'TX1'}]});assert.match(receipt,/Damage Compensation Receipt/);assert.match(receipt,/Total compensation received/);assert.match(receipt,/RM 0.00/);assert.doesNotMatch(receipt,/not proof of payment/);
});
