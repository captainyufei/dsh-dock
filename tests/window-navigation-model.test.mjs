import test from 'node:test';
import assert from 'node:assert/strict';
import {createWindowNavigationModel} from '../src/window-navigation-model.js';

function observable(value){
 const listeners=new Set();
 return {getSnapshot:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  set(next){value=next;for(const fn of [...listeners])fn();},get count(){return listeners.size;}};
}
const flush=()=>new Promise(resolve=>queueMicrotask(resolve));
function fixture(t,{legacy=false,limit=80}={}){
 const panelInfo=observable({activePanelId:'home'}),selection=observable({sessionId:'a'});
 const list=observable({byId:{a:{id:'a',retainedBy:{mainView:1}},b:{id:'b',retainedBy:{}},blank:{id:'blank',blank:true,retainedBy:{}}}});
 const workspaces=observable({archivedSessionIds:[]}),registry=observable(['home','plugins','tasks']);
 const calls=[];
 const ctx={layout:{panelInfo,selectPanel(id){calls.push(['panel',id]);panelInfo.set({activePanelId:id});}},
  sessions:{list,create(){throw new Error('History must not create a Session');}},
  workspaces:{list:workspaces},
  uiWorkspace:{...legacy?{}:{selection},openSession(target){
   const id=typeof target==='string'?target:target.childSessionId;
   calls.push(['session',target]);
   // Mirror Host replacement: metadata can report both old and new retained
   // rows before selection changes and the old reference is released.
   const byId=list.getSnapshot().byId;
   list.set({byId:{...byId,[id]:{...byId[id],id,retainedBy:{mainView:1}}}});
   selection.set({sessionId:id,...typeof target==='object'?{subagentAddress:target}:{}});
   list.set({byId:Object.fromEntries(Object.entries(list.getSnapshot().byId).map(([key,value])=>[key,{...value,retainedBy:{mainView:key===id?1:0}}]))});
   panelInfo.set({activePanelId:null});
  }},
  slots:{entries(name){assert.equal(name,'main');return registry.getSnapshot().map(key=>({options:{key}}));},subscribe(name,fn){assert.equal(name,'main');return registry.subscribe(fn);}},
 };
 const model=createWindowNavigationModel(ctx,{limit});const stop=model.subscribe(()=>{});
 t.after(()=>{stop();model.dispose();});
 return {model,ctx,panelInfo,selection,list,workspaces,registry,calls,stop};
}

test('visits panels and existing Sessions, then replays them without creating chats',async t=>{
 const f=fixture(t);assert.deepEqual(f.model.getSnapshot(),{canBack:false,canForward:false,current:{kind:'panel',id:'home'}});
 f.ctx.layout.selectPanel('plugins');await flush();f.ctx.uiWorkspace.openSession('a');await flush();
 assert.equal(f.model.back(),true);assert.equal(f.panelInfo.getSnapshot().activePanelId,'plugins');await flush();
 assert.deepEqual(f.model.getSnapshot(),{canBack:true,canForward:true,current:{kind:'panel',id:'plugins'}});
 assert.equal(f.model.back(),true);await flush();assert.equal(f.model.back(),false);
 assert.equal(f.model.forward(),true);await flush();assert.equal(f.model.forward(),true);await flush();
 assert.equal(f.selection.getSnapshot().sessionId,'a');assert.equal(f.model.forward(),false);
});

test('new navigation truncates forward visits and repeated selections do not add entries',async t=>{
 const f=fixture(t);
 f.ctx.layout.selectPanel('plugins');await flush();f.ctx.layout.selectPanel('tasks');await flush();
 f.model.back();await flush();f.ctx.uiWorkspace.openSession('b');await flush();
 assert.equal(f.model.getSnapshot().canForward,false);
 f.ctx.uiWorkspace.openSession('b');await flush();f.model.back();await flush();
 assert.equal(f.model.getSnapshot().current.id,'plugins');f.model.back();await flush();
 assert.equal(f.model.getSnapshot().current.id,'home');assert.equal(f.model.getSnapshot().canBack,false);
});

