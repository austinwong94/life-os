(() => {
  'use strict';
  let failed=false,complete=false;
  function showFailure(){
    if(complete)return;
    failed=true;
    const message=document.getElementById('releaseStartupMessage');
    if(message)message.textContent='Life OS could not load a complete version. Check your connection and try again. Keep any other Life OS tabs with unsaved writing open. Your saved records have not been cleared.';
  }
  document.addEventListener('click',event=>{
    if(!event.target.closest?.('#releaseStartupRetry'))return;
    event.preventDefault();
    const url=new URL(location.href);url.searchParams.set('startup',String(Date.now()));
    location.replace(url.href);
  });
  window.addEventListener('error',showFailure,true);
  document.addEventListener('DOMContentLoaded',()=>{if(failed)showFailure();},{once:true});
  window.addEventListener('load',()=>{if(!complete)showFailure();},{once:true});
  window.LifeReleaseStartup=Object.freeze({
    begin(){
      // Generated entry pages embed their exact release CSS. Never accept an
      // unexpected external sheet in place of that coherent HTML response.
      if(failed || document.querySelector('link[rel="stylesheet"]') || [...document.querySelectorAll('style[data-release-style]')].some(style=>!style.sheet)){
        showFailure();throw new Error('Life OS startup stopped: release styles are incomplete.');
      }
    },
    complete(){
      if(failed)throw new Error('Life OS startup stopped before readiness.');
      complete=true;
      document.body.removeAttribute('data-release-starting');
      document.getElementById('releaseStartup').remove();
      window.removeEventListener('error',showFailure,true);
    }
  });
})();
