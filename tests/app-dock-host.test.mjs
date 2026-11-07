import test from 'node:test';
import assert from 'node:assert/strict';
import {mountAppDockSeat} from '../src/app-dock-host.js';

function fixture({attributes={},extra='',fail}={}){
 const state=new Map(Object.entries(attributes)),style=new Map(extra?[['--cgpt-app-extra-height',extra]]:[]),listeners=new Set();
 const native={native:true},children=[native],reads=[],observers=[];
 let snapshot={canShowNativeMore:true,reservedEntryCount:2};
 const nav={
  getAttribute:key=>state.get(key)??null,setAttribute:(key,value)=>state.set(key,value),removeAttribute:key=>state.delete(key),
  style:{getPropertyValue:key=>style.get(key)||'',setProperty:(key,value)=>style.set(key,value),removeProperty:key=>style.delete(key)},
  appendChild(node){children.push(node);node.parentElement=nav;},
  querySelectorAll(selector){assert.equal(selector,'[data-cgpt-nav-button]');return [];},
 };
 const document={defaultView:{MutationObserver:class{
  constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}
  observe(node,options){assert.equal(node,nav);this.options=options;if(fail==='observe')throw new Error('observe failed');}
  disconnect(){this.disconnected=true;}
 }},createElement(name){
  assert.equal(name,'span');const attrs=new Map();
  return {setAttribute:(key,value)=>attrs.set(key,value),getAttribute:key=>attrs.get(key)??null,
   remove(){const index=children.indexOf(this);if(index>=0)children.splice(index,1);this.parentElement=null;}};
 }};
 nav.ownerDocument=document;
 const model={
  getSnapshot(){if(fail==='snapshot')throw new Error('snapshot failed');return snapshot;},
  setIcons(value){reads.push(value);},
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
 };
 const anchor={closest:selector=>{assert.equal(selector,'nav');return nav;}};
 return {anchor,nav,model,native,children,reads,observers,state,style,listeners,
  set(next){snapshot=next;for(const fn of [...listeners])fn();},mutate(target=native){observers.at(-1).callback([{target}]);}};
}
const flush=()=>new Promise(resolve=>queueMicrotask(resolve));

test('mounts one owned sibling without replacing native children and restores navigation markers on disposal',()=>{
 const f=fixture(),seat=mountAppDockSeat(f.anchor,f.model);
 assert.equal(f.children[0],f.native);assert.deepEqual(f.children,[f.native,seat.node]);
 assert.equal(seat.node.className,'cgpt-app-dock-seat');assert.equal(seat.node.getAttribute('data-cgpt-app-dock'),'');
 assert.equal(f.state.get('data-cgpt-app-mode'),'');assert.equal(f.state.get('data-cgpt-app-native-more'),'true');assert.equal(f.style.get('--cgpt-app-extra-height'),'88px');
 assert.equal(f.listeners.size,1);assert.equal(f.reads.length,1);
 seat.dispose();seat.dispose();
 assert.deepEqual(f.children,[f.native]);assert.equal(f.state.has('data-cgpt-app-mode'),false);assert.equal(f.state.has('data-cgpt-app-native-more'),false);assert.equal(f.style.has('--cgpt-app-extra-height'),false);
 assert.equal(f.listeners.size,0);assert.equal(f.observers[0].disconnected,true);
});

test('restores prior marker values and responds to native More space changes',()=>{
 const f=fixture({attributes:{'data-cgpt-app-mode':'before','data-cgpt-app-native-more':'legacy'},extra:'17px'}),seat=mountAppDockSeat(f.anchor,f.model);
 f.set({canShowNativeMore:false,reservedEntryCount:0});assert.equal(f.state.get('data-cgpt-app-native-more'),'false');assert.equal(f.style.get('--cgpt-app-extra-height'),'0px');
 seat.dispose();assert.equal(f.state.get('data-cgpt-app-mode'),'before');assert.equal(f.state.get('data-cgpt-app-native-more'),'legacy');assert.equal(f.style.get('--cgpt-app-extra-height'),'17px');
});

test('coalesces native mutations and cancels queued icon reads after unmount',async()=>{
 const f=fixture(),seat=mountAppDockSeat(f.anchor,f.model);
 f.mutate();f.mutate();f.mutate();assert.equal(f.reads.length,1);await flush();assert.equal(f.reads.length,2);
 f.mutate();seat.dispose();await flush();assert.equal(f.reads.length,2);
 f.mutate();await flush();assert.equal(f.reads.length,2);
 assert.deepEqual(f.children,[f.native]);
});

test('ignores mutations inside its presentation seat while observing native image/path changes',async()=>{
 const f=fixture(),seat=mountAppDockSeat(f.anchor,f.model),observer=f.observers[0];
 assert.equal(observer.options.attributes,true);assert.ok(observer.options.attributeFilter.includes('src'));assert.ok(observer.options.attributeFilter.includes('d'));
 f.mutate({closest:selector=>{assert.equal(selector,'[data-cgpt-app-dock]');return seat.node;}});await flush();assert.equal(f.reads.length,1);
 f.mutate();await flush();assert.equal(f.reads.length,2);seat.dispose();
});

test('initialization failures remove the owned seat and release every acquired observer/subscription',()=>{
 for(const fail of ['snapshot','observe']){
  const f=fixture({fail});assert.throws(()=>mountAppDockSeat(f.anchor,f.model),new RegExp(fail+' failed'));
  assert.deepEqual(f.children,[f.native]);assert.equal(f.listeners.size,0);assert.equal(f.state.has('data-cgpt-app-mode'),false);assert.equal(f.style.has('--cgpt-app-extra-height'),false);
  for(const observer of f.observers)assert.equal(observer.disconnected,true);
 }
});

test('missing native navigation leaves the document untouched',()=>{
 assert.equal(mountAppDockSeat(null,{}),null);assert.equal(mountAppDockSeat({closest:()=>null},{}),null);
});
