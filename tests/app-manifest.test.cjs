const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{buildRelease}=require('../build-release.cjs');
test('app identity stays under Life OS on live hosting and does not redirect to a second data store',()=>{
  const m=JSON.parse(fs.readFileSync(path.join(__dirname,'../app.webmanifest'),'utf8')),base='https://austinwong94.github.io/life-os/app.webmanifest';
  assert.equal(m.display,'standalone');assert.equal(new URL(m.start_url,base).href,'https://austinwong94.github.io/life-os/?app=1');assert.equal(new URL(m.scope,base).href,'https://austinwong94.github.io/life-os/');assert.equal(new URL(m.id,base).href,'https://austinwong94.github.io/life-os/');
  for(const icon of m.icons){const b=fs.readFileSync(path.join(__dirname,'..',icon.src));assert.deepEqual([...b.subarray(0,8)],[137,80,78,71,13,10,26,10]);const size=Number(icon.sizes.split('x')[0]);assert.equal(b.readUInt32BE(16),size);assert.equal(b.readUInt32BE(20),size);}
});
test('app packaging preserves binary icon bytes while keeping the checked startup bundle',t=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'life-os-install-test-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));const m=buildRelease({output});
  for(const file of ['app-icon-180.png','app-icon-192.png','app-icon-512.png'])assert.deepEqual(fs.readFileSync(path.join(output,file)),fs.readFileSync(path.join(__dirname,'..',file)));
  assert.match(fs.readFileSync(path.join(output,'index.html'),'utf8'),/<link rel="manifest" href="app.webmanifest"/);assert(m.files['health-workspace.js']);assert(m.files['app.webmanifest']);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../app-install.js'),'utf8'),/serviceWorker\.register|localStorage\.clear|\.signOut\(/);
});
