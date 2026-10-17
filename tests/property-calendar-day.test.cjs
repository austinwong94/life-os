const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {enhancePropertyCalendarDay:enhance,showPropertyCalendarDay}=require('../tools/property-calendar-day.cjs');

test('day-details controller requires explicit dependencies and has no eager browser or network side effects',()=>{
  const api=require('../property-calendar-day.js');assert.deepEqual(Object.keys(api),['create']);assert.throws(()=>api.create({}),/dependencies/);assert.throws(()=>api.create({document:{},getDay(){},openBooking(){}}),/dependencies/);
  const view=api.create({document:{},getDay(){throw new Error('No eager reads');},openBooking(){},reservationLink(){}});for(const day of ['not-a-date','2026-02-31','2026-99-99'])assert.equal(view.open(day),false);view.refresh();view.close();
  const locked=api.create({document:{defaultView:{frameElement:{hidden:true}}},getDay(){throw new Error('Must not read locked records');},openBooking(){},reservationLink(){}});assert.equal(locked.open('2026-10-20'),false);
});
test('day projection uses existing date overlap rules, keeps all rows and never mutates the source',()=>{
  const bookings=Array.from({length:8},(_,i)=>({id:'b'+i,guest:'Guest '+i,arrival:'2026-10-20',departure:'2026-10-22',channel:'Direct'})),imported=Array.from({length:12},(_,i)=>({villa:'Sunrise',start:'2026-10-20',end:'2026-10-22',reservationUrl:'https://airbnb.com/SYNTHETIC-'+i}));imported.push({villa:'Windmill',start:'2026-10-20',end:'2026-10-22'});
  const before=JSON.stringify({bookings,imported}),calls=[],context={document:{},propertyCalendarDayView:null,LifePropertyCalendarDay:{create:options=>{context.options=options;return{open:(...args)=>calls.push(args)};}},propertyReservationLink:value=>value,scopedBookings:()=>bookings,openBookingDialog:booking=>calls.push(booking.id),appSettings:{activeVilla:'Sunrise',ical:{imported}},dateObj:value=>new Date(value+'T00:00:00Z'),shortDate:value=>value,departureFor:booking=>booking.departure,isTentativeBooking:()=>false,overlapsDate:(booking,date)=>booking.arrival<=date&&date<booking.departure};
  context.isoDate=date=>date.toISOString().slice(0,10);context.addDays=(date,days)=>new Date(date.getTime()+days*86400000);
  vm.createContext(context);vm.runInContext(showPropertyCalendarDay.toString()+'\nshowPropertyCalendarDay("2026-10-20", "synthetic-trigger");',context);
  const model=context.options.getDay('2026-10-20');assert.equal(model.bookings.length,8);assert.equal(model.availability.length,12);assert.equal(model.property,'Sunrise Villa');assert.equal(context.options.getDay('2026-10-22').bookings.length,0);assert.equal(context.options.getDay('2026-10-22').availability.length,0);assert.equal(JSON.stringify({bookings,imported}),before);
  context.options.openBooking('b7');assert.equal(calls.at(-1),'b7');context.options.openBooking('missing');assert.equal(calls.at(-1),'b7');assert.equal(context.options.reservationLink('original'),'original');
});
test('day projection changes villa scope without mixing imported blocks or recreating a controller',()=>{
  let created=0;const context={document:{},propertyCalendarDayView:null,LifePropertyCalendarDay:{create:options=>{created++;context.options=options;return{open(){}};}},propertyReservationLink:value=>value,scopedBookings:()=>[],openBookingDialog(){},appSettings:{activeVilla:'Sunrise',ical:{imported:[{villa:'Sunrise',start:'2026-10-20',end:'2026-10-22'},{villa:'Windmill',start:'2026-10-20',end:'2026-10-22'}]}},dateObj:value=>new Date(value+'T00:00:00Z'),shortDate:value=>value,departureFor(){},isTentativeBooking(){},overlapsDate(){}};
  context.isoDate=date=>date.toISOString().slice(0,10);context.addDays=(date,days)=>new Date(date.getTime()+days*86400000);
  vm.createContext(context);vm.runInContext(showPropertyCalendarDay.toString()+'\nshowPropertyCalendarDay("2026-10-20");',context);context.appSettings.activeVilla='Windmill';vm.runInContext('showPropertyCalendarDay("2026-10-20");',context);assert.equal(created,1);assert.equal(context.options.getDay('2026-10-20').property,'Windmill Villa');assert.equal(context.options.getDay('2026-10-20').availability.length,1);
});
test('migration generation retains every day-details hook and rejects partial or unknown source layouts',()=>{
  const runtime=fs.readFileSync('property-runtime.js','utf8');assert(runtime.includes(showPropertyCalendarDay.toString()));assert.equal(enhance(runtime),runtime);assert.throws(()=>enhance(runtime.replace('propertyCalendarDayView?.refresh();','')),/source changed/);assert.throws(()=>enhance('function renderCalendar() {}'),/source changed/);
  assert.match(fs.readFileSync('tools/build-property-operations.cjs','utf8'),/app=enhancePropertyCalendarDay\(app\)/);const html=fs.readFileSync('property-operations.html','utf8');assert(html.indexOf('src="property-calendar-day.js"')<html.indexOf('src="property-runtime.js"'));assert(require('../release-files.json').includes('property-calendar-day.js'));
});
