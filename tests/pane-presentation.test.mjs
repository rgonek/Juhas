import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPane,togglePane} from '../mods/juhas/pane-presentation.js';
test('expanded review remains active and toggle closes its explicit pane',()=>{const panes=[{pane:'review',tab:'a',mod:'juhas',zoomed:true},{pane:'other',tab:'b',mod:'juhas'}];assert.equal(reviewPane(panes,'a').pane,'review');const calls=[];togglePane((...x)=>calls.push(x),panes,'a');assert.deepEqual(calls,[['pane.close',{pane:'review'}]]);assert.equal(reviewPane(panes,'c'),undefined);});
test('opening targets a terminal in the current tab',()=>{const calls=[];togglePane((...x)=>calls.push(x),[{pane:'terminal',tab:'a',terminal:'t1'}],'a');assert.equal(calls[0][0],'pane.split');assert.equal(calls[0][1].pane,'terminal');assert.equal(calls[0][1].mod,'juhas');});
