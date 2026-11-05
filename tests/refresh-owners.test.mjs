import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRefreshScheduler,createRefreshCoordinator} from '../mods/juhas/refresh.js';

const source=readFileSync(new URL('../mods/juhas/main.js',import.meta.url),'utf8');
const Native=new Function('View','createRefreshScheduler','createRefreshCoordinator','class Juhas extends View'+source.split('export default class Juhas extends View')[1]+'\nreturn Juhas;')(class{},createRefreshScheduler,createRefreshCoordinator);
function view(id,visible=true){
 const cx={notifications:0,notify(){this.notifications++;},timer:{every(_ms,fn){return {fn,cancel(){}};}}};
 const v={id,closed:false,busy:false,activeContext:{key:'context'},visible,controller:{state:{repo:{key:'repo'},history:[],comparison:{id:'comparison'},file:{id:'file'},branch:'main'},refresh:async()=>{v.controller.calls++;v.controller.state.history=[{oid:'new'}];},calls:0},hasUnsavedComment:()=>false,reviewIsVisible:()=>visible,publish(){this.publishes++;},prepareFileHeaders(){this.headers++;},rememberLoadedView(){this.remembered++;},publishes:0,headers:0,remembered:0};
 v.poll=Native.prototype.poll.bind(v);
 Native.prototype.setupRefresh.call(v,cx);return {v,cx};
}

test('same-repository views each refresh and notify their own controller owner',async()=>{
 const a=view('view-a'),b=view('view-b');
 await Promise.all([a.v.refreshScheduler.check(a.cx),b.v.refreshScheduler.check(b.cx)]);
 assert.equal(a.v.controller.calls,1);assert.equal(b.v.controller.calls,1);
 assert.equal(a.cx.notifications,1);assert.equal(b.cx.notifications,1);
 assert.equal(a.v.publishes,1);assert.equal(b.v.publishes,1);
 a.v.refreshScheduler.close();b.v.refreshScheduler.close();
});

test('repeated ticks for one view coalesce and hidden views do not poll',async()=>{
 const a=view('single-view');let release,calls=0;
 a.v.controller.refresh=()=>{calls++;return new Promise(resolve=>release=()=>{a.v.controller.state.history=[{oid:'new'}];resolve();});};
 const one=a.v.refreshScheduler.check(a.cx),two=a.v.refreshScheduler.check(a.cx);
 await Promise.resolve();await Promise.resolve();assert.equal(calls,1);release();await Promise.all([one,two]);
 const hidden=view('hidden-view',false);await hidden.v.refreshScheduler.check(hidden.cx);
 assert.equal(hidden.v.controller.calls,0);assert.equal(hidden.cx.notifications,0);
 a.v.refreshScheduler.close();hidden.v.refreshScheduler.close();
});
