const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{buildRelease}=require('../build-release.cjs'),browsers=require('playwright');
const out=process.env.TEST_OUTPUT || '/private/tmp/life-os-storage-repair',artifact=path.join(out,'candidate'),engine=process.env.TEST_BROWSER || 'chromium';fs.mkdirSync(out,{recursive:true});buildRelease({output:artifact});
(async()=>{
  const server=http.createServer((req,res)=>{const file=new URL(req.url,'http://test').pathname.slice(1) || 'storage-repair.html';if(!/^[a-z0-9-]+\.(html|js|css|json)$/.test(file) || !fs.existsSync(path.join(artifact,file)))return res.writeHead(404).end();res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'text/plain');res.end(fs.readFileSync(path.join(artifact,file)));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/storage-repair.html',browser=await browsers[engine].launch({headless:true}),results=[];
  async function run(name,fn){
    const context=await browser.newContext(),page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await context.route('https://**/*',r=>r.abort());
    try{
      await page.goto(url);await page.evaluate(async()=>{
        const checkpoint={boards:[{id:'one',cards:[{id:'diary',thoughts:'Complete original diary\nEvery character retained',unknown:{retained:true}}]}],deviceWriteHeads:{writer:7},unknown:{retained:true}};
        const current=structuredClone(checkpoint);current.deviceWriteHeads.writer=4;localStorage.setItem('progress-board-v1',JSON.stringify(current));localStorage.setItem('life-os-pending-v3:untouched','opaque original pending packet');
        const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('life-os-device-checkpoint-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('checkpoints');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
        await new Promise((resolve,reject)=>{const tx=db.transaction('checkpoints','readwrite');tx.objectStore('checkpoints').put({format:'life-os-device-checkpoint-v1',raw:JSON.stringify(checkpoint)},'current');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
      });
      await fn(page);assert.deepEqual(errors,[]);results.push({name,pass:true});
    }catch(e){results.push({name,pass:false,error:e.stack,errors});await page.screenshot({path:out+'/failure-'+results.length+'.png'}).catch(()=>{});}
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
  await run('identical information repairs only lost receipts and preserves complete originals and pending bytes',async page=>{
    const before=await page.evaluate(()=>localStorage.getItem('progress-board-v1'));await page.getByRole('button',{name:'Check blocked device saves'}).click();await page.getByRole('button',{name:'Repair matching save receipts'}).waitFor();await page.getByRole('button',{name:'Repair matching save receipts'}).click();await page.getByRole('status').filter({hasText:'Missing save receipts repaired'}).waitFor();
    const result=await page.evaluate(async()=>{
      const db=await new Promise(resolve=>{const r=indexedDB.open('life-os-device-checkpoint-v1');r.onsuccess=()=>resolve(r.result);});const rows=await new Promise(resolve=>{const r=db.transaction('checkpoints').objectStore('checkpoints').getAll();r.onsuccess=()=>resolve(r.result);});db.close();
      return {stored:JSON.parse(localStorage.getItem('progress-board-v1')),rows,pending:localStorage.getItem('life-os-pending-v3:untouched')};
    });const expected=JSON.parse(before);expected.deviceWriteHeads.writer=7;assert.deepEqual(result.stored,expected);assert(result.rows.some(row=>row.format==='life-os-receipt-repair-originals-v1' && row.raw===before));assert.equal(result.pending,'opaque original pending packet');
  });
  await run('changed diary information cannot borrow checkpoint receipts or overwrite either copy',async page=>{
    await page.evaluate(()=>{const current=JSON.parse(localStorage.getItem('progress-board-v1'));current.boards[0].cards[0].thoughts='New full writing';localStorage.setItem('progress-board-v1',JSON.stringify(current));});const before=await page.evaluate(()=>localStorage.getItem('progress-board-v1'));await page.getByRole('button',{name:'Check blocked device saves'}).click();await page.getByRole('status').filter({hasText:'Automatic receipt repair is refused'}).waitFor();assert.equal(await page.getByRole('button',{name:'Repair matching save receipts'}).isVisible(),false);assert.equal(await page.evaluate(()=>localStorage.getItem('progress-board-v1')),before);assert.doesNotMatch(await page.locator('#details').innerText(),/New full writing|Complete original diary/);
  });
  for(const mode of ['archive','quota','changed'])await run(mode+' failure refuses receipt repair without deleting originals or pending data',async page=>{
    await page.getByRole('button',{name:'Check blocked device saves'}).click();await page.getByRole('button',{name:'Repair matching save receipts'}).waitFor();
    await page.evaluate(mode=>{
      if(mode==='archive')IDBObjectStore.prototype.add=function(){throw new DOMException('Synthetic archive failure','QuotaExceededError');};
      if(mode==='quota'){const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,...args){if(key==='progress-board-v1')throw new DOMException('Synthetic quota failure','QuotaExceededError');return set.call(this,key,...args);};}
      if(mode==='changed'){const current=JSON.parse(localStorage.getItem('progress-board-v1'));current.unknown.retained='another tab';localStorage.setItem('progress-board-v1',JSON.stringify(current));}
    },mode);const before=await page.evaluate(()=>localStorage.getItem('progress-board-v1'));await page.getByRole('button',{name:'Repair matching save receipts'}).click();await page.getByRole('status').filter({hasText:'Receipt repair did not complete'}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('progress-board-v1')),before);assert.equal(await page.evaluate(()=>localStorage.getItem('life-os-pending-v3:untouched')),'opaque original pending packet');
  });
  fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
