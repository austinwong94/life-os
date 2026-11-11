const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const lock=require('../security/browser-image-lock.json');

async function verifyCiBrowsers(){
  assert.equal(process.platform,'linux','Hosted browser checks require Linux');
  assert.equal(process.arch,'x64','The reviewed hosted image targets Linux amd64');
  assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH,lock.browserPath,'Use the image browsers, not a mutable download cache');
  assert.equal(require('../package.json').devDependencies.playwright,lock.version);
  assert.equal(require('playwright/package.json').version,lock.version,'Installed Playwright must match the image');
  const marker=JSON.parse(fs.readFileSync(path.join(lock.browserPath,'.docker-info'),'utf8'));
  assert.equal(marker.driverVersion,lock.version,'Image browser version differs from the reviewed package');
  assert.equal(marker.dockerImageName,lock.image,'Unexpected browser image');
  const playwright=require('playwright');
  for(const name of ['chromium','webkit']){
    const type=playwright[name],executable=path.resolve(type.executablePath());
    assert(executable.startsWith(lock.browserPath+'/'),'Browser executable must come from the pinned image');
    fs.accessSync(executable,fs.constants.X_OK);
    const browser=await type.launch({headless:true,timeout:30000});
    try{
      const page=await browser.newPage();
      await page.route('**/*',route=>route.abort());
      await page.setContent('<main>Isolated browser preflight</main>',{timeout:10000});
      assert.equal(await page.locator('main').textContent(),'Isolated browser preflight');
      console.log(name+' launched successfully from the pinned Playwright '+lock.version+' image');
    }finally{await browser.close();}
  }
}

module.exports={verifyCiBrowsers};
if(require.main===module)verifyCiBrowsers().catch(error=>{console.error(error.message);process.exitCode=1;});
