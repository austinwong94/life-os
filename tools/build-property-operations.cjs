// Reproducible, code-only import. Never reads a browser profile or business backup.
const fs=require('node:fs'),path=require('node:path'),{Script}=require('node:vm');
const {hardenPropertyCalendarLinks}=require('./property-calendar-links.cjs');
const source=path.resolve(process.argv[2] || path.join(__dirname,'../../../2026-04-28/sunrise-villa-dashboard'));
const root=path.resolve(__dirname,'..');
function replace(text,from,to){if(!text.includes(from))throw new Error('Property source changed: '+from.slice(0,65));return text.replace(from,to);}
const files=['backup-crypto.js','workflow-core.js','cloud-copies.js','app.js','workspace.js','recovery.js','expense-review.js','backup-ui.js'];
let app=fs.readFileSync(path.join(source,'app.js'),'utf8');
app=hardenPropertyCalendarLinks(app);
app=replace(app,'const SUPABASE_URL = "https://nigzeyamrzrozftbujmm.supabase.co";','const SUPABASE_URL = window.PropertyHost.url;');
app=app.replace(/const SUPABASE_PUBLISHABLE_KEY = "[^"]+";/,'const SUPABASE_PUBLISHABLE_KEY = window.PropertyHost.key;');
app=app.replaceAll('"app_data"','"property_workspaces"').replaceAll('"ical_blocks"','"property_ical_blocks"').replaceAll('"booking_candidates"','"property_booking_candidates"');
app=replace(app,'  return supabaseClient;','  const propertyClient=supabaseClient,functions=propertyClient.functions;\n  const invoke=functions.invoke.bind(functions);\n  const propertyFunctions={invoke:(name,options)=>name===\'property-ical-import\'?invoke(name,options):Promise.resolve({data:null,error:new Error(\'AI tools are disabled. No records were uploaded.\')})};\n  supabaseClient=new Proxy(propertyClient,{get(target,key){if(key===\'functions\')return propertyFunctions;const value=Reflect.get(target,key,target);return typeof value===\'function\'?value.bind(target):value;}});\n  return supabaseClient;');
for(const name of ['ical-import','guest-reply-draft','receipt-scan','earnings-import','tax-doc-analyze','tax-review'])app=app.replaceAll('"'+name+'"','"property-'+name+'"');
app=replace(app,'  return {\n    id: safeRecordId(booking.id),','  return {\n    ...booking,\n    id: safeRecordId(booking.id),');
for(const [name,variable] of [['normalizeDocument','doc'],['normalizePayment','payment'],['normalizeTaxExpense','expense'],['normalizeTaxAsset','asset'],['normalizeCommitment','commitment'],['normalizeOneOffCost','cost']]){
  const at=app.indexOf('function '+name+'('),end=app.indexOf('\nfunction ',at+1);if(at<0 || end<0)throw new Error('Property normalizer changed: '+name);
  const original=app.slice(at,end),marker=name==='normalizeDocument'?'const normalized = {':'return {';
  const updated=replace(original,marker,marker+'\n    ...'+variable+',');app=app.slice(0,at)+updated+app.slice(end);
}
app=replace(app,'const code = codePattern.test(String(doc.code || "")) ? String(doc.code) : documentCodeFor(normalized);','const code = String(doc.code || "").trim() ? String(doc.code) : documentCodeFor(normalized);');
app=replace(app,'    version: 3,\n    appVersion: APP_VERSION,','    ...propertyOriginalFields,\n    version: 3,\n    appVersion: APP_VERSION,');
app=replace(app,'function restoreAppData(data) {\n  const staged = prepareRestoreData(data);','function restoreAppData(data) {\n  const staged = prepareRestoreData(data);\n  propertyOriginalFields = structuredClone(data);');
app=replace(app,'  ({ bookings, documents, taxPlan, profitData, appSettings } = staged);','  ({ bookings, documents, taxPlan, profitData, appSettings } = staged);\n  loadVillaMessageIntoForm();');
app=replace(app,'function renderCheckinMessage() {','function renderCheckinMessage(event) {\n  if(!event || ![\'input\',\'change\'].includes(event.type) || isRestoringCloudData)return;');
app=replace(app,'    templates: {\n      quote: els.quoteTemplateInput','    templates: {\n      ...(base.templates || {}),\n      quote: els.quoteTemplateInput');
for(const [input,key] of [['quoteTemplateInput','quote'],['checkinTemplateInput','checkin'],['guideTemplateInput','guide'],['reminderTemplateInput','reminder']])app=replace(app,'els.'+input+'?.value || dflt("'+key+'")','els.'+input+'?.value ?? dflt("'+key+'")');
app=replace(app,'if (typeof t === "string" && t.trim()) return t;','if (typeof t === "string") return t;');
app=replace(app,'      appSettings = { ...appSettings, lastCloudSyncAt: data.updated_at };','      // Reading a cloud copy must not rewrite saved user settings.');
app=replace(app,'shortDateTimeLabel(appSettings.lastCloudSyncAt)','shortDateTimeLabel(cloudKnownUpdatedAt || appSettings.lastCloudSyncAt)');
app=replace(app,'  return normalizeDocument({\n    ...raw,','  return normalizeDocument({\n    ...existing,\n    ...raw,');
app=replace(app,'if (els.aiDraftBtn) els.aiDraftBtn.disabled = !aiFacts;','if (els.aiDraftBtn) els.aiDraftBtn.disabled = true;');
app=replace(app,'new ResizeObserver(() => fitDocPreviewFrame(frame)).observe(host);',`new ResizeObserver(() => {
        if(host._propertyFitQueued)return;
        host._propertyFitQueued=true;
        requestAnimationFrame(()=>{host._propertyFitQueued=false;fitDocPreviewFrame(frame);});
      }).observe(host);`);
