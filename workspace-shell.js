(function() {
  'use strict';
  if(window.LifeStartupBlocked)return;
  const sidebar=document.querySelector('.sidebar'),modes=document.querySelector('.workspace-modes'),tools=document.querySelector('.rail-nav');
  if(!sidebar || !modes || !tools)return;
  document.body.classList.add('has-workspace-shell');
  const accentGroup=document.getElementById('appearanceAccents'),backgroundGroup=document.getElementById('appearanceBackgrounds'),customAccent=document.getElementById('appearanceCustomAccent');
  const applyAppearance=()=>{
    const appearance=LifeAppearance.normalize(state.board.appearance);
    for(const [key,value] of Object.entries(LifeAppearance.tokens(appearance)))document.documentElement.style.setProperty(key,value);
    if(document.activeElement!==customAccent)customAccent.value=appearance.accent;
    document.getElementById('appearanceAccentValue').textContent=appearance.accent.toUpperCase();
    for(const button of accentGroup.querySelectorAll('button')){
      const selected=button.dataset.value===appearance.accent;button.setAttribute('aria-checked',String(selected));button.tabIndex=selected?0:-1;
    }
    if(!accentGroup.querySelector('[aria-checked=true]'))accentGroup.querySelector('button').tabIndex=0;
    for(const button of backgroundGroup.querySelectorAll('button')){
      const selected=button.dataset.value===appearance.background;button.setAttribute('aria-checked',String(selected));button.tabIndex=selected?0:-1;
    }
  };
  const changeAppearance=patch=>{
    if(corruptLocalStateDetected)return;
    const next=LifeAppearance.normalize({...LifeAppearance.normalize(state.board.appearance),...patch});
    if(LifeStateMerge.equal(next,state.board.appearance))return;
    state.board.appearance=next;applyAppearance();saveState({quiet:true});
  };
  const swatches=(group,choices,key)=>{
    for(const [value,label,colour] of choices){
      const button=document.createElement('button');button.type='button';button.setAttribute('role','radio');button.setAttribute('aria-label',label);button.title=label;button.dataset.value=value;
      const swatch=planningNode('span');swatch.style.backgroundColor=colour;swatch.setAttribute('aria-hidden','true');button.append(swatch);
      button.addEventListener('click',()=>changeAppearance({[key]:value}));group.append(button);
    }
    group.addEventListener('keydown',event=>{
      const buttons=[...group.querySelectorAll('button')],index=buttons.indexOf(event.target);
      if(index<0)return;
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:['ArrowRight','ArrowDown'].includes(event.key)?(index+1)%buttons.length:['ArrowLeft','ArrowUp'].includes(event.key)?(index-1+buttons.length)%buttons.length:-1;
      if(next<0)return;event.preventDefault();buttons[next].click();buttons[next].focus({preventScroll:true});
    });
  };
  swatches(accentGroup,LifeAppearance.accents.map(([name,colour])=>[colour,name,colour]),'accent');
  swatches(backgroundGroup,LifeAppearance.backgrounds,'background');
  customAccent.addEventListener('input',()=>changeAppearance({accent:customAccent.value}));
  customAccent.addEventListener('change',()=>changeAppearance({accent:customAccent.value}));
  document.getElementById('resetAppearanceButton').addEventListener('click',()=>changeAppearance(LifeAppearance.defaults));
  window.LifeAppearanceUI={render:applyAppearance};
  applyAppearance();
  const navigation=planningNode('div','shell-navigation');
  const group=(label,ids)=>{
    const section=planningNode('section','shell-nav-group'),heading=planningNode('h2','shell-nav-label',label),nav=planningNode('nav','shell-nav-links');nav.setAttribute('aria-label',label);
    for(const id of ids){const button=document.getElementById(id);if(button)nav.append(button);}
    section.append(heading,nav);navigation.append(section);return nav;
  };
  group('Every day',['todayModeButton','tasksModeButton','boardModeButton']);
  group('Track & reflect',['recordsModeButton','moneyModeButton','propertiesModeButton','prioritiesModeButton']);
  const icons={todayModeButton:'calendar',tasksModeButton:'list',boardModeButton:'layout-grid',recordsModeButton:'pencil',moneyModeButton:'bar-chart',propertiesModeButton:'calendar',prioritiesModeButton:'bar-chart'};
  for(const [id,icon] of Object.entries(icons)){
    const button=document.getElementById(id);if(!button)continue;
    const label=button.textContent.trim();button.replaceChildren();button.innerHTML=ICONS[icon] || '';button.append(planningNode('span','',label));button.title=label;
  }
  sidebar.querySelector('.brand').after(navigation);
  modes.hidden=true;
  const capture=document.getElementById('railAddButton');capture.querySelector('small').textContent='Capture';navigation.prepend(capture);
  const review=document.getElementById('weeklyReviewButton');review.title='Weekly review';review.querySelector('span:last-child').textContent='Weekly review';
  const utilities=group('Tools',[]);utilities.append(review,document.getElementById('railArchiveButton'),document.getElementById('railReportsButton'),document.getElementById('railSettingsButton'));
  const more=document.getElementById('mobileMoreButton');tools.append(more);
  more.onclick=()=>{
    const dialog=dailyDialog('More sections');dialog.classList.add('shell-more');
    const groups=[['Track & reflect',[
      ...(document.getElementById('recordsModeButton')?[['Records','pencil',()=>setWorkspaceMode('records')]]:[]),
      ['Money','bar-chart',()=>setWorkspaceMode('money')],['Properties','calendar',()=>setWorkspaceMode('properties')],['Progress','bar-chart',()=>setWorkspaceMode('priorities')]
    ]],['Tools',[
      ['Capture','plus',openDailyCapture],['Weekly review','bar-chart',openDailyReview],['Archive','archive',openRecordsModal],['Reports','bar-chart',openReportsModal],['Settings','settings',openSettingsModal],['Saving & version','check',openSaveDetails]
    ]]];
    for(const [label,items] of groups){const section=planningNode('section','shell-more-group');section.append(planningNode('h3','',label));for(const [text,icon,action] of items)section.append(planningButton(text,()=>{dialog.close();action();},icon));dialog.append(section);}
  };
  const context=planningNode('span','shell-context');document.querySelector('.workspace-navigation').prepend(context);
  document.querySelector('.workspace-header').append(document.getElementById('headerSaveStatus'));
  const labels={today:'Today',tasks:'Plan',calendar:'Plan / Calendar',board:'My board',money:'Money',priorities:'Progress',records:'Records',properties:'Properties'};
  const render=()=>{
    applyAppearance();
    const mode=state.ui.workspaceMode || 'board';context.textContent=labels[mode] || labels.board;
    document.body.dataset.workspace=mode;
    document.querySelector('.workspace-navigation').hidden=mode!=='board';
    for(const button of navigation.querySelectorAll('button[id$="ModeButton"]')){
      const active=button.id===(mode==='calendar'?'tasks':mode)+'ModeButton';
      if(button.getAttribute('aria-pressed')!==String(active))button.setAttribute('aria-pressed',String(active));
      button.dataset.current=String(active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    }
    const secondary=!['today','tasks','calendar','board'].includes(mode);
    more.setAttribute('aria-label',secondary?'More, current section: '+labels[mode]:'More');
    more.title=secondary?labels[mode]+' · More sections':'More sections';
  };
  let pending=false;
  const observer=new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;render();});});
  observer.observe(elements.boardGrid,{childList:true});
  observer.observe(navigation,{subtree:true,attributes:true,attributeFilter:['aria-pressed']});
  render();
})();
