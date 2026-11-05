import test from 'node:test';
import assert from 'node:assert/strict';
import * as submission from '../mods/juhas/submit.js';
import {utf8Bytes} from '../mods/juhas/git.js';
const comments=[
 {id:'1',repoKey:'repo',root:'/workspace/project',comparisonId:'c',baseOid:'a'.repeat(40),targetOid:'b'.repeat(40),newPath:'src/view.ts',oldPath:'src/view.ts',side:'new',startLine:8,endLine:8,quote:'some long quoted source code',body:'Fix the empty state'},
 {id:'2',repoKey:'repo',root:'/workspace/project',comparisonId:'c',baseOid:'a'.repeat(40),targetOid:'b'.repeat(40),newPath:'src/view.ts',oldPath:'src/view.ts',side:'new',startLine:20,endLine:22,quote:'line 20\nline 21\nline 22',body:'Handle cancellation'},
 {id:'3',repoKey:'other',root:'/workspace/other',comparisonId:'d',newPath:'other.ts',body:'Other project'}];
const session={id:'session',drafts:comments};
test('compact feedback uses bare new-side lines and explicit old-side anchors without a legend',()=>{
 const drafts=[{...comments[0],startLine:42,endLine:42,body:'Current line'}, {...comments[0],id:'range',side:undefined,startLine:43,endLine:45,body:'Current range'}, {...comments[0],id:'old',side:'old',startLine:19,endLine:22,body:'Previous range'}, {...comments[0],id:'old-single',side:'old',startLine:23,endLine:23,body:'Previous line'}, {...comments[0],id:'file',startLine:null,endLine:null,body:'File feedback'}, {...comments[0],id:'general',scope:'general',body:'General feedback'}];
 const batch=submission.buildBatch({id:'s',drafts},[]);
 assert.equal(batch.text,'# Code review\n\n### General feedback\n- General feedback\n\n### src/view.ts\n- file: File feedback\n- old:19-22: Previous range\n- old:23: Previous line\n- 42: Current line\n- 43-45: Current range');
 for(const draft of drafts)assert.equal(batch.draftSnapshots[draft.id],JSON.stringify(draft));
});
test('single repo review groups Git context when enabled; code quotes are optional',()=>{
 const batch=submission.buildBatch(session,[],{agentAddress:'t1',repoKey:'repo',includeGitContext:true});
 assert.deepEqual(batch.draftIds,['1','2']);assert.equal(batch.text.split('/workspace/project').length-1,1);assert.equal(batch.text.split('src/view.ts').length-1,1);assert.equal(batch.text.split('a'.repeat(40)).length-1,1);
 assert.match(batch.text,/- 8: Fix the empty state/);assert.match(batch.text,/20-22/);assert.match(batch.text,/Fix the empty state/);assert.ok(!batch.text.includes('Other project'));assert.ok(!batch.text.includes('some long quoted source code'));
 const withCode=submission.buildBatch(session,[],{agentAddress:'t1',repoKey:'repo',includeQuotes:true,includeGitContext:true});assert.match(withCode.text,/some long quoted source code/);assert.ok(batch.utf8Bytes<withCode.utf8Bytes);
});
test('ambiguous recipient does not prevent editing or copying, but prevents sending',async()=>{
 const batch=submission.buildBatch(session,[],{repoKey:'repo'});assert.equal(batch.agentAddress,null);let deliveries=0;
 const result=await submission.createSubmitter()(batch,{send:async()=>{deliveries++;}});assert.equal(result.state,'failed');assert.equal(deliveries,0);
});
test('edits and recipient changes have distinct delivery identities and preserve source snapshots',()=>{
 const batch=submission.buildBatch(session,[],{agentAddress:'t1',repoKey:'repo'}),edited=submission.updateBatch(batch,{text:'Popraw żółć'}),retargeted=submission.updateBatch(edited,{agentAddress:'t2'});
 assert.notEqual(edited.id,batch.id);assert.notEqual(retargeted.id,edited.id);assert.equal(retargeted.text,edited.text);assert.equal(edited.utf8Bytes,utf8Bytes('Popraw żółć'));assert.equal(edited.edited,true);assert.deepEqual(edited.draftSnapshots,batch.draftSnapshots);
 assert.equal(submission.updateBatch(edited,{text:batch.text}).id,batch.id);
});
test('outdated comments and renamed paths keep precise context in compact text',()=>{
 const draft={...comments[0],oldPath:'src/old.ts',newPath:'src/new.ts',status:'outdated'};
 const batch=submission.buildBatch({id:'s',drafts:[draft]},[],{agentAddress:'t1'});assert.match(batch.text,/OUTDATED/);assert.match(batch.text,/src\/old.ts/);assert.match(batch.text,/src\/new.ts/);assert.match(batch.text,new RegExp(draft.targetOid));
});
test('overlapping feedback from different commits has distinct source revisions and bounded automatic excerpts',()=>{
 const first={...comments[0],id:'first',quote:'first version\n'+'long '.repeat(100)},second={...comments[0],id:'second',comparisonId:'next',targetOid:'c'.repeat(40),quote:'second version'};
 const batch=submission.buildBatch({id:'s',drafts:[first,second]},[],{repoKey:'repo'});assert.match(batch.text,/bbbbbbbbbbbb/);assert.match(batch.text,/cccccccccccc/);assert.match(batch.text,/> first version/);assert.match(batch.text,/> second version/);assert.ok(!batch.text.includes(first.quote));assert.equal(batch.includeQuotes,false);assert.equal(batch.includeGitContext,false);assert.equal(batch.draftSnapshots.first,JSON.stringify(first));
 const sparse=submission.buildBatch({id:'s',drafts:[first,{...second,startLine:90,endLine:90}]},[],{repoKey:'repo'});assert.ok(!sparse.text.includes('first version'));assert.ok(!sparse.text.includes(' @ '));
});
test('distinct locations across three commits omit source IDs while retaining original snapshots',()=>{
 const drafts=[comments[0],{...comments[1],comparisonId:'next',targetOid:'c'.repeat(40)},{...comments[0],id:'third',comparisonId:'third',targetOid:'d'.repeat(40),newPath:'other.ts',oldPath:'other.ts'}];
 const batch=submission.buildBatch({id:'s',drafts},[],{repoKey:'repo'});assert.ok(!batch.text.includes(' @ '));assert.ok(!batch.text.includes('> '));for(const draft of drafts)assert.equal(batch.draftSnapshots[draft.id],JSON.stringify(draft));
 const full=submission.buildBatch({id:'s',drafts},[],{repoKey:'repo',includeGitContext:true});for(const draft of drafts)assert.ok(full.text.includes(draft.targetOid));assert.ok(!full.text.includes(' @ '));
});
test('a single current comment omits optional source and code context',()=>{
 const draft=comments[0],batch=submission.buildBatch({id:'s',drafts:[draft]},[{id:draft.comparisonId,repoKey:'repo'}],{repoKey:'repo'});assert.ok(!batch.text.includes(' @ '));assert.ok(!batch.text.includes(draft.targetOid));assert.ok(!batch.text.includes(draft.quote));
});
test('file-level feedback from different revisions is disambiguated',()=>{
 const drafts=[{...comments[0],startLine:null,endLine:null},{...comments[0],id:'next',comparisonId:'next',targetOid:'c'.repeat(40),startLine:null,endLine:null}];
 const batch=submission.buildBatch({id:'s',drafts},[]);assert.match(batch.text,/@ bbbbbbbbbbbb/);assert.match(batch.text,/@ cccccccccccc/);
});
const context={spaceId:'s',tabId:'tab',machine:null};
const terminal=(address,extra={})=>({address,state:'live',program:{agent:true},...extra});
const agent=(address,tab='tab',space='s')=>({address,space,tab,program:{agent:true}});
test('recipient detection prefers the unique agent in the active project tab',()=>{
 const all=[terminal('right'),terminal('other'),terminal('shell',{program:{shell:true}})];
 assert.equal(submission.detectRecipient(all,[agent('right'),agent('other','elsewhere')],context)?.address,'right');
 assert.equal(submission.detectRecipient(all,[agent('other','elsewhere')],context)?.address,'other');
 assert.equal(submission.detectRecipient(all,[agent('right'),agent('other')],context),null);
});
test('recipient detection rejects unrelated projects, finished agents and child workers',()=>{
 assert.equal(submission.detectRecipient([terminal('wrong')],[agent('wrong','tab','other')],context),null);
 assert.equal(submission.detectRecipient([terminal('dead',{state:'finished'})],[agent('dead')],context),null);
 assert.equal(submission.detectRecipient([terminal('child',{parent:'parent'})],[agent('child')],context),null);
 assert.equal(submission.detectRecipient([terminal('labelled',{labels:{'herdr.space':'s','herdr.tab':'tab'}})],[],context)?.address,'labelled');
});
test('edited payload byte limits and empty messages are checked before transport',async()=>{
 const batch=submission.buildBatch(session,[],{agentAddress:'t1',repoKey:'repo'});let sent=0;const submit=submission.createSubmitter({maxBytes:5}),transport={send:async()=>{sent++;return {ok:true};}};
 assert.equal((await submit(submission.updateBatch(batch,{text:'żółć'}),transport)).state,'failed');assert.equal((await submit(submission.updateBatch(batch,{text:'  '}),transport)).state,'failed');assert.equal(sent,0);
});
import {readFileSync} from 'node:fs';
function nativeSubmission(data=new Map()){
 let selectedSession={...session,submittedBatches:[],drafts:comments.map(d=>({...d}))};let source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8');source=source.slice(source.indexOf('export default class')).replace('export default class Juhas extends View','class Juhas extends View');
 const deliveries=[],deps={...submission,shared:k=>data.get(k),setShared:(k,v)=>data.set(k,v),agents:()=>[agent('right')],terminals:()=>[terminal('right'),terminal('manual')],submit:submission.createSubmitter(),exec:async(_cmd,args)=>{deliveries.push(args);return {code:0};}};
 const Native=new Function('View',...Object.keys(deps),source+'\nreturn Juhas;')(class{},...Object.values(deps)),view=Object.create(Native.prototype);
 view.controller={state:{repo:{key:'repo'},comparison:null},session:()=>selectedSession,mutate:fn=>selectedSession=fn(selectedSession)};view.currentContext=()=>({...context,key:'context'});view.activeContext=view.currentContext();view.reviewKey='review-key';view.inputs={note:{value:()=>''}};let text='';view.inputs.review={value:()=>text,set_value:value=>text=value};view.work=(_cx,fn)=>view.pending=fn(_cx);const cx={notify(){},write_to_clipboard:value=>data.set('clipboard',value)};return {view,data,deliveries,cx,getSession:()=>selectedSession};
}
test('native preview auto-selects the project agent and scopes the editable message to one repo',()=>{
 const {view,deliveries,cx}=nativeSubmission();view.preview(cx);assert.equal(view.panel,'submit');assert.equal(view.batch.agentAddress,'right');assert.deepEqual(view.batch.draftIds,['1','2']);assert.equal(view.inputs.review.value(),view.batch.text);assert.equal(deliveries.length,0);
});
test('preview refuses stale project context before selecting an agent or generating a message',()=>{
 const {view,cx,deliveries}=nativeSubmission();view.followContext=true;view.currentContext=()=>({...context,key:'another-project'});view.preview(cx);assert.equal(view.batch,undefined);assert.match(view.message,/Project context changed/);assert.equal(deliveries.length,0);
});
test('native edits survive changing recipient, cancellation/reopen and Copy uses the exact edited text',()=>{
 const {view,data,cx}=nativeSubmission();view.preview(cx);view.inputs.review.set_value('My edited review');view.changeReview(cx);view.buildPreview('manual',cx);assert.equal(view.batch.text,'My edited review');assert.equal(view.batch.agentAddress,'manual');view.copyReview(cx);assert.equal(data.get('clipboard'),'My edited review');view.panel=null;view.batch=null;view.preview(cx);assert.equal(view.batch.text,'My edited review');assert.equal(view.batch.agentAddress,'manual');
});
test('native Send archives and clears included source drafts even after message edits',async()=>{
 const {view,deliveries,cx,getSession}=nativeSubmission();view.preview(cx);view.inputs.review.set_value('Precisely this');view.changeReview(cx);view.send(cx);await view.pending;assert.equal(deliveries.length,1);assert.equal(deliveries[0][2],'Precisely this');assert.deepEqual(getSession().drafts.map(d=>d.id),['3']);assert.deepEqual(Object.keys(getSession().submittedBatches[0].draftSnapshots),['1','2']);
});
test('native Send does not send an empty edit or a preview from another project context',async()=>{
 const {view,deliveries,cx}=nativeSubmission();view.preview(cx);view.inputs.review.set_value('  ');view.changeReview(cx);view.send(cx);if(view.pending)await view.pending;assert.equal(deliveries.length,0);
 view.inputs.review.set_value('feedback');view.changeReview(cx);view.currentContext=()=>({...context,key:'another'});view.send(cx);if(view.pending)await view.pending;assert.equal(deliveries.length,0);
});

