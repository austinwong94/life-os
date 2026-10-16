const assert=require('node:assert/strict');

const today='2026-10-16';
const profiles=Object.freeze({
  small:Object.freeze({days:30,boards:2,tasks:24}),
  medium:Object.freeze({days:180,boards:3,tasks:120}),
  large:Object.freeze({days:730,boards:4,tasks:360})
});
const words='walk window book garden music friend river idea morning train exercise market dinner quiet plan conversation sunlight rest sketch journey'.split(' ');
function text(seed,length){
  let value=seed>>>0,out='';
  while(out.length<length){value=(Math.imul(value,1664525)+1013904223)>>>0;out+=words[value%words.length]+' ';}
  return out.slice(0,length);
}
function dateBefore(days){return new Date(Date.parse(today+'T00:00:00Z')-days*86400000).toISOString().slice(0,10);}
function fixture(name){
  assert(Object.hasOwn(profiles,name),'Unknown synthetic profile');
  const profile=profiles[name],boards=[];
  for(let b=0;b<profile.boards;b++){
    const prefix='synthetic-'+b,diaryEntries={},sideNoteEntries={},fitnessEntries={},foodEntries={};
    for(let d=0;d<profile.days;d++){
      const date=dateBefore(d),stamp=Date.parse(date+'T04:00:00Z'),seed=b*100003+d*37;
      diaryEntries[date]={feeling:['Happy','Calm','Neutral'][d%3],sentence:text(seed,55),thoughts:text(seed+1,420+d%180)+'\n'+text(seed+2,100),updatedAt:stamp};
      if(d%3===0)sideNoteEntries[date]={notes:[{id:prefix+'-note-'+d,text:text(seed+3,130),createdAt:stamp}],updatedAt:stamp};
      if(d%7===0){
        fitnessEntries[date]={parts:{chest:{active:true,notes:'Synthetic reference only',exercises:[{id:prefix+'-exercise-'+d,name:'Bench press',sets:3,reps:'8-10',weightKg:20+d%15+0.25,rpe:7,notes:''}]}},metrics:{weightKg:70+d%5/10,heightCm:175},notes:text(seed+4,80),updatedAt:stamp};
        foodEntries[date]={meals:[{id:prefix+'-meal-'+d,name:'Lunch',items:[{id:prefix+'-food-'+d,foodId:'rice',name:'Synthetic rice',amount:150,unit:'g',servingUnit:'100 g',servingGrams:100,source:'Synthetic benchmark, not nutrition advice',calories:130,protein:2.7,carbs:28,fat:0.3,fiber:0.4}]}],updatedAt:stamp};
      }
    }
    const plannerTasks=Array.from({length:profile.tasks},(_,i)=>{
      const date=dateBefore(i%profile.days),stamp=Date.parse(date+'T04:00:00Z'),done=i%4!==0;
      return {id:prefix+'-task-'+i,title:'Synthetic task '+i+' '+text(i+b*3,55),dateKey:date,originalDateKey:date,done,completedOn:done?date:'',completedAt:done?stamp:0,completionRecordedAt:done?stamp:0,createdAt:stamp,updatedAt:stamp,archivedAt:i%17===0?stamp:0,deletedAt:0};
    });
    boards.push({id:prefix,name:'Synthetic board '+(b+1),diaryEntries,sideNoteEntries,fitnessEntries,foodEntries,plannerTasks});
  }
  return {name,today,profile:{...profile},boards};
}
function summarize(values){
  assert(Array.isArray(values) && values.every(n=>Number.isFinite(n) && n>=0),'Timings must be finite nonnegative numbers');
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),round=n=>Math.round(n*100)/100;
  const middle=Math.floor(sorted.length/2),median=sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  return {samples:values.length,min:round(sorted[0]),median:round(median),p95:round(sorted[Math.ceil(sorted.length*0.95)-1]),max:round(sorted.at(-1))};
}
async function seedWorkspace(input){
  const previousRaw=localStorage.getItem(STORAGE_KEY);
  state.boards=input.boards.map(source=>{
    const cards=[];
    for(const [type,suffix,fields] of [
      ['diary','diary',{activeDate:input.today,diaryEntries:source.diaryEntries}],
      ['sidenote','notes',{activeSideNoteDate:input.today,sideNoteEntries:source.sideNoteEntries}],
      ['fitness','fitness',{activeFitnessDate:input.today,fitnessEntries:source.fitnessEntries}],
      ['food','food',{activeFoodDate:input.today,foodEntries:source.foodEntries}],
      ['planner','planner',{activePlannerDate:input.today}]
    ]){
      const card=makeCard({type,title:'Synthetic '+suffix,...fields});card.id=source.id+'-'+suffix;
      if(type==='planner'){card.plannerSchemaVersion=2;card.plannerTasks=source.plannerTasks;}
      card.unknownOriginal={preserve:'Original benchmark metadata',board:source.id};cards.push(card);
    }
    const archived=makeCard({type:'diary',title:'Synthetic archived diary',activeDate:input.today,diaryEntries:LifeStateMerge.copy(source.diaryEntries)});archived.id=source.id+'-archive';archived.archivedAt=1;
    return createBoardRecord({id:source.id,name:source.name,cards,archivedCards:[archived]});
  });
  applyBoardToState(state,'synthetic-0');sessionStorage.setItem(LifeStorageScope.key('life-os-active-board'),state.activeBoardId);state.ui.workspaceMode='board';
  const start=performance.now(),staged=saveState({skipCloud:true}),stageMs=performance.now()-start,flushed=await flushDeviceWrites();render();
  return {staged,flushed,stageMs,bytes:new Blob([localStorage.getItem(STORAGE_KEY) || '']).size,storage:LifeDeviceStore.diagnostics(),previousMainUnchanged:localStorage.getItem(STORAGE_KEY)===previousRaw};
}
module.exports={fixture,profiles,summarize,seedWorkspace};
