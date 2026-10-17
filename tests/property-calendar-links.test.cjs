const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {propertyReservationLink:link,hardenPropertyCalendarLinks:harden}=require('../tools/property-calendar-links.cjs');

test('reservation links allow only HTTPS Airbnb and Booking.com hosts with correct provider names',()=>{
  for(const [url,provider] of [['https://airbnb.com/hosting/reservations/SYNTHETIC','Airbnb'],['https://www.airbnb.com/hosting/reservations/SYNTHETIC?source=calendar','Airbnb'],['https://admin.booking.com/reservation/SYNTHETIC','Booking.com'],['https://booking.com:443/reservation/SYNTHETIC','Booking.com']])assert.deepEqual(link(url),{href:new URL(url).href,provider});
});
test('reservation links reject executable schemes, relative URLs, credentials, ports and lookalike hosts',()=>{
  for(const url of ['javascript:alert(1)','JaVaScRiPt:alert(1)','data:text/html,SYNTHETIC','file:///private/test','blob:https://airbnb.com/SYNTHETIC','http://airbnb.com/reservation','//airbnb.com/reservation','/reservation','https://user:password@airbnb.com/reservation','https://airbnb.com:8443/reservation','https://airbnb.com.evil.invalid/reservation','https://notairbnb.com/reservation','https://booking.com.evil.invalid/reservation','https://airbnb.com@evil.invalid/reservation','https://127.0.0.1/reservation','https://airbnb.com./reservation'])assert.equal(link(url),null,url);
});
test('reservation links refuse ambiguous whitespace, controls, backslashes and invalid input without coercion',()=>{
  for(const value of [undefined,null,0,{},[],{toString(){throw new Error('Must not coerce');}},'','not a URL',' https://airbnb.com/reservation','https://airbnb.com/re\nservation','https://airbnb.com/\u0000reservation','https://airbnb.com\\@evil.invalid/reservation','https://airbnb.com/'+ 'a'.repeat(4096)])assert.equal(link(value),null);
});
test('safe URL rendering does not mutate or discard original imported records',()=>{
  const records=[{uid:'old',start:'2026-10-01',end:'2026-10-02',reservationUrl:'javascript:void(0)',history:{keep:'Original'}},{uid:'safe',reservationUrl:'https://admin.booking.com/reservation/SYNTHETIC'}],before=JSON.stringify(records);
  assert.equal(link(records[0].reservationUrl),null);assert.equal(link(records[1].reservationUrl).provider,'Booking.com');assert.equal(JSON.stringify(records),before);
});
test('generated runtime and future migration imports retain the exact guarded renderer',()=>{
  const runtime=fs.readFileSync('property-runtime.js','utf8');assert(runtime.includes(link.toString()));assert.equal(harden(runtime),runtime);assert.match(fs.readFileSync('tools/build-property-operations.cjs','utf8'),/app=hardenPropertyCalendarLinks\(app\)/);assert.doesNotMatch(runtime,/chip\.href = b\.reservationUrl/);
  const safeStart=runtime.indexOf('      const link = propertyReservationLink(b.reservationUrl);'),safeEnd=runtime.indexOf('\n      cell.appendChild(chip);',safeStart),safeBlock=runtime.slice(safeStart,safeEnd);
  const oldBlock=`      const chip = document.createElement(b.reservationUrl ? "a" : "div");\n      chip.className = "booking-chip airbnb-import";\n      if (b.reservationUrl) {\n        chip.href = b.reservationUrl;\n        chip.target = "_blank";\n        chip.rel = "noopener noreferrer";\n        chip.title = "Open this reservation in Airbnb";\n      }\n      chip.innerHTML = \`<span>Airbnb · \${escapeHtml(b.villa)}\${b.reservationUrl ? " ↗" : ""}</span>\`;`;
  const legacy=runtime.replace(link.toString()+'\n\n','').replace(safeBlock,oldBlock);assert.notEqual(legacy,runtime);assert.equal(harden(legacy),runtime);
});
test('migration generation refuses unknown or partially hardened source instead of guessing',()=>{
  assert.throws(()=>harden('function renderCalendar() {}'),/source changed/);assert.throws(()=>harden(link.toString()+'\nfunction renderCalendar() {}'),/source changed/);
});
