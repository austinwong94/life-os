const {test}=require('node:test'),assert=require('node:assert/strict');
const agenda=require('../property-stay-agenda.js');
const options={departure:booking=>booking.departure,tentative:booking=>['inquiry','quoted'].includes(booking.status)};
const booking=(id,arrival,departure,extra={})=>({id,guest:id,arrival,departure,unknown:{keep:true},...extra});
test('stay groups use non-overlapping calendar-day boundaries and keep same-day turnovers',()=>{
  const rows=[booking('arriving','2026-10-17','2026-10-19'),booking('staying','2026-10-16','2026-10-19'),booking('leaving','2026-10-15','2026-10-17')];
  const result=agenda.model(rows,'2026-10-17',options);assert.deepEqual(result.arrivals.map(b=>b.id),['arriving']);assert.deepEqual(result.continuing.map(b=>b.id),['staying']);assert.deepEqual(result.departures.map(b=>b.id),['leaving']);
});
test('a booking is never counted both as arrival and continuing stay, and checkout is not an occupied night',()=>{
  const row=booking('stay','2026-10-17','2026-10-19');assert.equal(agenda.model([row],'2026-10-17',options).continuing.length,0);assert.equal(agenda.model([row],'2026-10-19',options).continuing.length,0);assert.equal(agenda.model([row],'2026-10-20',options).departures.length,0);
});
test('tentative leads are excluded but complimentary confirmed stays still require operational attention',()=>{
  const rows=['inquiry','quoted','confirmed'].map(status=>booking(status,'2026-10-17','2026-10-18',{status,excludeFromCalculations:true}));assert.deepEqual(agenda.model(rows,'2026-10-17',options).arrivals.map(b=>b.id),['confirmed']);
});
test('day navigation handles month year leap-day and bounded calendar edges',()=>{
  for(const [from,step,to]of [['2026-10-31',1,'2026-11-01'],['2027-01-01',-1,'2026-12-31'],['2028-02-28',1,'2028-02-29'],['2028-03-01',-1,'2028-02-29'],['2026-02-28',1,'2026-03-01'],['0001-01-01',-1,''],['9999-12-31',1,'']])assert.equal(agenda.shift(from,step),to);
});
test('invalid or incomplete dates and non-integer shifts are refused instead of rolling into another day',()=>{
  for(const day of ['2026-02-30','2026-10-1','0000-01-01','bad','',null]){assert.equal(agenda.validDay(day),false);assert.equal(agenda.shift(day,1),'');assert.throws(()=>agenda.model([],day,options));}assert.equal(agenda.shift('2026-10-17',0.5),'');
});
test('malformed stay intervals are reported without changing, normalizing or deleting original rows',()=>{
  const rows=[booking('invalid','bad','2026-10-19'),booking('zero','2026-10-17','2026-10-17'),booking('negative','2026-10-18','2026-10-17'),booking('unknown','2026-10-17','bad')],before=JSON.stringify(rows);assert.equal(agenda.model(rows,'2026-10-17',options).invalid,4);assert.equal(JSON.stringify(rows),before);
});
test('projection retains all rows beyond eight and sorts only its derived arrays',()=>{
  const rows=Array.from({length:20},(_,i)=>booking(String(20-i),'2026-10-17','2026-10-18')),before=JSON.stringify(rows),result=agenda.model(rows,'2026-10-17',options);assert.equal(result.arrivals.length,20);assert.equal(JSON.stringify(rows),before);assert.deepEqual(result.arrivals.map(b=>b.guest),[...rows].map(b=>b.guest).sort((a,b)=>a.localeCompare(b)));
});
test('a failing date reader cannot crash the rest of the operational agenda',()=>{
  const rows=[booking('bad','2026-10-17','2026-10-18'),booking('good','2026-10-17','2026-10-18')],result=agenda.model(rows,'2026-10-17',{...options,departure:booking=>{if(booking.id==='bad')throw Error('Malformed original');return booking.departure;}});assert.equal(result.invalid,1);assert.deepEqual(result.arrivals.map(b=>b.id),['good']);
});
test('adjacent calendar days are timezone-independent across daylight-saving transitions',()=>{
  for(const [from,to]of [['2026-03-08','2026-03-09'],['2026-11-01','2026-11-02']])assert.equal(agenda.shift(from,1),to);
});
test('controller construction has explicit dependencies and no eager storage network or record reads',()=>{
  assert.throws(()=>agenda.create({}),/dependencies/);const fail=()=>{throw Error('Must not read during construction');};const controller=agenda.create({document:{},read:fail,scope:fail,today:fail,departure:fail,tentative:fail,openBooking:fail,available:fail});controller.refresh();assert.deepEqual(Object.keys(controller),['mount','refresh']);
});
test('the actual booking opener refuses duplicate identities across villas without opening an editor',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync('property-runtime.js','utf8'),start=source.indexOf('function openAgendaBooking('),end=source.indexOf('\nfunction ',start+1),calls=[];
  const context={bookings:[{id:'same',villa:'Sunrise'},{id:'same',villa:'Windmill'},{id:'unique',villa:'Sunrise'}],openBookingWorkspace:(...args)=>calls.push(args)};vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.open=openAgendaBooking;',context);
  assert.equal(context.open('same'),false);assert.equal(context.open('missing'),false);assert.equal(calls.length,0);assert.equal(context.open('unique'),true);assert.deepEqual(calls,[['unique','overview']]);
});
