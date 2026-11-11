const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const groups=Object.freeze(['storage','cards','interface','sync']);
const sourceFiles=require('../release-files.json');
const publicFiles=[...sourceFiles,...sourceFiles.filter(file=>file.endsWith('.html')).map(file=>file.replace('.html','-startup.js'))].sort();

function verifyCoreManifests(root){
  const directories=groups.map(group=>'verified-core-manifest-'+group).sort();
  assert.deepEqual(fs.readdirSync(root).sort(),directories,'All core verification groups must provide a manifest');
  let accepted;
  for(const directory of directories){
    const folder=path.join(root,directory),file=path.join(folder,'release.json');
    assert(fs.lstatSync(folder).isDirectory() && !fs.lstatSync(folder).isSymbolicLink(),'Manifest folder must be a directory');
    assert.deepEqual(fs.readdirSync(folder),['release.json'],'Unexpected verification artifact files');
    const stat=fs.lstatSync(file);assert(stat.isFile() && !stat.isSymbolicLink() && stat.size<=128*1024,'Manifest must be a bounded regular file');
    const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
    assert(manifest && typeof manifest==='object' && !Array.isArray(manifest));
    assert.deepEqual(Object.keys(manifest).sort(),['files','id']);assert.match(manifest.id,/^[a-f0-9]{16}$/);
    assert(manifest.files && typeof manifest.files==='object' && !Array.isArray(manifest.files));
    assert.deepEqual(Object.keys(manifest.files).sort(),publicFiles,'Every allowed public file must be verified');
    for(const hash of Object.values(manifest.files))assert.match(hash,/^[a-f0-9]{64}$/);
    if(accepted)assert.deepEqual(manifest,accepted,'Core groups verified different release bytes');else accepted=manifest;
  }
  return accepted;
}
module.exports={groups,verifyCoreManifests};
if(require.main===module){try{const manifest=verifyCoreManifests(process.argv[2]);console.log('All four core groups verified release '+manifest.id+' ('+Object.keys(manifest.files).length+' public files).');}catch(error){console.error(error.message);process.exitCode=1;}}
