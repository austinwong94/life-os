const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('property-runtime.js','utf8');
function extract(name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);assert(start>=0 && end>start);return source.slice(start,end);}
test('unsupported document editor modes cannot access the DOM or replace a draft',()=>{
  const context={document:{querySelector(){throw Error('Must not access a draft');}}};vm.createContext(context);vm.runInContext(extract('setDocumentEditorMode'),context);assert.equal(context.setDocumentEditorMode('other'),false);
});
test('document editor mode selection changes only existing view metadata and button selection',()=>{
  const buttons=['editor','preview'].map(mode=>({dataset:{mobileDocument:mode},classList:{toggle(key,value){this[key]=value;}},setAttribute(key,value){this[key]=value;}})),view={dataset:{retained:'original'},querySelectorAll:()=>buttons},context={document:{querySelector:()=>view}};vm.createContext(context);vm.runInContext(extract('setDocumentEditorMode'),context);
  assert.equal(context.setDocumentEditorMode('preview'),true);assert.equal(view.dataset.mobileDocument,'preview');assert.equal(view.dataset.retained,'original');assert.equal(buttons[0]['aria-pressed'],'false');assert.equal(buttons[1]['aria-pressed'],'true');assert.equal(buttons[0].classList.active,false);assert.equal(buttons[1].classList.active,true);
});
test('document validation reveals only containing disclosures inside the original form without replacing its field',()=>{
  const outer={tagName:'DETAILS',open:false},form={parentElement:outer,contains:()=>true},section={tagName:'DETAILS',open:false,parentElement:form},nested={tagName:'DETAILS',open:false,parentElement:section},field={value:'Complete original text',parentElement:nested},calls=[],context={els:{documentForm:form},setDocumentWorkspace:mode=>calls.push(mode),setDocumentEditorMode:mode=>calls.push(mode)};vm.createContext(context);vm.runInContext(extract('revealDocumentField'),context);context.revealDocumentField(field);assert.deepEqual(calls,['editor','editor']);assert(section.open && nested.open);assert.equal(outer.open,false);assert.equal(field.value,'Complete original text');assert.equal(field.parentElement,nested);
});
test('foreign and missing validation targets cannot switch or unfold the document editor',()=>{
  const context={els:{documentForm:{contains:()=>false}},setDocumentWorkspace(){throw Error('Must not switch');},setDocumentEditorMode(){throw Error('Must not switch');}};vm.createContext(context);vm.runInContext(extract('revealDocumentField'),context);context.revealDocumentField(null);context.revealDocumentField({parentElement:{tagName:'DETAILS',open:false}});
});

function archiveContext(name,overrides={}){
  const calls=[],context={documents:[{id:'original',code:'ORIGINAL',customAudit:{retained:true}},{id:'other',code:'OTHER'}],confirmDocumentReplacement:()=>true,LifePropertyBookingList:require('../property-booking-list.js'),fillDocumentForm:doc=>calls.push(['fill',doc]),documentHasUnsavedChanges:false,els:{documentId:{value:'original'}},window:{confirm:()=>true},document:{querySelector:()=>({textContent:''})},createRecoverySnapshot:reason=>calls.push(['snapshot',reason]),saveDocuments:()=>calls.push(['save']),renderDocumentArchive:()=>calls.push(['render']),...overrides};
  vm.createContext(context);vm.runInContext(extract(name),context);return {context,calls};
}
test('archive open refuses missing and duplicate identities before asking to discard a draft',()=>{
  const {context,calls}=archiveContext('openSavedDocument',{confirmDocumentReplacement(){throw Error('Do not ask to discard');}});assert.equal(context.openSavedDocument('missing'),false);context.documents.push({...context.documents[0]});assert.equal(context.openSavedDocument('original'),false);assert.deepEqual(calls,[]);
});
test('archive cancellation returns false without filling or printing another document',()=>{
  const {context,calls}=archiveContext('openSavedDocument',{confirmDocumentReplacement:()=>false});const before=JSON.stringify(context.documents);assert.equal(context.openSavedDocument('original'),false);assert.deepEqual(calls,[]);assert.equal(JSON.stringify(context.documents),before);
});
test('archive open rechecks complete original data after discard confirmation',()=>{
  const {context,calls}=archiveContext('openSavedDocument');context.confirmDocumentReplacement=()=>{context.documents[0].customAudit.retained='newer';return true;};assert.equal(context.openSavedDocument('original'),false);assert.deepEqual(calls,[]);assert.equal(context.documents[0].customAudit.retained,'newer');
});
test('archive open rechecks owner and view availability after discard confirmation',()=>{
  const {context,calls}=archiveContext('openSavedDocument');let checks=0;assert.equal(context.openSavedDocument('original',()=>++checks===1),false);assert.equal(checks,2);assert.deepEqual(calls,[]);
});
test('archive open returns success only after filling the unchanged original with its unknown fields',()=>{
  const {context,calls}=archiveContext('openSavedDocument');const original=context.documents[0];assert.equal(context.openSavedDocument('original'),true);assert.equal(calls[0][1],original);assert.deepEqual(original.customAudit,{retained:true});
});
test('archive deletion refuses an unfinished current document or ambiguous identity without deleting either copy',()=>{
  const {context,calls}=archiveContext('deleteSavedDocument',{documentHasUnsavedChanges:true,window:{confirm(){throw Error('Do not ask to discard this draft');}}});const before=JSON.stringify(context.documents);context.deleteSavedDocument('original');assert.equal(JSON.stringify(context.documents),before);context.documentHasUnsavedChanges=false;context.documents.push({...context.documents[0]});context.deleteSavedDocument('original');assert.equal(context.documents.length,3);assert.deepEqual(calls,[]);
});
test('archive deletion revalidates a changed record and changed availability after confirmation',()=>{
  const {context,calls}=archiveContext('deleteSavedDocument');context.window.confirm=()=>{context.documents[0].customAudit.retained='newer';return true;};context.deleteSavedDocument('original');assert.equal(context.documents.length,2);assert.deepEqual(calls,[]);context.window.confirm=()=>true;let checks=0;context.deleteSavedDocument('original',()=>++checks===1);assert.equal(context.documents.length,2);assert.deepEqual(calls,[]);
});
test('archive deletion snapshots and saves exactly the selected unchanged record once',()=>{
  const {context,calls}=archiveContext('deleteSavedDocument'),other=context.documents[1];context.deleteSavedDocument('original');context.deleteSavedDocument('original');assert.equal(context.documents.length,1);assert.equal(context.documents[0],other);assert.deepEqual(calls.map(call=>call[0]),['snapshot','save','render']);
});
