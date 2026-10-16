const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Script}=require('node:vm');
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
const references=/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g;
const integrity=text=>'sha256-'+crypto.createHash('sha256').update(text).digest('base64');

function guardedStartup(html,contents,id,localAsset,name){
  const scripts=[];
  html=html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>|<link\b[^>]*\bhref="([^"]+)"[^>]*>/g,(tag,script,link)=>{
    const file=localAsset(script || link);
    if(!file)return tag;
    if(!file.endsWith('.js') && !file.endsWith('.css'))throw new Error('Unsupported startup asset: '+file);
    if(script){
      if(/\s(?:async|defer|type|nomodule)(?:\s|=|>)/i.test(tag))throw new Error('Startup bundle requires plain classic scripts: '+file);
      scripts.push(file);return '';
    }
    if(!/^<link\s+rel="stylesheet"\s+href="[^"]+"\s*\/?>$/.test(tag))throw new Error('Unsupported release stylesheet link');
    const css=contents.get(file);
    // Inline sheets belong to the same HTML response and are available before
    // deferred scripts. External CSSOM readiness can lag even a completed fetch.
    if(/<\/style\b|@import\b|@charset\b/i.test(css))throw new Error('Unsupported embedded release stylesheet: '+file);
    return '<style data-release-style="'+file+'">\n'+css+'\n</style>';
  });
  // This builder supports the repository's explicit classic-script markup only.
  // Unrecognised/inline tags must fail rather than bypass the checked bundle.
  if(/<script\b/i.test(html))throw new Error('Unsupported startup script markup');
  for(const [tag] of html.matchAll(/<link\b[^>]*>/gi)){
    if(/\brel\s*=\s*["']?stylesheet\b/i.test(tag))throw new Error('Unsupported stylesheet markup');
  }
  if(new Set(scripts).size!==scripts.length)throw new Error('Duplicate startup asset');
  const bundleName=name.replace('.html','-startup.js');
  if(contents.has(bundleName))throw new Error('Generated startup filename is reserved: '+bundleName);
  const bundle="if(!window.LifeReleaseStartup)throw new Error('Life OS startup verification is unavailable.');\nwindow.LifeReleaseStartup.begin();\n"+
    scripts.map(file=>'\n;/* '+file+' */\n'+contents.get(file)).join('\n')+'\n;window.LifeReleaseStartup.complete();\n';
  // Parse before writing any artifact: script boundaries must not hide syntax conflicts.
  new Script(bundle,{filename:bundleName});contents.set(bundleName,bundle);
  const style='<style>body[data-release-starting]>:not(#releaseStartup){display:none!important}#releaseStartup{box-sizing:border-box;max-width:560px;margin:48px auto;padding:24px;color:#182321;background:#fff;font:16px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}#releaseStartup h1{font-size:24px;margin:0 0 12px}#releaseStartup a{display:inline-flex;align-items:center;min-height:44px;color:#174fbb}#releaseStartupMessage{white-space:normal}</style>';
  const panel='<section id="releaseStartup" aria-label="Website startup"><h1>Opening Life OS</h1><p id="releaseStartupMessage" role="status">Checking this version before opening your records. If it does not open, check your connection and try again. Keep other tabs with unsaved writing open.</p><a id="releaseStartupRetry" href="">Try loading again</a><noscript><p>Enable JavaScript to use Life OS. Your saved records have not been cleared.</p></noscript></section>';
  const bootstrap='<script src="release-startup.js?v='+id+'" integrity="'+integrity(contents.get('release-startup.js'))+'" defer></script>';
  return html.replace('</head>',style+bootstrap+'</head>').replace('<body>','<body data-release-starting>'+panel).replace('</body>',
    '<script src="'+bundleName+'?v='+id+'" integrity="'+integrity(bundle)+'" defer></script>\n</body>');
}

function buildRelease({root=__dirname,output=path.join(root,'dist')}={}) {
  const files=JSON.parse(fs.readFileSync(path.join(root,'release-files.json'),'utf8'));
  if(!Array.isArray(files) || !files.includes('index.html') || new Set(files).size!==files.length || files.some(file=>typeof file!=='string' || !/^[a-z0-9-]+\.(?:html|js|css)$/.test(file)))throw new Error('Invalid public release manifest');
  const contents=new Map(files.map(file=>{
    const source=path.join(root,file);
    if(!fs.lstatSync(source).isFile() || fs.lstatSync(source).isSymbolicLink())throw new Error('Release source must be a regular file: '+file);
    return [file,fs.readFileSync(source,'utf8')];
  }));
  const localAsset=ref=>{
    if(ref.startsWith('data:'))return null;
    const url=new URL(ref,'https://life-os.invalid/');
    if(url.origin!=='https://life-os.invalid')throw new Error('External startup asset: '+ref);
    const file=decodeURIComponent(url.pathname.slice(1));
    if(!contents.has(file))throw new Error('Startup asset is missing from release manifest: '+file);
    return file;
  };
  for(const [file,html] of contents)if(file.endsWith('.html'))for(const match of html.matchAll(references))localAsset(match[1]);
  const id=digest(JSON.stringify({builder:digest(fs.readFileSync(__filename)),files:[...contents].map(([file,text])=>[file,digest(text)])})).slice(0,16);
  for(const [file,html] of [...contents])if(file.endsWith('.html'))contents.set(file,guardedStartup(html,contents,id,localAsset,file));
  if(fs.existsSync(output) && fs.readdirSync(output).length)throw new Error('Release output must be empty: '+output);
  fs.mkdirSync(output,{recursive:true});
  for(const [file,text] of contents)fs.writeFileSync(path.join(output,file),text);
  const manifest={id,files:Object.fromEntries([...contents].map(([file,text])=>[file,digest(text)]))};
  fs.writeFileSync(path.join(output,'release.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
module.exports={buildRelease};
if(require.main===module){
  try{const output=process.argv[2]?path.resolve(process.argv[2]):path.join(__dirname,'dist');const result=buildRelease({output});console.log('Life OS release '+result.id+' ('+Object.keys(result.files).length+' public files): '+output);}
  catch(error){console.error(error.message);process.exitCode=1;}
}