test('Git context is omitted by default and enabling it restores one repository and revision header',()=>{
 const compact=submission.buildBatch(session,[],{repoKey:'repo'}),full=submission.buildBatch(session,[],{repoKey:'repo',includeGitContext:true});
 assert.ok(!compact.text.includes('/workspace/project'));assert.ok(!compact.text.includes(comments[0].baseOid));assert.ok(!compact.text.includes(comments[0].targetOid));assert.match(compact.text,/src\/view.ts/);assert.match(compact.text,/- 8: Fix the empty state/);assert.match(compact.text,/Fix the empty state/);
 assert.equal(full.text.split('/workspace/project').length-1,1);assert.equal(full.text.split(comments[0].targetOid).length-1,1);assert.ok(compact.utf8Bytes<full.utf8Bytes);assert.deepEqual(compact.draftSnapshots,full.draftSnapshots);assert.notEqual(compact.id,full.id);
});
test('outdated comments retain the original revision for the commented side without Git headers',()=>{
 for(const side of ['old','new']){const draft={...comments[0],side,status:'outdated'},batch=submission.buildBatch({id:'s',drafts:[draft]},[]);assert.ok(!batch.text.includes(draft.root));assert.match(batch.text,/OUTDATED/);assert.ok(batch.text.includes(side==='old'?draft.baseOid:draft.targetOid));}
});
test('native Git context toggle regenerates unedited text and persists the option',()=>{
 const {view,cx,data}=nativeSubmission();view.preview(cx);assert.ok(!view.batch.text.includes('/workspace/project'));view.toggleGitContext(cx);assert.ok(view.batch.text.includes('/workspace/project'));assert.equal(data.get('review-key').includeGitContext,true);view.panel=null;view.batch=null;view.preview(cx);assert.equal(view.includeGitContext,true);assert.ok(view.batch.text.includes('/workspace/project'));view.toggleGitContext(cx);assert.ok(!view.batch.text.includes('/workspace/project'));
});
test('Git context toggle preserves manual edits until explicit regeneration',()=>{
 const {view,cx}=nativeSubmission();view.preview(cx);view.inputs.review.set_value('My text');view.changeReview(cx);view.toggleGitContext(cx);assert.equal(view.batch.text,'My text');assert.equal(view.includeGitContext,true);view.generatePreview(view.batch.agentAddress,cx);assert.ok(view.batch.text.includes('/workspace/project'));
});

