const {webkit}=require('playwright');
(async()=>{
  const browser=await webkit.launch({headless:true});
  const page=await browser.newPage();
  await page.setContent('<form><label>Time<input type="time"></label><button type="button">Elsewhere</button></form>');
  const field=page.getByLabel('Time');
  console.log(JSON.stringify({platform:process.platform,userAgent:await page.evaluate(()=>navigator.userAgent)}));
  for(const keys of [['1'],['Backspace'],['ArrowRight','Backspace'],['Home','Delete'],['ArrowLeft','Backspace'],['ArrowUp'],['Tab','ArrowLeft','Backspace']]){
    await field.fill('12:34');await field.focus();
    const events=[];await field.evaluate(n=>{window.timeEvents=[];for(const type of ['keydown','keyup','beforeinput','input','change','focus','blur'])n.addEventListener(type,e=>timeEvents.push({type:e.type,key:e.key,inputType:e.inputType,value:n.value,badInput:n.validity.badInput,focused:n===document.activeElement}));});
    for(const key of keys)await page.keyboard.press(key);
    console.log(JSON.stringify({keys,result:await field.evaluate(n=>({value:n.value,badInput:n.validity.badInput,valid:n.validity.valid,readOnly:n.readOnly,disabled:n.disabled,focused:n===document.activeElement,html:n.outerHTML,events:timeEvents}))}));
  }
  await browser.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
