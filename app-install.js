(() => {
  'use strict';
  if(window.LifeStartupBlocked)return;
  let prompt=null;
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;});
  window.addEventListener('appinstalled',()=>{prompt=null;});
  function openInstall() {
    const dialog=dailyDialog('Life OS on your device');
    const installed=matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
    if(installed){dialog.append(planningNode('p','app-install-note','Life OS is already open as an app.'));return;}
    dialog.append(planningNode('p','app-install-note','Keep the same Life OS account on each device. A new app installation can have separate browser storage: confirm Saved to cloud before switching. Installation does not import or replace records.'));
    if(PREVIEW_MODE || location.protocol!=='https:') {
      const link=planningNode('a','planning-button','Open the live Life OS website');link.href='https://austinwong94.github.io/life-os/';link.target='_blank';link.rel='noopener noreferrer';dialog.append(link);
      dialog.append(planningNode('p','app-install-note','Install from the live HTTPS website, not a preview or local recovery page.'));return;
    }
    if(prompt){
      const button=planningButton('Install Life OS',async()=>{
        const current=prompt;prompt=null;button.disabled=true;
        try{await current.prompt();const result=await current.userChoice;button.textContent=result.outcome==='accepted'?'Installation accepted':'Installation cancelled';}
        catch{button.textContent='Use your browser installation menu';}
      },'download');dialog.append(button);
    }
    const list=planningNode('dl','app-install-note');
    for(const [device,steps] of [['iPhone / iPad','In Safari, open Share, choose Add to Home Screen, enable Open as Web App if shown, then Add.'],['Android / Chrome / Edge','Open the browser menu and choose Install app or Add to Home screen.'],['Mac / Safari','Choose File, then Add to Dock.']])list.append(planningNode('dt','',device),planningNode('dd','',steps));
    dialog.append(list,planningNode('p','app-install-note','This version needs a connection to open and sync. Installation does not provide background saving while the app is closed. Server-side property calendar jobs remain separate.'));
  }
  const button=planningButton('Install Life OS',openInstall,'download');button.id='installLifeOSButton';
  const panel=document.getElementById('safetyPanel');if(panel)panel.append(button);
  window.LifeInstall=Object.freeze({open:openInstall});
})();
