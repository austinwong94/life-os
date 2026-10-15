const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {buildRelease}=require('../build-release.cjs');
const files=require('../release-files.json');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'life-os-release-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'release-files.json'),JSON.stringify(files));
  for(const file of files)fs.copyFileSync(path.join(__dirname,'..',file),path.join(root,file));
  return root;
}
test('release contains exactly the allowed assets and hashes every public file',t=>{
  const root=fixture(t);fs.writeFileSync(path.join(root,'.env'),'PRIVATE');fs.writeFileSync(path.join(root,'diary.json'),'PRIVATE');
  const output=path.join(root,'out'),result=buildRelease({root,output});
  assert.deepEqual(fs.readdirSync(output).sort(),[...files,'release.json'].sort());
  assert.equal(Object.keys(result.files).length,files.length);
  const html=fs.readFileSync(path.join(output,'index.html'),'utf8');
  for(const file of ['coaching.js','daily-workspace.js','coaching.css','daily-workspace.css'])assert.ok(html.includes(file+'?v='+result.id));
  const repair=fs.readFileSync(path.join(output,'storage-repair.html'),'utf8');
  for(const file of ['storage-scope.js','recovery-vault.js','storage-repair.js'])assert.ok(repair.includes(file+'?v='+result.id));
});
test('release identity is deterministic and changes with a changed public module',t=>{
  const root=fixture(t),a=buildRelease({root,output:path.join(root,'a')}),b=buildRelease({root,output:path.join(root,'b')});assert.equal(a.id,b.id);
  fs.appendFileSync(path.join(root,'daily-workspace.js'),'\n// synthetic change\n');
  assert.notEqual(buildRelease({root,output:path.join(root,'c')}).id,a.id);
});
test('referenced but unlisted startup assets fail before any output is written',t=>{
  const root=fixture(t);fs.appendFileSync(path.join(root,'index.html'),'<script src="missing.js"></script>');
  const output=path.join(root,'out');assert.throws(()=>buildRelease({root,output}),/missing from release/);assert.equal(fs.existsSync(output),false);
});
test('missing modules cannot become a partial release',t=>{
  const root=fixture(t);fs.unlinkSync(path.join(root,'coaching.js'));
  const output=path.join(root,'out');assert.throws(()=>buildRelease({root,output}));assert.equal(fs.existsSync(output),false);
});
test('nonempty output and symlink sources are rejected without replacing files',t=>{
  const root=fixture(t),output=path.join(root,'out');fs.mkdirSync(output);fs.writeFileSync(path.join(output,'keep.txt'),'keep');
  assert.throws(()=>buildRelease({root,output}),/must be empty/);assert.equal(fs.readFileSync(path.join(output,'keep.txt'),'utf8'),'keep');
  fs.unlinkSync(path.join(root,'coaching.js'));fs.symlinkSync(path.join(root,'app.js'),path.join(root,'coaching.js'));
  assert.throws(()=>buildRelease({root,output:path.join(root,'other')}),/regular file/);
});
