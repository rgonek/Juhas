import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBatch} from '../mods/juhas/submit.js';
test('cross-project feedback names its reviewed checkout without forcing verbose Git headers',()=>{
 const c={id:'c',repoKey:'y',root:'D:/work/project-Y',baseOid:'a',targetOid:'b'},draft={id:'d',repoKey:'y',root:c.root,comparisonId:'c',newPath:'src/a.ts',side:'new',startLine:4,endLine:4,body:'Fix the API contract'};
 const batch=buildBatch({id:'session',drafts:[draft]},[c],{agentAddress:'agent-X',includeRepository:true});
 assert.match(batch.text,/D:\/work\/project-Y/);assert.match(batch.text,/src\/a.ts/);assert.match(batch.text,/- 4: Fix the API contract/);assert.ok(!batch.text.includes('a → b'));
});

import {readFileSync} from 'node:fs';
test('same-space feedback sent to another project tab includes its reviewed root',()=>{
 const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8').split('export default class Juhas extends View')[1],deps={buildBatch,agentRecipients:()=>[{address:'agent-X',space:'s',tab:'agent-X-tab'}],terminals:()=>[],agents:()=>[]};
 const Native=new Function('View',...Object.keys(deps),'class Juhas extends View'+source+'\nreturn Juhas;')(class{},...Object.values(deps)),v=Object.create(Native.prototype),c={id:'c',repoKey:'y',root:'D:/project-Y'};
 v.controller={state:{repo:{key:'y'},comparison:c},session:()=>({id:'s',drafts:[{id:'d',repoKey:'y',root:c.root,comparisonId:'c',newPath:'a.ts',body:'Fix'}]})};v.inputs={note:{value:()=>''}};v.currentContext=v.recipientContext=()=>({key:'y',spaceId:'s',tabId:'terminal-Y'});v.showBatch=b=>v.batch=b;v.generatePreview('agent-X',{notify(){}});assert.match(v.batch.text,/D:\/project-Y/);
});
