const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
const references=/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g;

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
  const html=contents.get('index.html');
  for(const match of html.matchAll(references))localAsset(match[1]);
  const id=digest(JSON.stringify([...contents].map(([file,text])=>[file,digest(text)]))).slice(0,16);
  contents.set('index.html',html.replace(references,(tag,ref)=>{
    const file=localAsset(ref);return file?tag.replace(ref,file+'?v='+id):tag;
  }));
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
