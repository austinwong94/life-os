(function(root) {
  'use strict';
  function create({now=()=>Date.now()}={}) {
    let durationSeconds=90,remainingMs=90000,deadline=null,mode='ready';
    function read() {
      const time=now();
      if(!Number.isSafeInteger(time) || time<0)throw new Error('The timer clock is unavailable.');
      const left=deadline===null?remainingMs:Math.max(0,Math.min(durationSeconds*1000,deadline-time));
      const phase=mode==='running' && !left?'finished':mode;
      const seconds=Math.ceil(left/1000);
      return {phase,durationSeconds,remainingMs:left,seconds,text:Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')};
    }
    function change(action,value) {
      const before=read();
      if(action==='duration') {
        if(!Number.isInteger(value) || value<15 || value>900)throw new Error('Choose a rest duration from 15 to 900 seconds.');
        if(['running','paused'].includes(before.phase))throw new Error('Reset the timer before changing its duration.');
        durationSeconds=value;remainingMs=value*1000;deadline=null;mode='ready';
      } else if(action==='start') {
        if(before.phase==='running')return before;
        const left=before.phase==='paused'?before.remainingMs:durationSeconds*1000;
        const end=now()+left;
        if(!Number.isSafeInteger(end))throw new Error('The timer deadline is unavailable.');
        remainingMs=left;deadline=end;mode='running';
      } else if(action==='pause') {
        if(before.phase==='running'){remainingMs=before.remainingMs;deadline=null;mode='paused';}
      } else if(action==='reset') {
        remainingMs=durationSeconds*1000;deadline=null;mode='ready';
      } else throw new Error('Unsupported timer command.');
      return read();
    }
    return Object.freeze({read,change});
  }
  const api=Object.freeze({create});
  if(typeof module==='object' && module.exports)module.exports=api;else root.LifeWorkoutRest=api;
})(typeof globalThis==='undefined'?window:globalThis);