test('native checkbox payloads set generation options instead of inverting them twice',()=>{
 const {view,cx}=nativeSubmission();view.preview(cx);view.toggleGitContext(cx,true);view.toggleGitContext(cx,true);assert.equal(view.includeGitContext,true);view.toggleReviewQuotes(cx,false);view.toggleReviewQuotes(cx,false);assert.equal(view.includeQuotes,false);
});
test('dismissal of an old native picker does not close a different active panel',()=>{
 const {view,cx}=nativeSubmission();view.panel='comment';view.setReferencePicker(true,false,cx);assert.equal(view.panel,'comment');view.setReferencePicker(false,true,cx);assert.equal(view.panel,'refs');view.setReferencePicker(false,false,cx);assert.equal(view.panel,null);
});


test('saved-comment browsing filters do not omit comments from the review batch',()=>{const {view,cx}=nativeSubmission();view.draftStatus='outdated';view.draftSource='another-comparison';view.preview(cx);assert.deepEqual(view.batch.draftIds,['1','2']);});

test('response guidance is opt-in, preserves provenance and is part of the bounded message',()=>{
 const base=submission.buildBatch(session,[],{repoKey:'repo'}),guided=submission.buildBatch(session,[],{repoKey:'repo',includeResponseGuidance:true});
 assert.ok(!base.text.includes('symbol names'));assert.match(guided.text,/symbol names or short code excerpts/);assert.match(guided.text,/without looking up line numbers/);assert.equal(guided.text.split(submission.REVIEW_RESPONSE_GUIDANCE).length-1,1);assert.equal(guided.utf8Bytes,utf8Bytes(guided.text));assert.deepEqual(guided.draftSnapshots,base.draftSnapshots);assert.notEqual(guided.id,base.id);
});

