const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync,spawnSync}=require('node:child_process'),YAML=require('yaml');
const {groups,verifyCoreManifests}=require('../scripts/verify-core-manifests.cjs');
const rawWorkflow=YAML.parse(fs.readFileSync(path.join(__dirname,'../.github/workflows/verify.yml'),'utf8'));
const actionLock=require('../security/actions-lock.json');
const browserLock=require('../security/browser-image-lock.json');
const browserJobs=['property-ui-preflight','verify-core','verify-features','verify-properties'];
const browserContainer={image:browserLock.image+'@'+browserLock.digest,options:browserLock.options};
const browserPreflight={name:'Verify pinned browser environment',run:'node scripts/verify-ci-browsers.cjs'};
const checkoutTrust={name:'Trust this disposable CI checkout',run:'git config --global --add safe.directory "$GITHUB_WORKSPACE"'};
const previousRefs={'actions/checkout':'v4','actions/setup-node':'v4','actions/upload-artifact':'v4','actions/download-artifact':'v4','actions/configure-pages':'v5','actions/upload-pages-artifact':'v4','actions/deploy-pages':'v4','denoland/setup-deno':'v2'};
function previousTooling(value){
 const copy=structuredClone(value);
 for(const [name,job] of Object.entries(copy.jobs)){
  if(job['runs-on']==='ubuntu-24.04')job['runs-on']='ubuntu-latest';
  // Normalize only the reviewed setup replacement; all test and release gates stay byte-for-byte comparable.
  if(browserJobs.includes(name) && JSON.stringify(job.container)===JSON.stringify(browserContainer))delete job.container;
  if(browserJobs.includes(name))job.steps=job.steps.filter(step=>JSON.stringify(step)!==JSON.stringify(checkoutTrust));
  job.steps=job.steps.map(step=>JSON.stringify(step)===JSON.stringify(browserPreflight)?{run:'npx playwright install --with-deps chromium webkit'}:step);
  for(const step of job.steps){
   if(!step.uses)continue;
   const action=actionLock.actions.find(action=>step.uses===action.repository+'@'+action.sha);
   if(action)step.uses=action.repository+'@'+previousRefs[action.repository];
  }
 }
 return copy;
}
const workflow=previousTooling(rawWorkflow);
const baseline=YAML.parse(execFileSync('git',['show','069f9b296edd8ca80223da5b99ac6faf77e67021:.github/workflows/verify.yml'],{cwd:path.join(__dirname,'..'),encoding:'utf8'}));
const parallelBaseline=YAML.parse(execFileSync('git',['show','3e17325643295e623335ed582356142f15742236:.github/workflows/verify.yml'],{cwd:path.join(__dirname,'..'),encoding:'utf8'}));
test('reviewed tooling preserves the complete workflow except exact action refs runner and browser setup',()=>{
 assert.deepEqual(workflow,parallelBaseline);
});
test('every browser job uses only the exact reviewed version digest and fail-closed preflight',()=>{
 assert.equal(browserLock.version,'1.63.0');
 assert.equal(browserLock.image,'mcr.microsoft.com/playwright:v1.63.0-noble');
 assert.equal(browserLock.digest,'sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27');
 assert.equal(browserLock.linuxAmd64Manifest,'sha256:bc6ab0d6d44ff4826e4cb8c1e6d801e185bfc42bb0753f8e2a30efc70db054c7');
 assert.equal(browserLock.options,'--init --shm-size=1g');assert.equal(browserLock.browserPath,'/ms-playwright');
 const pkg=require('../package.json'),installed=require('playwright/package.json'),npmLock=require('../package-lock.json');
 assert.equal(pkg.devDependencies.playwright,browserLock.version);assert.equal(installed.version,browserLock.version);
 for(const key of ['','node_modules/playwright','node_modules/playwright-core'])assert.equal(key?npmLock.packages[key].version:npmLock.packages[key].devDependencies.playwright,browserLock.version);
 for(const [name,job] of Object.entries(rawWorkflow.jobs)){
  assert.equal(job.env?.PLAYWRIGHT_BROWSERS_PATH,undefined);
  if(!browserJobs.includes(name)){assert.equal(job.container,undefined);continue;}
  assert.deepEqual(job.container,browserContainer);
  const trusts=job.steps.filter(step=>step.name===checkoutTrust.name || /safe\.directory/.test(step.run||''));assert.deepEqual(trusts,[checkoutTrust]);
  assert.equal(job.steps.indexOf(trusts[0]),1);assert.equal(job.steps[0].with['fetch-depth'],0);
  const steps=job.steps.filter(step=>step.name===browserPreflight.name || step.run===browserPreflight.run);
  assert.deepEqual(steps,[browserPreflight]);
  const install=job.steps.findIndex(step=>step.run==='npm ci'),smoke=job.steps.indexOf(steps[0]);assert(install>=0 && smoke===install+1);
  assert(!job.steps.some(step=>/playwright install|apt-get|sudo apt/.test(step.run||'')));
 }
});
test('every external action is pinned to its exact reviewed official commit',()=>{
 assert.equal(actionLock.actions.length,8);
 assert.equal(new Set(actionLock.actions.map(action=>action.repository)).size,8);
 assert.deepEqual(actionLock.actions.map(action=>action.repository).sort(),Object.keys(previousRefs).sort());
 const used=new Set();
 for(const job of Object.values(rawWorkflow.jobs))for(const step of job.steps){
  if(!step.uses)continue;
  assert.match(step.uses,/^[\w-]+\/[\w-]+@[a-f0-9]{40}$/);
  const action=actionLock.actions.find(action=>step.uses===action.repository+'@'+action.sha);
  assert(action,'Action must have an exact reviewed pin: '+step.uses);used.add(action.repository);
 }
 assert.equal(used.size,8);
 for(const action of actionLock.actions){assert.match(action.version,/^v\d+\.\d+\.\d+$/);assert.equal(action.release,'https://github.com/'+action.repository+'/releases/tag/'+action.version);assert.equal(action.runtime,action.repository==='actions/upload-pages-artifact'?'composite':'node24');}
});
test('runner image and runtime do not silently drift or bypass action compatibility',()=>{
 for(const job of Object.values(rawWorkflow.jobs)){
  assert.equal(job['runs-on'],'ubuntu-24.04');
  for(const scope of [rawWorkflow,job,...job.steps])for(const key of Object.keys(scope.env||{}))assert(!/ACTIONS_(ALLOW_USE_UNSECURE_NODE_VERSION|RUNNER_FORCE_ACTIONS_NODE_VERSION)|FORCE_JAVASCRIPT_ACTIONS_TO_NODE/.test(key),'No runtime compatibility bypass');
 }
});
const common=step=>step.uses==='actions/checkout@v4' || step.uses==='actions/setup-node@v4' || ['npm ci','npx playwright install --with-deps chromium webkit','npm run build'].includes(step.run) || step.name==='Start isolated preview';
const checks=steps=>steps.filter(step=>!common(step) && step.uses!=='actions/upload-artifact@v4');
test('parallel core retains every original verification command and its exact environment once',()=>{
 const previous=checks(baseline.jobs.verify.steps),current=checks(workflow.jobs['verify-core'].steps);
 for(const original of previous){const matches=current.filter(step=>{const {if:condition,...rest}=step;return JSON.stringify(rest)===JSON.stringify(original);});assert.equal(matches.length,1,'Missing or duplicated check: '+(original.name || original.run || original.uses));}
 for(const step of current){assert(groups.some(group=>step.if===`matrix.group == '${group}'`),'Each check must run in exactly one required group');assert.equal(step['continue-on-error'],undefined);}
 assert.equal(current.length,previous.length);
});
test('all parallel groups run setup build and isolated preview with no optional gate',()=>{
 const core=workflow.jobs['verify-core'];assert.deepEqual(core.strategy.matrix.group,[...groups]);assert.equal(core.strategy['fail-fast'],false);assert.equal(core['continue-on-error'],undefined);assert.equal(core.if,undefined);
 assert.equal(core['timeout-minutes'],baseline.jobs.verify['timeout-minutes']);
 assert.deepEqual(core.steps.filter(common),baseline.jobs.verify.steps.filter(common));
 const build=core.steps.findIndex(step=>step.run==='npm run build'),serve=core.steps.findIndex(step=>step.name==='Start isolated preview');assert(build>=0 && serve>build);
 for(const group of groups)assert(checks(core.steps).some(step=>step.if===`matrix.group == '${group}'`));
});
test('each group uploads a unique complete manifest only after its checks pass',()=>{
 const uploads=workflow.jobs['verify-core'].steps.filter(step=>step.uses==='actions/upload-artifact@v4');
 const manifest=uploads.find(step=>step.with.name==='verified-core-manifest-${{ matrix.group }}');assert(manifest);assert.equal(manifest.if,undefined);assert.equal(manifest.with.path,'dist/release.json');assert.equal(manifest.with['if-no-files-found'],'error');
 const diagnostic=uploads.find(step=>step.with.name==='synthetic-core-results-${{ matrix.group }}');assert(diagnostic);assert.equal(diagnostic.if,'always()');
});
test('the original verify gate requires every matrix group and an exact manifest comparison',()=>{
 const gate=workflow.jobs.verify;assert.deepEqual(gate.needs,['verify-core']);assert.equal(gate.if,undefined);assert.equal(gate['continue-on-error'],undefined);
 const download=gate.steps.find(step=>step.uses==='actions/download-artifact@v4');assert.deepEqual(download.with,{pattern:'verified-core-manifest-*',path:'verification/core'});
 assert(gate.steps.some(step=>step.run==='node scripts/verify-core-manifests.cjs verification/core'));
 const upload=gate.steps.find(step=>step.uses==='actions/upload-artifact@v4');assert.equal(upload.with.name,'verified-core-manifest');assert.equal(upload.if,undefined);assert.equal(upload.with['if-no-files-found'],'error');
});
test('deployment and every non-core verification job retain all original safety gates',()=>{
 for(const key of ['on','permissions','concurrency'])assert.deepEqual(workflow[key],baseline[key]);
 for(const job of ['deploy','verify-features','verify-properties','property-ui-preflight'])assert.deepEqual(workflow.jobs[job],baseline.jobs[job]);
 assert(workflow.jobs.deploy.needs.includes('verify'));assert.match(workflow.jobs.deploy.steps.find(step=>step.name==='Verify test jobs accepted identical complete release bytes').run,/actual,hash/);
});
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'life-os-core-groups-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const files=require('../release-files.json'),names=[...files,...files.filter(file=>file.endsWith('.html')).map(file=>file.replace('.html','-startup.js'))];
 const manifest={id:'a'.repeat(16),files:Object.fromEntries(names.map(file=>[file,'b'.repeat(64)]))};
 for(const group of groups){const dir=path.join(root,'verified-core-manifest-'+group);fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'release.json'),JSON.stringify(manifest));}
 return {root,manifest,file:group=>path.join(root,'verified-core-manifest-'+group,'release.json')};
}
test('manifest gate accepts all complete equal public fingerprints without changing files',t=>{
 const {root,manifest,file}=fixture(t),before=fs.readFileSync(file('storage'));assert.deepEqual(verifyCoreManifests(root),manifest);assert.deepEqual(fs.readFileSync(file('storage')),before);
 const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/verify-core-manifests.cjs'),root],{encoding:'utf8'});assert.equal(result.status,0);assert.match(result.stdout,/All four core groups verified release/);
});
test('missing or extra group artifacts block the manifest gate',t=>{
 const {root}=fixture(t);fs.renameSync(path.join(root,'verified-core-manifest-cards'),path.join(root,'unexpected-group'));assert.throws(()=>verifyCoreManifests(root),/All core verification groups/);
});
test('any different release identity or public hash blocks aggregation',t=>{
 const {root,manifest,file}=fixture(t);for(const changed of [{...manifest,id:'c'.repeat(16)},{...manifest,files:{...manifest.files,'app.js':'c'.repeat(64)}}]){fs.writeFileSync(file('sync'),JSON.stringify(changed));assert.throws(()=>verifyCoreManifests(root),/different release bytes/);}
});
test('partial malformed or extra-file manifests cannot be acknowledged',t=>{
 const {root,manifest,file}=fixture(t),incomplete={...manifest.files};delete incomplete['app.js'];
 for(const changed of [{...manifest,files:incomplete},{...manifest,files:{...manifest.files,'private.json':'b'.repeat(64)}},{...manifest,id:'not-a-release'},{...manifest,files:{...manifest.files,'app.js':'short'}},{...manifest,unexpected:true},null]){fs.writeFileSync(file('cards'),JSON.stringify(changed));assert.throws(()=>verifyCoreManifests(root));}
 fs.writeFileSync(file('cards'),'{bad JSON');assert.throws(()=>verifyCoreManifests(root));
});
test('symlinks oversized manifests and extra files are refused',t=>{
 const {root,file}=fixture(t);fs.writeFileSync(path.join(root,'verified-core-manifest-storage','extra.txt'),'Not part of the manifest');assert.throws(()=>verifyCoreManifests(root),/Unexpected verification artifact/);fs.unlinkSync(path.join(root,'verified-core-manifest-storage','extra.txt'));
 fs.writeFileSync(file('storage'),' '.repeat(128*1024+1));assert.throws(()=>verifyCoreManifests(root),/bounded regular file/);fs.unlinkSync(file('storage'));fs.symlinkSync(file('cards'),file('storage'));assert.throws(()=>verifyCoreManifests(root),/bounded regular file/);
});
