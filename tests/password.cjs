const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const output=process.env.TEST_OUTPUT || '/private/tmp/life-os-password-tests';
const url=process.env.TEST_URL || 'http://127.0.0.1:5180/?liveReload=0';
const user={id:'11111111-1111-4111-8111-111111111111',email:'synthetic@example.com'};
const password='Synthetic-only-Passphrase!42';
const results=[];
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await (process.env.TEST_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
 async function run(name,fn){
  const c=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
  await c.route('https://**supabase.co/**',r=>r.fulfill({status:503,json:{msg:'No production access'}}));
  const p=await c.newPage();p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.message));
  try{await p.goto(url);await fn(p,c);assert.deepEqual(errors,[]);results.push({name,pass:true});}
  catch(e){results.push({name,pass:false,error:e.stack});}
  console.log(JSON.stringify(results.at(-1)));await c.close();
 }
 async function signedIn(p){
  await p.evaluate(async user=>{
   state.cloudOwnerId=user.id;saveState({skipCloud:true});await flushDeviceWrites();
   saveCloudSession({user,access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_at:Date.now()+3600000});cloudSaveEnabled=false;
  },user);
  await p.route('https://**supabase.co/auth/v1/user',async r=>{
   assert.equal(r.request().method(),'GET');await r.fulfill({json:user});
  });
  await settings(p);
  await p.locator('#accountPasswordDetails summary').click();
 }
 async function settings(p){
  if(await p.locator('#railSettingsButton').isVisible())await p.locator('#railSettingsButton').click();
  else {await p.locator('#mobileMoreButton').click();await p.getByRole('button',{name:'Settings',exact:true}).click();}
 }
 async function fill(p,value=password){await p.locator('#accountNewPassword').fill(value);await p.locator('#accountConfirmPassword').fill(value);}
 async function records(p){return p.evaluate(()=>JSON.stringify(LifeCloudCopies.records(getStateForStorage())));}
 async function successRoute(p,onPut=()=>{}){
  await p.route('https://**supabase.co/auth/v1/user',async r=>{
   if(r.request().method()==='PUT'){assert.equal(r.request().headers().authorization,'Bearer synthetic-access');onPut(r.request().postDataJSON());}
   await r.fulfill({json:user});
  });
 }
 async function save(p){await p.getByRole('button',{name:'Save password',exact:true}).click();}
 await run('signed-out and preview users cannot set a password or create an account',async p=>{
  await settings(p);assert.equal(await p.locator('#accountPasswordDetails').isVisible(),false);
  assert.match(await p.evaluate(async()=>{try{await accountPasswordRequest({password:'synthetic'});return '';}catch(e){return e.message;}}),/Sign in/);
  await p.goto(url.replace(/\?.*$/,'')+'?preview=1&liveReload=0');
  assert.match(await p.evaluate(async()=>{try{await accountPasswordRequest({password:'synthetic'});return '';}catch(e){return e.message;}}),/disabled in preview/);
 });
 await run('setting a password keeps owner, boards, writing and all storage free of plaintext passwords',async(p,c)=>{
  await signedIn(p);const before=await records(p);let writes=0,registration=0;
  await p.route('https://**supabase.co/rest/**',r=>{writes++;return r.fulfill({status:503});});
  await p.route('https://**supabase.co/auth/v1/signup**',r=>{registration++;return r.fulfill({status:500});});
  const bodies=[];await successRoute(p,body=>bodies.push(body));await fill(p);await save(p);
  await p.getByText(/Password saved for synthetic@example.com/).waitFor();
  assert.deepEqual(bodies,[{password}]);assert.equal(writes,0);assert.equal(registration,0);assert.equal(await records(p),before);
  assert.equal(await p.locator('#accountNewPassword').inputValue(),'');assert.equal(await p.locator('#accountConfirmPassword').inputValue(),'');
  assert.equal(await p.evaluate(secret=>JSON.stringify({...localStorage,...sessionStorage}).includes(secret),password),false);
  assert.equal(await p.evaluate(()=>loadCloudSession().user.id),user.id);
  await p.screenshot({path:output+'/password-mobile.png'});
  await p.setViewportSize({width:1280,height:900});await p.screenshot({path:output+'/password-desktop.png'});
  for(const width of [360,390,768,1080]){
   await p.setViewportSize({width,height:900});
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   assert.equal(await p.locator('#accountPasswordForm').evaluate(f=>[...f.querySelectorAll('input,button')].every(n=>n.getBoundingClientRect().right<=f.getBoundingClientRect().right+1)),true);
  }
  const other=await c.newPage();await other.goto(url);
  await other.route('https://**supabase.co/auth/v1/token?grant_type=password',r=>{
   assert.deepEqual(r.request().postDataJSON(),{email:user.email,password});
   return r.fulfill({json:{access_token:'synthetic-email-login',refresh_token:'synthetic-next',expires_in:3600,user}});
  });
  await other.evaluate(()=>{saveCloudSession(null);syncCloudAfterSignIn=async()=>{};});
  await settings(other);await other.locator('#cloudEmail').fill(user.email);await other.locator('#cloudPassword').fill(password);
  await other.getByRole('button',{name:'Sign in',exact:true}).click();
  await other.waitForFunction(()=>cloudSession?.access_token==='synthetic-email-login');assert.equal(await other.evaluate(()=>cloudSession.user.id),user.id);
 });
 await run('mismatch and short passwords are blocked before any authenticated request',async p=>{
  await signedIn(p);let calls=0;await p.route('https://**supabase.co/auth/v1/user',r=>{calls++;return r.fulfill({json:user});});
  await fill(p);await p.locator('#accountConfirmPassword').fill(password+'wrong');await save(p);await p.getByText(/do not match/).waitFor();assert.equal(calls,0);
  await fill(p,'short');await p.evaluate(()=>setAccountPassword());await p.getByText(/12 to 80 characters/).waitFor();assert.equal(calls,0);
 });
 await run('wrong-owner server identity blocks the credential update',async p=>{
  await signedIn(p);const before=await records(p);let puts=0;
  await p.route('https://**supabase.co/auth/v1/user',r=>{if(r.request().method()==='PUT')puts++;return r.fulfill({json:{...user,id:'wrong-owner'}});});
  await fill(p);await save(p);await p.locator('#accountPasswordNote').filter({hasText:/not the owner/}).waitFor();assert.equal(puts,0);assert.equal(await records(p),before);
 });
 await run('verification code and optional current password retry update only the original user',async p=>{
  await signedIn(p);const before=await records(p);let puts=0,codes=0;
  await p.route('https://**supabase.co/auth/v1/user',r=>{
   if(r.request().method()==='GET')return r.fulfill({json:user});
   puts++;const body=r.request().postDataJSON();
   if(!body.nonce)return r.fulfill({status:422,json:{code:'reauthentication_needed'}});
   assert.deepEqual(body,{password,current_password:'Synthetic-old-only!42',nonce:'123456'});return r.fulfill({json:user});
  });
  await p.route('https://**supabase.co/auth/v1/reauthenticate',r=>{codes++;assert.equal(r.request().method(),'GET');assert.equal(r.request().headers().authorization,'Bearer synthetic-access');return r.fulfill({json:{}});});
  await fill(p);await save(p);await p.getByText(/Email verification is required/).waitFor();
  await p.getByRole('button',{name:'Send verification code'}).click();await p.getByText(/Verification code requested/).waitFor();
  await p.locator('#accountCurrentPassword').fill('Synthetic-old-only!42');await p.locator('#accountPasswordCode').fill('123456');await save(p);
  await p.getByText(/Password saved for/).waitFor();assert.equal(puts,2);assert.equal(codes,1);assert.equal(await records(p),before);
  assert.equal(await p.locator('#accountCurrentPassword').inputValue(),'');assert.equal(await p.locator('#accountPasswordCode').inputValue(),'');
 });
 await run('server errors never report success, echo passwords or discard records',async p=>{
  await signedIn(p);const before=await records(p);
  for(const code of ['weak_password','same_password','current_password_required','server_error']){
   await p.route('https://**supabase.co/auth/v1/user',r=>r.fulfill(r.request().method()==='GET'?{json:user}:{status:422,json:{code,message:password}}));
   await fill(p);await save(p);await p.waitForFunction(()=>!accountPasswordPending);
   const note=await p.locator('#accountPasswordNote').innerText();assert(!note.includes(password));assert(!note.includes('Password saved for'));assert.equal(await records(p),before);
  }
 });
 await run('account sign-out during verification blocks the pending password update',async(p,c)=>{
  await signedIn(p);let release,started,puts=0;const seen=new Promise(r=>started=r);
  await p.route('https://**supabase.co/auth/v1/user',async r=>{
   if(r.request().method()==='PUT'){puts++;return r.fulfill({json:user});}
   started();await new Promise(r=>release=r);await r.fulfill({json:user});
  });
  await fill(p);await save(p);await seen;
  const other=await c.newPage();await other.goto(url);await other.evaluate(()=>localStorage.removeItem(CLOUD_SESSION_KEY));release();
  await p.waitForFunction(()=>!accountPasswordPending);assert.equal(puts,0);assert.equal(await p.evaluate(()=>loadCloudSession()),null);
 });
 await run('success for a different identity and interrupted requests are never called saved',async p=>{
  await signedIn(p);const before=await records(p);
  await p.route('https://**supabase.co/auth/v1/user',r=>r.fulfill({json:r.request().method()==='GET'?user:{...user,id:'wrong-owner'}}));
  await fill(p);await save(p);await p.getByText(/response could not be verified/).waitFor();assert.equal(await records(p),before);
  await p.route('https://**supabase.co/auth/v1/user',r=>r.request().method()==='GET'?r.fulfill({json:user}):r.abort());
  await save(p);await p.getByText(/connection was interrupted/).waitFor();assert.equal(await records(p),before);
 });
 await run('closing settings clears all credentials even without submitting',async p=>{
  await signedIn(p);await fill(p);await p.locator('#accountCurrentPassword').fill('Synthetic-old-only!42');
  await p.locator('#settingsModalCloseButton').click();
  for(const id of ['accountNewPassword','accountConfirmPassword','accountCurrentPassword','accountPasswordCode'])assert.equal(await p.locator('#'+id).inputValue(),'');
 });
 await browser.close();fs.writeFileSync(output+'/password.json',JSON.stringify(results,null,2));
 if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