test('new reviews remember generation preferences independently of the previous preview',()=>{
 const {view,cx,data}=nativeSubmission();view.preview(cx);assert.equal(view.includeResponseGuidance,false);view.toggleReviewQuotes(cx,true);view.toggleGitContext(cx,true);view.toggleResponseGuidance(cx,true);
 data.delete('review-key');const next=nativeSubmission(data);next.view.preview(next.cx);assert.equal(next.view.includeQuotes,true);assert.equal(next.view.includeGitContext,true);assert.equal(next.view.includeResponseGuidance,true);assert.match(next.view.batch.text,/some long quoted source code/);assert.match(next.view.batch.text,/symbol names or short code excerpts/);
 assert.deepEqual(data.get('juhas.review-options.v1'),{includeQuotes:true,includeGitContext:true,includeResponseGuidance:true});
});

test('guidance preference preserves edited text until explicit regeneration and remembers disabling',()=>{
 const {view,cx,data}=nativeSubmission();view.preview(cx);view.inputs.review.set_value('My exact text');view.changeReview(cx);view.toggleResponseGuidance(cx,true);assert.equal(view.batch.text,'My exact text');assert.equal(data.get('review-key').includeResponseGuidance,true);
 view.generatePreview(view.batch.agentAddress,cx);assert.match(view.batch.text,/symbol names or short code excerpts/);view.toggleResponseGuidance(cx,false);assert.ok(!view.batch.text.includes('symbol names'));data.delete('review-key');const next=nativeSubmission(data);next.view.preview(next.cx);assert.equal(next.view.includeResponseGuidance,false);
});
test('successful delivery clears the review preview but retains user generation preferences',async()=>{
 const {view,cx,data}=nativeSubmission();view.preview(cx);view.toggleReviewQuotes(cx,true);view.toggleResponseGuidance(cx,true);view.send(cx);await view.pending;
 assert.equal(data.get('review-key'),null);assert.equal(data.get('juhas.review-options.v1').includeQuotes,true);assert.equal(data.get('juhas.review-options.v1').includeResponseGuidance,true);
 const next=nativeSubmission(data);next.view.preview(next.cx);assert.equal(next.view.includeQuotes,true);assert.equal(next.view.includeResponseGuidance,true);
});
test('a checkbox in an older preview preserves preferences changed in another view',()=>{
 const data=new Map(),first=nativeSubmission(data),second=nativeSubmission(data);first.view.preview(first.cx);second.view.preview(second.cx);
 first.view.toggleResponseGuidance(first.cx,true);second.view.toggleReviewQuotes(second.cx,true);data.delete('review-key');const next=nativeSubmission(data);next.view.preview(next.cx);
 assert.equal(next.view.includeResponseGuidance,true);assert.equal(next.view.includeQuotes,true);
});

test('sending an edited review preserves comments changed after preview',async()=>{
 const {view,cx,getSession}=nativeSubmission();view.preview(cx);view.inputs.review.set_value('Small wording correction');view.changeReview(cx);getSession().drafts[0].body='Newer feedback';view.send(cx);await view.pending;assert.deepEqual(getSession().drafts.map(d=>d.id),['1','3']);assert.equal(getSession().drafts[0].body,'Newer feedback');
});
