(function(root,factory){
  const api=factory();if(typeof module==='object' && module.exports)module.exports=api;else root.LifeCloudTransport=api;
})(globalThis,function(){
  'use strict';
  const delays=[5000,15000,45000];
  function retryAfter(value,now=Date.now()){
    if(!value)return 0;
    const seconds=Number(value);
    const delay=Number.isFinite(seconds)?seconds*1000:Date.parse(value)-now;
    return Number.isFinite(delay) && delay>0?delay:0;
  }
  async function json(url,options={},config={}){
    const controller=new AbortController();let timedOut=false,httpError=null;
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},config.timeoutMs || 15000);
    try{
      const response=await (config.fetch || fetch)(url,{...options,signal:controller.signal});
      if(!response.ok){
        httpError=new Error(config.message || 'Cloud request failed.');httpError.name='CloudRequestError';httpError.status=response.status;
        httpError.retryable=[408,429,500,502,503,504].includes(response.status);
        httpError.retryAfterMs=retryAfter(response.headers.get('Retry-After'));
        if(config.readError){try{httpError.message=await config.readError(response,config.message);}catch{/* Retain the known HTTP status even if its body is unreadable. */}}
        throw httpError;
      }
      return await response.json();
    }catch(error){
      if(httpError)throw httpError;
      if(timedOut || error.name==='AbortError' || error instanceof TypeError){
        const failure=new Error(timedOut?'Cloud request timed out. Your device records are kept.':'Cloud connection is temporarily unavailable. Your device records are kept.');
        failure.name='CloudRequestError';failure.retryable=true;throw failure;
      }
      throw error;
    }finally{clearTimeout(timer);}
  }
  function createRetry({allowed,run,setTimer=setTimeout,clearTimer=clearTimeout}){
    let timer=null,attempt=0,owner='';
    function cancel(){if(timer!==null)clearTimer(timer);timer=null;}
    function reset(){cancel();attempt=0;owner='';}
    function schedule(error,ownerId){
      if(!error.retryable || typeof ownerId!=='string' || !ownerId || !allowed(ownerId))return false;
      if(owner && owner!==ownerId)reset();
      if(timer!==null)return true;
      const delay=Math.max(delays[attempt] || 0,Number(error.retryAfterMs) || 0);
      if(attempt>=delays.length || !Number.isFinite(delay) || delay>2147483647)return false;
      owner=ownerId;attempt++;
      timer=setTimer(()=>{timer=null;if(allowed(ownerId))run(ownerId);},delay);
      return true;
    }
    return {schedule,cancel,reset,status:()=>({attempt,scheduled:timer!==null,owner})};
  }
  return {json,retryAfter,createRetry};
});
