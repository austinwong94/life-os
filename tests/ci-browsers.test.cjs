const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const lock=require('../security/browser-image-lock.json');
const source=fs.readFileSync(path.join(__dirname,'../scripts/verify-ci-browsers.cjs'),'utf8');

function fixture(options={}){
  const calls=[],module={exports:{}},marker={driverVersion:lock.version,dockerImageName:lock.image,...options.marker};
  const types=Object.fromEntries(['chromium','webkit'].map(name=>[name,{
    executablePath:()=>options.paths?.[name]||lock.browserPath+'/'+name+'/run',
    async launch(settings){
      calls.push(['launch',name,settings]);if(options.launchFailure===name)throw Error('Browser launch failed');
      return {
        async newPage(){
          if(options.pageFailure===name)throw Error('Page creation failed');
          return {
            async route(pattern,handler){calls.push(['route',name,pattern]);await handler({abort:async()=>calls.push(['blocked',name])});},
            async setContent(content,settings){calls.push(['content',name,content,settings]);if(options.contentFailure===name)throw Error('Content failed');},
            locator:selector=>({textContent:async()=>{calls.push(['read',name,selector]);return options.badContent===name?'Wrong content':'Isolated browser preflight';}})
          };
        },
        async close(){calls.push(['close',name]);}
      };
    }
  }]));
  const modules={
    'node:assert/strict':assert,'node:path':path,
    'node:fs':{constants:{X_OK:1},readFileSync(file,encoding){calls.push(['marker',file,encoding]);if(options.markerFailure)throw Error('No image marker');return options.invalidMarker?'not JSON':JSON.stringify(marker);},accessSync(file,mode){calls.push(['access',file,mode]);if(options.nonExecutable)throw Error('Not executable');}},
    '../security/browser-image-lock.json':lock,
    '../package.json':{devDependencies:{playwright:options.packageVersion||lock.version}},
    'playwright/package.json':{version:options.installedVersion||lock.version},playwright:types
  };
  const context={module,require:name=>{assert(Object.hasOwn(modules,name),'No unexpected dependency: '+name);return modules[name];},process:{platform:options.platform||'linux',arch:options.arch||'x64',env:{PLAYWRIGHT_BROWSERS_PATH:options.browserPath||lock.browserPath}},console:{log:message=>calls.push(['log',message])}};
  vm.runInNewContext(source,context);
  return {run:module.exports.verifyCiBrowsers,calls};
}
test('pinned CI preflight launches both engines with isolated content and always closes them',async()=>{
  const f=fixture();await f.run();
  assert.deepEqual(f.calls.filter(call=>call[0]==='launch').map(call=>[call[1],JSON.parse(JSON.stringify(call[2]))]),[['chromium',{headless:true,timeout:30000}],['webkit',{headless:true,timeout:30000}]]);
  assert.deepEqual(f.calls.filter(call=>call[0]==='close'),[['close','chromium'],['close','webkit']]);
  assert.deepEqual(f.calls.filter(call=>call[0]==='blocked'),[['blocked','chromium'],['blocked','webkit']]);
  assert(f.calls.some(call=>call[0]==='marker' && call[1]==='/ms-playwright/.docker-info'));
  assert.equal(f.calls.filter(call=>call[0]==='log').length,2);
});
for(const [name,options] of [
  ['unsupported OS',{platform:'darwin'}],['unreviewed architecture',{arch:'arm64'}],['mutable browser cache',{browserPath:'/tmp/downloads'}],
  ['package/image mismatch',{packageVersion:'1.64.1'}],['installed/image mismatch',{installedVersion:'1.64.1'}],
  ['missing image marker',{markerFailure:true}],['malformed image marker',{invalidMarker:true}],
  ['image version mismatch',{marker:{driverVersion:'1.64.1'}}],['unexpected image',{marker:{dockerImageName:'example.invalid/custom:latest'}}],
  ['executable outside image',{paths:{chromium:'/ms-playwright-other/run'}}],['missing executable',{nonExecutable:true}]
])test('CI preflight refuses '+name+' before launching browsers',async()=>{
  const f=fixture(options);await assert.rejects(f.run());assert.equal(f.calls.filter(call=>call[0]==='launch').length,0);assert.equal(f.calls.filter(call=>call[0]==='log').length,0);
});
test('a failed browser launch blocks the next engine without claiming success',async()=>{
  const f=fixture({launchFailure:'chromium'});await assert.rejects(f.run(),/Browser launch failed/);assert.deepEqual(f.calls.filter(call=>call[0]==='launch').map(call=>call[1]),['chromium']);assert.equal(f.calls.filter(call=>call[0]==='log').length,0);
});
for(const options of [{pageFailure:'webkit'},{contentFailure:'webkit'},{badContent:'webkit'}])test('failed WebKit smoke check closes both engines and rejects acceptance '+Object.keys(options)[0],async()=>{
  const f=fixture(options);await assert.rejects(f.run());assert.deepEqual(f.calls.filter(call=>call[0]==='close'),[['close','chromium'],['close','webkit']]);assert.equal(f.calls.filter(call=>call[0]==='log').length,1);
});
