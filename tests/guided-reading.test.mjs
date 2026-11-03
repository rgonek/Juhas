import test from 'node:test';
import assert from 'node:assert/strict';
import * as guided from '../mods/juhas/guided.js';
const c={id:'full-source-working:hash',repoKey:'repo',root:'/work',baseTree:'old',targetTree:'working:hash'},files=[{oldPath:'old.js',newPath:'new.js',status:'R'},{newPath:'image.png',binary:true}];
const valid=()=>({sourceId:guided.guidedSourceId(c),steps:[{title:'Error handling',body:'Read the renamed implementation.',paths:['new.js']}],uncovered:[{path:'image.png',reason:'Binary asset: inspect the raw file separately.'}]});
test('guided request is explicit, bounded and tied to full source without an automatic provider',()=>{
 const request=guided.guidedRequest(c,files,'/app/explanation.json');assert.equal(request.sourceId,guided.guidedSourceId(c));assert.match(request.text,/\/app\/explanation.json/);assert.match(request.text,/old\.js/);assert.match(request.text,/new\.js/);assert.match(request.text,/raw diff/i);assert.match(request.text,/never mark.*reviewed/i);
 assert.notEqual(guided.guidedSourceId({...c,id:c.id+'changed'}),request.sourceId);assert.throws(()=>guided.guidedRequest(c,Array.from({length:201},(_,i)=>({newPath:`file-${i}`})),'/out'),/200/);
});
test('guided response validates exact source, explicit omissions and exhaustive path coverage',()=>{
 const result=guided.parseGuidedResponse(JSON.stringify(valid()),c,files);assert.equal(result.steps[0].paths[0],'new.js');assert.match(result.uncovered[0].reason,/Binary/);
 for(const modify of [x=>x.sourceId='stale',x=>x.steps[0].paths=['unknown'],x=>x.uncovered=[],x=>x.steps[0].body={html:'unsafe'},x=>x.uncovered[0].reason='',x=>x.steps=Array(51).fill(x.steps[0])]){const value=valid();modify(value);assert.throws(()=>guided.parseGuidedResponse(JSON.stringify(value),c,files));}
 assert.throws(()=>guided.parseGuidedResponse('ż'.repeat(33000),c,files),/64/);assert.throws(()=>guided.parseGuidedResponse('not JSON',c,files),/JSON/);
});