const fitAt=app.indexOf('function fitDocPreviewFrame(frame) {'),fitEnd=app.indexOf('\n// Builds the inner HTML',fitAt);
if(fitAt<0 || fitEnd<0)throw new Error('Property document-fit boundary changed');
app=app.slice(0,fitAt)+`function fitDocPreviewFrame(frame) {
  const host=frame.parentElement;
  if(!host || host.clientWidth<20 || !host.isConnected)return;
  const css=getComputedStyle(host),left=parseFloat(css.paddingLeft)||0,right=parseFloat(css.paddingRight)||0,top=parseFloat(css.paddingTop)||0,bottom=parseFloat(css.paddingBottom)||0;
  const width=Math.max(1,host.clientWidth-left-right),scale=Math.min(1,width/780);
  if(frame.style.width!=='780px')frame.style.width='780px';
  const sheet=frame.contentDocument?.querySelector('.doc-sheet');
  // Measure document content, never its viewport: viewport-derived heights can
  // grow themselves on every ResizeObserver notification in Safari.
  const height=Math.ceil(Math.max(1040,(sheet?.getBoundingClientRect().height || 0)+48));
  const key=width+':'+height+':'+top+':'+bottom;
  if(frame._propertyFit===key)return;
  frame._propertyFit=key;
  host.style.position='relative';host.style.overflow='hidden';host.style.height=Math.ceil(height*scale+top+bottom)+'px';
  frame.style.position='absolute';frame.style.left=left+'px';frame.style.top=top+'px';frame.style.height=height+'px';frame.style.zoom='1';frame.style.transformOrigin='top left';frame.style.transform='scale('+scale+')';
}
`+app.slice(fitEnd);
app=replace(app,'    auth: {\n      storage: svAuthStorage,\n      persistSession: true,\n      autoRefreshToken: true,\n      detectSessionInUrl: true,\n    },','    accessToken: async () => (await window.PropertyHost.session()).access_token,');
const start=app.indexOf('async function initCloudStorage() {'),end=app.indexOf('\nfunction purgeLocalSensitiveData()',start);
if(start<0 || end<0)throw new Error('Property sign-in boundary changed');
app=app.slice(0,start)+`async function initCloudStorage() {
  const client=initSupabaseClient();syncCloudAuthUi();if(!client)return;
  try { await applyCloudSession(await window.PropertyHost.session()); }
  catch { setCloudStatus('error','Life OS sign-in required','Open your Life OS account settings to reconnect. Existing records have not been cleared.'); }
}
cloudEls().form?.addEventListener('submit',event=>{event.preventDefault();window.PropertyHost.account();});
`+app.slice(end);
const logoutStart=app.indexOf('cloudEls().logout?.addEventListener("click", async () => {'),logoutEnd=app.indexOf('\nfunction downloadBackup()',logoutStart);
if(logoutStart<0 || logoutEnd<0)throw new Error('Property account control changed');
app=app.slice(0,logoutStart)+`cloudEls().logout?.addEventListener('click',()=>window.PropertyHost.account());
`+app.slice(logoutEnd);
app=replace(app,'    maybeAutoSyncIcal();','    // Scheduled import remains opt-in until migration acceptance.');
// The existing source keeps only known fields in some normalization paths. The
// immutable archive remains authoritative; unknown root/booking fields survive edits.
// Classic source files ran app startup before later workflow declarations existed.
// In a combined scope functions are hoisted: defer that boot until all companion
// modules have initialized, avoiding their let/const temporal-dead-zone reads.
const bootAt=app.indexOf('\ncreateStartupRecoverySnapshot();');if(bootAt<0)throw new Error('Property startup boundary changed');
const boot=app.slice(bootAt);app=app.slice(0,bootAt);
const parts=files.map(file=>{
  if(file==='app.js')return app;
  let text=fs.readFileSync(path.join(source,file),'utf8');
  if(file==='workflow-core.js')text=replace(text,'    return {\n      id: String(entry.id','    return {\n      ...entry,\n      id: String(entry.id');
  return text;
});
let runtime=`(async function(){\n'use strict';\ntry {\nconst propertySession=await window.PropertyHost.session();\nconst localStorage=await LifePropertyCache.open(propertySession.user.id);\nlet propertyOriginalFields={};\n`+parts.join('\n;\n')+boot+`\nwindow.PropertyOperations={save:saveCloudSnapshot,export:allAppData,pending:()=>cloudDirty || documentHasUnsavedChanges || localStorage.pending(),flush:()=>localStorage.flush()};
for(const [selector,label,cls] of [['.month-switcher','Period','property-period'],['.focus-panel','Payment summary','property-payment-summary']]){
  const section=document.querySelector(selector);if(section){const details=document.createElement('details'),summary=document.createElement('summary');details.className=cls;summary.textContent=label;section.before(details);details.append(summary,section);}
}
document.getElementById('cloudLogout').textContent='Life OS account';
for(const id of ['aiDraftBtn','taxScanInput','taxScanBtn','taxBatchScanBtn','taxEarningsBtn','taxDocAnalyzeBtn','runTaxReviewBtn']){const control=document.getElementById(id);if(control){control.disabled=true;control.title='AI disabled. Manual records remain available.';}}
const aiNotice=document.createElement('p');aiNotice.className='property-ai-notice';aiNotice.textContent='AI tools are off. No guest, receipt or tax records are sent to an AI provider.';document.querySelector('.topbar').after(aiNotice);
window.addEventListener('beforeunload',event=>{if(cloudDirty || documentHasUnsavedChanges || localStorage.pending()){event.preventDefault();event.returnValue='';}});
} catch(error) { window.PropertyHost.failed(error); }
})();\n`;
new Script(runtime,{filename:'property-runtime.js'});
let html=fs.readFileSync(path.join(source,'index.html'),'utf8');
html=html.replaceAll('https://nigzeyamrzrozftbujmm.supabase.co','https://shrmhjulhfuodtrsqhpu.supabase.co').replaceAll('wss://nigzeyamrzrozftbujmm.supabase.co','wss://shrmhjulhfuodtrsqhpu.supabase.co');
html=html.replace(/    <link[^>]+https:\/\/fonts[^>]+>\n/g,'').replace(' https://fonts.googleapis.com','').replace('https://fonts.gstatic.com',"'self'");
html=html.replace(/    <script src="\.\/framebuster[^\n]+\n/,'    <script src="property-host.js"></script>\n');
html=html.replace(/<link rel="stylesheet" href="\.\/styles[^>]+>/,'<link rel="stylesheet" href="property-styles.css" />').replace(/<link rel="stylesheet" href="\.\/workflow[^>]+>/,'<link rel="stylesheet" href="property-workflow.css" />\n    <link rel="stylesheet" href="property-operations.css" />');
html=html.replace(/    <script src="\.\/vendor[^\n]+\n/,'    <script src="property-client.js"></script>\n    <script src="property-cache.js"></script>\n');
for(const file of files)html=html.replace(new RegExp('    <script src="\\./'+file.replace('.','\\.')+'[^\\n]+\\n'),'');
html=html.replace('</body>','    <script src="property-runtime.js"></script>\n  </body>');
const outputs={'property-runtime.js':runtime,'property-operations.html':html,'property-styles.css':fs.readFileSync(path.join(source,'styles.css'),'utf8'),'property-workflow.css':fs.readFileSync(path.join(source,'workflow.css'),'utf8'),'property-client.js':fs.readFileSync(path.join(source,'vendor/supabase-js-2.108.2.min.js'),'utf8')};
for(const [name,text] of Object.entries(outputs))fs.writeFileSync(path.join(root,name),text);
console.log('Imported '+Object.keys(outputs).length+' code-only property assets; no business data embedded.');
