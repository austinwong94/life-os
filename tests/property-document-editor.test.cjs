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
