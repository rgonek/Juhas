import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewTabKey,liveReviewTab,reviewTabProps} from '../mods/juhas/review-tab.js';
test('review tabs are keyed by machine and exact worktree root, not common repository or agent tab',()=>{
 const a={root:'D:/work/a',machine:null},b={...a,root:'D:/work/a-task'},remote={...a,machine:'host'};
 assert.notEqual(reviewTabKey(a),reviewTabKey(b));assert.notEqual(reviewTabKey(a),reviewTabKey(remote));assert.equal(reviewTabKey(a),reviewTabKey({...a}));
});
test('reuse requires the recorded tab and pane to remain alive',()=>{
 const record={tabId:'review',paneId:'pane'},spaces=[{tabs:[{id:'review'}]}];
 assert.equal(liveReviewTab(record,spaces,[{pane:'pane',tab:'review',mod:'juhas'}]),true);
 assert.equal(liveReviewTab(record,spaces,[]),false);assert.equal(liveReviewTab(record,[],[{pane:'pane'}]),false);
});
test('new review tab pins repository/source-agent context while retaining the existing session',()=>{
 const source={key:'source',spaceId:'worktree-space',tabId:'agent-tab',folder:'D:/x'},repo={root:'D:/y',machine:null};
 const props=reviewTabProps(repo,source,'session');assert.equal(props.folder,'D:/y');assert.equal(props.sessionId,'session');assert.equal(props.reviewContext.tabId,'agent-tab');assert.equal(props.isReviewTab,true);
});
