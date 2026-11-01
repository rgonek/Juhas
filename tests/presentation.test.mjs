import test from 'node:test';
import assert from 'node:assert/strict';
import {openReview,expandReview,collapseReview,toggleReview} from '../mods/git-review/presentation.js';
import {buildLayout} from '../scripts/install.mjs';
function sample(){return {id:'root',type:'column',children:[{id:'tabs',type:'block',content:{mod:'tabs'}},{id:'work-body',type:'row',children:[{id:'main',type:'block',content:{tab:'active'}},{id:'panel',type:'column',hidden:true,children:[{id:'panel-body',type:'stack',active:'files',children:[{id:'files',type:'block',content:{mod:'files'}},{id:'changes',type:'block',content:{mod:'changes'}}]}]}]}]};}
function find(n,id){return n.id===id?n:(n.children||[]).map(c=>find(c,id)).find(Boolean);}
test('review uses the existing right-hand Files/Changes panel, hidden until opened',()=>{
 const tree=buildLayout(sample());assert.equal(find(tree,'tabs').content.mod,'git-review-tabs');assert.equal(find(tree,'panel').hidden,true);assert.equal(find(tree,'panel-body').children.at(-1).id,'git-review-sidebar');assert.equal(find(tree,'git-review-work').active,'git-review-terminal');assert.equal(find(tree,'git-review-bar'),undefined);assert.equal(find(tree,'work-body').children[1].id,'panel');
});
test('open, expand and return share the original panel and keep the terminal alive',()=>{
 const tree=buildLayout(sample());const dispatch=(cmd,args)=>{if(cmd==='layout.select')find(tree,args.stack).active=args.child;if(cmd==='layout.show')find(tree,args.id).hidden=false;if(cmd==='layout.hide')find(tree,args.id).hidden=true;};
 find(tree,'git-review-sidebar').hidden=true;openReview(dispatch);assert.equal(find(tree,'git-review-sidebar').hidden,false);assert.equal(find(tree,'panel').hidden,false);assert.equal(find(tree,'panel-body').active,'git-review-sidebar');
 expandReview(dispatch);assert.equal(find(tree,'panel').hidden,true);assert.equal(find(tree,'git-review-work').active,'git-review-full');
 collapseReview(dispatch);assert.equal(find(tree,'panel').hidden,false);assert.equal(find(tree,'git-review-work').active,'git-review-terminal');assert.equal(find(tree,'git-review-terminal').content.tab,'active');
 toggleReview(dispatch,tree);assert.equal(find(tree,'panel').hidden,true);toggleReview(dispatch,tree);assert.equal(find(tree,'panel').hidden,false);
});
