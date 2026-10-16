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
  const bundles=files.filter(file=>file.endsWith('.html')).map(file=>file.replace('.html','-startup.js'));
  assert.deepEqual(fs.readdirSync(output).sort(),[...files,...bundles,'release.json'].sort());
  assert.equal(Object.keys(result.files).length,files.length+bundles.length);
  const html=fs.readFileSync(path.join(output,'index.html'),'utf8');
  const bundle=fs.readFileSync(path.join(output,'index-startup.js'),'utf8');
  for(const file of ['coaching.js','daily-workspace.js'])assert.ok(bundle.includes('/* '+file+' */'));
  for(const file of ['coaching.css','daily-workspace.css'])assert.ok(html.includes('data-release-style="'+file+'"'));
  assert.match(html,/data-release-starting/);
  assert.match(html,/<script src="release-startup.js\?v=[a-f0-9]{16}" integrity="sha256-/);
  assert.equal((html.match(/<script\b[^>]*\bsrc=/g)||[]).length,2);
  const digest=text=>'sha256-'+require('node:crypto').createHash('sha256').update(text).digest('base64');
  for(const match of html.matchAll(/(?:src|href)="([a-z0-9-]+\.(?:js|css))\?v=[a-f0-9]{16}" integrity="([^"]+)"/g))assert.equal(match[2],digest(fs.readFileSync(path.join(output,match[1]))));
  const repair=fs.readFileSync(path.join(output,'storage-repair.html'),'utf8');
  const repairBundle=fs.readFileSync(path.join(output,'storage-repair-startup.js'),'utf8');
  for(const file of ['storage-scope.js','recovery-vault.js','storage-repair.js'])assert.ok(repairBundle.includes('/* '+file+' */'));
  assert.equal((repair.match(/<script\b[^>]*\bsrc=/g)||[]).length,2);
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
test('startup script order remains source order and all styles belong to the same checked release',t=>{
  const root=fixture(t),output=path.join(root,'out');buildRelease({root,output});
  const html=fs.readFileSync(path.join(output,'index.html'),'utf8');
  const bundle=fs.readFileSync(path.join(output,'index-startup.js'),'utf8');
  const original=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.deepEqual([...bundle.matchAll(/;\/\* ([a-z0-9-]+\.js) \*\//g)].map(x=>x[1]),[...original.matchAll(/<script src="([^?]+)/g)].map(x=>x[1]));
  assert.equal((html.match(/<style data-release-style=/g)||[]).length,(original.match(/<link rel="stylesheet"/g)||[]).length);
  assert.equal((html.match(/<link\b[^>]*rel="stylesheet"/g)||[]).length,0);
  for(const match of html.matchAll(/<style data-release-style="([a-z0-9-]+\.css)">\n([\s\S]*?)\n<\/style>/g))assert.equal(match[2],fs.readFileSync(path.join(root,match[1]),'utf8'));
  assert.ok(html.includes('href=""'));assert.match(html,/script-src 'self';/);
});
test('embedded styles cannot escape their HTML element or fetch unverified imported CSS',t=>{
  for(const css of ['</style><script src="untrusted.js"></script>','/* test */\n@import "untrusted.css";','@charset "utf-8";']){
    const root=fixture(t),output=path.join(root,'out');fs.appendFileSync(path.join(root,'styles.css'),css);
    assert.throws(()=>buildRelease({root,output}),/Unsupported embedded release stylesheet/);assert.equal(fs.existsSync(output),false);
  }
});
test('embedding cannot silently discard stylesheet loading or media attributes',t=>{
  for(const extra of [' media="print"',' disabled',' title="alternate"']){
    const root=fixture(t),source=path.join(root,'index.html'),output=path.join(root,'out');
    fs.writeFileSync(source,fs.readFileSync(source,'utf8').replace('<link rel="stylesheet"','<link'+extra+' rel="stylesheet"'));
    assert.throws(()=>buildRelease({root,output}),/Unsupported release stylesheet link/);assert.equal(fs.existsSync(output),false);
  }
});
test('a syntax conflict between concatenated modules fails before creating a partial artifact',t=>{
  const root=fixture(t),output=path.join(root,'out');
  fs.appendFileSync(path.join(root,'cloud-transport.js'),'\nconst PREVIEW_MODE=true;\n');
  assert.throws(()=>buildRelease({root,output}),/already been declared/);assert.equal(fs.existsSync(output),false);
});
test('non-classic startup scripts cannot silently change execution semantics',t=>{
  const root=fixture(t),output=path.join(root,'out'),source=path.join(root,'index.html');
  fs.writeFileSync(source,fs.readFileSync(source,'utf8').replace('<script src="app.js','<script type="module" src="app.js'));
  assert.throws(()=>buildRelease({root,output}),/plain classic scripts/);assert.equal(fs.existsSync(output),false);
});
test('unsupported HTML quoting or inline scripts cannot bypass the guarded entry point',t=>{
  for(const tag of ["<script src='app.js'></script>",'<SCRIPT SRC="app.js"></SCRIPT>','<script>localStorage.clear()</script>',"<link rel='stylesheet' href='styles.css'>"]){
    const root=fixture(t),output=path.join(root,'out');fs.appendFileSync(path.join(root,'index.html'),tag);
    assert.throws(()=>buildRelease({root,output}),/Unsupported/);assert.equal(fs.existsSync(output),false);
  }
});
