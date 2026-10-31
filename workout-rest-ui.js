(function(root) {
  'use strict';
  const timer=root.LifeWorkoutRest.create();
  const labels={ready:'Ready',running:'Resting',paused:'Paused',finished:'Rest complete'};
  function paint(node) {
    const value=timer.read(),output=node.querySelector('output'),status=node.querySelector('[role=status]');
    if(output.textContent!==value.text)output.textContent=value.text;
    if(status.textContent!==labels[value.phase])status.textContent=labels[value.phase];
    node.dataset.phase=value.phase;
    const select=node.querySelector('select'),toggle=node.querySelector('[data-rest-toggle]'),reset=node.querySelector('[data-rest-reset]');
    if(select.value!==String(value.durationSeconds))select.value=String(value.durationSeconds);
    select.disabled=['running','paused'].includes(value.phase);
    const label=value.phase==='running'?'Pause rest':value.phase==='paused'?'Resume rest':'Start rest';
    if(toggle.getAttribute('aria-label')!==label) {
      toggle.setAttribute('aria-label',label);toggle.title=label;
      toggle.innerHTML=ICONS[value.phase==='running'?'pause':'play'];
    }
    reset.disabled=value.phase==='ready';
  }
  function refresh() {
    for(const node of document.querySelectorAll('.workout-rest'))paint(node);
  }
  function render() {
    const node=planningNode('section','workout-rest');node.setAttribute('aria-label','Rest timer');
    node.title='Temporary timer for this tab. Refreshing or closing resets it; no background alarm.';
    const heading=planningNode('div','workout-rest-heading'),label=planningNode('div','workout-rest-label');
    label.append(planningNode('h3','','Rest timer'));
    const status=planningNode('span','workout-rest-status');status.setAttribute('role','status');label.append(status);
    const output=planningNode('output','workout-rest-time');output.setAttribute('role','timer');output.setAttribute('aria-live','off');output.setAttribute('aria-label','Rest remaining');
    heading.append(label,output);
    const controls=planningNode('div','workout-rest-controls');controls.setAttribute('role','group');controls.setAttribute('aria-label','Rest timer controls');
    const select=planningSelect([30,60,90,120,180,300,600].map(seconds=>[String(seconds),seconds<60?seconds+' sec':Math.floor(seconds/60)+' min'+(seconds%60?' '+seconds%60+' sec':'')]),String(timer.read().durationSeconds),value=>{timer.change('duration',Number(value));paint(node);});
    select.id='workout-rest-duration';select.setAttribute('aria-label','Rest duration');select.title='Rest duration';
    const toggle=planningButton('',()=>{timer.change(timer.read().phase==='running'?'pause':'start');paint(node);},'play');toggle.id='workout-rest-toggle';toggle.dataset.restToggle='';
    const reset=planningButton('',()=>{const focused=document.activeElement===reset;timer.change('reset');paint(node);if(focused)toggle.focus({preventScroll:true});},'rotate-ccw');reset.id='workout-rest-reset';reset.dataset.restReset='';reset.setAttribute('aria-label','Reset rest');reset.title='Reset rest';
    controls.append(select,toggle,reset);node.append(heading,controls);paint(node);return node;
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  root.addEventListener('focus',refresh);
  root.LifeWorkoutRestUI=Object.freeze({render,refresh});
})(window);