test('coalesces transient retention and panel notifications into one actual destination',async t=>{
 for(const legacy of [false,true]){
  const f=fixture(t,{legacy});f.ctx.uiWorkspace.openSession('a');await flush();
  f.ctx.layout.selectPanel('plugins');await flush();
  f.ctx.uiWorkspace.openSession('b');await flush();
  f.model.back();await flush();assert.equal(f.model.getSnapshot().current.id,'plugins');
  f.model.back();await flush();assert.equal(f.model.getSnapshot().current.id,'a');
 }
});

test('background updates and temporary missing selection do not consume history',async t=>{
 const f=fixture(t);f.ctx.uiWorkspace.openSession('a');await flush();
 const before=f.model.getSnapshot();
 f.list.set({byId:{...f.list.getSnapshot().byId,b:{id:'b',title:'background update',retainedBy:{}}}});await flush();
 assert.equal(f.model.getSnapshot(),before);
 f.selection.set({});await flush();assert.equal(f.model.getSnapshot(),before);
 f.selection.set({sessionId:'a'});await flush();assert.equal(f.model.getSnapshot(),before);
 f.model.back();await flush();assert.equal(f.model.getSnapshot().current.id,'home');
});

test('skips archived or deleted Sessions and unregistered panels in both directions',async t=>{
 const f=fixture(t);
 f.ctx.uiWorkspace.openSession('a');await flush();f.ctx.layout.selectPanel('plugins');await flush();
 f.ctx.uiWorkspace.openSession('b');await flush();f.ctx.layout.selectPanel('tasks');await flush();
 f.workspaces.set({archivedSessionIds:['b']});f.registry.set(['home','tasks']);await flush();
 assert.equal(f.model.back(),true);await flush();assert.equal(f.model.getSnapshot().current.id,'a');
 assert.equal(f.model.forward(),true);await flush();assert.equal(f.model.getSnapshot().current.id,'tasks');
 const {a,...remaining}=f.list.getSnapshot().byId;f.list.set({byId:remaining});await flush();
 assert.equal(f.model.back(),true);await flush();assert.equal(f.model.getSnapshot().current.id,'home');
});

test('returns to an existing blank draft and keeps captured durable subagent addresses',async t=>{
 const f=fixture(t);
 f.ctx.uiWorkspace.openSession('blank');await flush();f.ctx.layout.selectPanel('plugins');await flush();
 f.model.back();await flush();assert.deepEqual(f.calls.at(-1),['session','blank']);
 const address={parentSessionId:'a',childSessionId:'child',mode:'continuable'};
 f.ctx.uiWorkspace.openSession(address);await flush();f.ctx.layout.selectPanel('tasks');await flush();
 f.model.back();await flush();assert.deepEqual(f.calls.at(-1),['session',address]);
});

test('caps visit history in memory and resolves pending navigation before a fast Back press',async t=>{
 const f=fixture(t,{limit:3});
 f.ctx.layout.selectPanel('plugins');await flush();f.ctx.layout.selectPanel('tasks');await flush();
 f.ctx.uiWorkspace.openSession('a');
 assert.equal(f.model.back(),true);await flush();assert.equal(f.model.getSnapshot().current.id,'tasks');
 assert.equal(f.model.back(),true);await flush();assert.equal(f.model.getSnapshot().current.id,'plugins');
 assert.equal(f.model.back(),false);
});

test('a refused Host navigation does not move the history cursor',async t=>{
 const f=fixture(t);f.ctx.layout.selectPanel('plugins');await flush();
 const before=f.model.getSnapshot();f.ctx.layout.selectPanel=()=>{throw new Error('Host refused');};
 assert.throws(()=>f.model.back(),/Host refused/);await flush();assert.equal(f.model.getSnapshot(),before);
});

test('dispose drops queued updates and releases all subscriptions',async t=>{
 const f=fixture(t);f.ctx.layout.selectPanel('plugins');
 f.model.dispose();await flush();
 assert.deepEqual(f.model.getSnapshot(),{canBack:false,canForward:false,current:null});
 for(const value of [f.panelInfo,f.selection,f.list,f.workspaces,f.registry])assert.equal(value.count,0);
 assert.equal(f.model.back(),false);assert.equal(f.model.forward(),false);
});
