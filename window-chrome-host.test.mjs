import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWindowChrome} from './window-chrome-host.js';

const PANEL='[data-sidebar-right-session][data-sidebar-right-panel]';
function fixture({platform='darwin',fallback=false}={}){
 const observers=[],nodes=[];
 function node(attributes={}){
  const attrs=new Map(Object.entries(attributes));
  const value={
   children:[],parentElement:null,previousElementSibling:null,nextElementSibling:null,
   getAttribute:name=>attrs.get(name)??null,
   hasAttribute:name=>attrs.has(name),
   setAttribute:(name,text)=>attrs.set(name,String(text)),
   removeAttribute:name=>attrs.delete(name),
   prepend(child){if(child.parentElement)child.remove();this.children.unshift(child);child.parentElement=this;},
   appendChild(child){if(child.parentElement)child.remove();this.children.push(child);child.parentElement=this;},
   remove(){const list=this.parentElement?.children;if(list){const index=list.indexOf(this);if(index>=0)list.splice(index,1);}this.parentElement=null;},
   closest(selector){if(selector!=='[hidden]')return null;let current=this;while(current){if(current.hasAttribute('hidden'))return current;current=current.parentElement;}return null;},
  };
  nodes.push(value);return value;
 }
 const document={
  documentElement:{dataset:{platform}},
  createElement:tag=>{assert.equal(tag,'div');const value=node();value.ownerDocument=document;return value;},
  defaultView:{MutationObserver:class{
   constructor(callback){this.callback=callback;this.connected=false;this.disconnects=0;observers.push(this);}
   observe(target,options){this.target=target;this.options=options;this.connected=true;}
   disconnect(){this.connected=false;this.disconnects++;}
  }},
 };
 const frame=node(),sidebar=node(),sidebarSlot=node(),center=node(),rightbar=node(),overlay=node();
 for(const value of [frame,sidebar,sidebarSlot,center,rightbar,overlay])value.ownerDocument=document;
 frame.appendChild(sidebar);frame.appendChild(center);frame.appendChild(rightbar);frame.appendChild(overlay);
 sidebar.appendChild(sidebarSlot);sidebar.nextElementSibling=center;rightbar.previousElementSibling=center;
 const nativeChildren=[...frame.children];
 let panels=[];
 frame.querySelector=selector=>selector==='[data-rightbar-col]'?!fallback?rightbar:null:selector==='[data-slot="sidebar"]'?sidebarSlot:null;
 frame.querySelectorAll=selector=>selector===PANEL?panels:[];
 const anchor={closest:selector=>selector==='[data-shell-overlay]'?overlay:null};
 function panel(id,{open=false,mode='push',hidden=false}={}){
  const wrapper=node(hidden?{hidden:''}:{}),value=node({'data-sidebar-right-session':id,'data-sidebar-right-panel':mode,...open?{'data-sidebar-right-open':''}:{}});
  rightbar.appendChild(wrapper);wrapper.appendChild(value);panels.push(value);return {value,wrapper};
 }
 return {frame,sidebar,center,rightbar,overlay,anchor,observers,nativeChildren,node,panel,
  replacePanels(values){panels=values;},
  emit(){for(const observer of [...observers])if(observer.connected)observer.callback([]);},
 };
}

test('the global chrome owns one frame seat, first native drag region and reversible markers without moving Host nodes',()=>{
 const f=fixture(),host=mountWindowChrome(f.anchor);
 assert.equal(host.frame,f.frame);assert.equal(host.seat.className,'cgpt-window-chrome-seat');
 assert.equal(host.seat.parentElement,f.frame);assert.equal(f.frame.children.at(-1),host.seat);
 assert.equal(f.frame.children[0].className,'cgpt-window-drag-strip');
 assert.deepEqual(f.frame.children.slice(1,-1),f.nativeChildren);
 assert.equal(f.frame.getAttribute('data-cgpt-window-frame'),'');
 assert.equal(f.center.getAttribute('data-cgpt-window-center'),'');
 assert.deepEqual(host.presentation.getSnapshot(),{sessionId:null,expanded:false,fullscreen:false});
 assert.ok(Object.isFrozen(host.presentation.getSnapshot()));assert.equal(f.observers.length,0);
 host.dispose();host.dispose();assert.deepEqual(f.frame.children,f.nativeChildren);
 assert.equal(f.frame.hasAttribute('data-cgpt-window-frame'),false);assert.equal(f.center.hasAttribute('data-cgpt-window-center'),false);
});

test('the actual sidebar width follows expanded, collapsed and resized columns and restores the prior inline value',()=>{
 const f=fixture(),properties=new Map([['--cgpt-window-leading',['original','important']]]),resizes=[];
 f.frame.style={
  getPropertyValue:name=>properties.get(name)?.[0]||'',getPropertyPriority:name=>properties.get(name)?.[1]||'',
  setProperty:(name,value,priority='')=>properties.set(name,[value,priority]),removeProperty:name=>properties.delete(name),
 };
 let width=392;
 f.sidebar.getBoundingClientRect=()=>({width});
 f.frame.ownerDocument.defaultView.ResizeObserver=class{
  constructor(callback){this.callback=callback;this.connected=false;resizes.push(this);}
  observe(target){assert.equal(target,f.sidebar);this.connected=true;}
  disconnect(){this.connected=false;}
 };
 const host=mountWindowChrome(f.anchor);
 assert.equal(f.frame.style.getPropertyValue('--cgpt-window-leading'),'392px');assert.equal(resizes.length,1);
 width=52;resizes[0].callback([]);assert.equal(f.frame.style.getPropertyValue('--cgpt-window-leading'),'52px');
 width=317.5;resizes[0].callback([]);assert.equal(f.frame.style.getPropertyValue('--cgpt-window-leading'),'317.5px');
 host.dispose();assert.equal(resizes[0].connected,false);
 assert.deepEqual(properties.get('--cgpt-window-leading'),['original','important']);
 width=400;resizes[0].callback([]);assert.deepEqual(properties.get('--cgpt-window-leading'),['original','important']);
});

test('leading-width cleanup preserves a later owner and missing measurements leave the CSS fallback untouched',()=>{
 const f=fixture(),properties=new Map();
 f.frame.style={getPropertyValue:name=>properties.get(name)||'',setProperty:(name,value)=>properties.set(name,value),removeProperty:name=>properties.delete(name)};
 const withoutMeasurement=mountWindowChrome(f.anchor);
 assert.equal(properties.has('--cgpt-window-leading'),false);withoutMeasurement.dispose();
 f.sidebar.getBoundingClientRect=()=>({width:392});
 const host=mountWindowChrome(f.anchor);
 assert.equal(properties.get('--cgpt-window-leading'),'392px');
 properties.set('--cgpt-window-leading','another-owner');host.dispose();
 assert.equal(properties.get('--cgpt-window-leading'),'another-owner');
});

test('center fallback works and cleanup restores prior values while retaining later owner changes',()=>{
 const f=fixture({fallback:true});
 f.frame.setAttribute('data-cgpt-window-frame','before');f.center.setAttribute('data-cgpt-window-center','before-center');
 const host=mountWindowChrome(f.anchor);
 f.center.setAttribute('data-cgpt-window-center','new-owner');
 host.dispose();assert.equal(f.frame.getAttribute('data-cgpt-window-frame'),'before');
 assert.equal(f.center.getAttribute('data-cgpt-window-center'),'new-owner');
});

test('no native drag region is mounted outside macOS and missing global anchors are harmless',()=>{
 const f=fixture({platform:'linux'}),host=mountWindowChrome(f.anchor);
 assert.deepEqual(f.frame.children,[...f.nativeChildren,host.seat]);host.dispose();
 assert.equal(mountWindowChrome(null),null);
 assert.equal(mountWindowChrome({closest:()=>null}),null);
});

test('presentation follows the visible SessionView across page, Session and fullscreen changes',()=>{
 const f=fixture();f.panel('old-session',{open:true,mode:'fullscreen',hidden:true});
 const active=f.panel('active-session');const host=mountWindowChrome(f.anchor);let calls=0;
 const stop=host.presentation.subscribe(()=>calls++);
 assert.deepEqual(host.presentation.getSnapshot(),{sessionId:'active-session',expanded:false,fullscreen:false});
 active.value.setAttribute('data-sidebar-right-open','');f.emit();
 assert.deepEqual(host.presentation.getSnapshot(),{sessionId:'active-session',expanded:true,fullscreen:false});
 active.value.setAttribute('data-sidebar-right-panel','fullscreen');f.frame.setAttribute('data-rightbar-collapsed','');f.emit();
 assert.deepEqual(host.presentation.getSnapshot(),{sessionId:'active-session',expanded:true,fullscreen:true});
 active.wrapper.setAttribute('hidden','');f.emit();
 assert.deepEqual(host.presentation.getSnapshot(),{sessionId:null,expanded:false,fullscreen:false});
 const replacement=f.panel('new-session',{open:true});f.emit();
 assert.equal(host.presentation.getSnapshot().sessionId,'new-session');
 replacement.value.removeAttribute('data-sidebar-right-open');f.emit();
 assert.deepEqual(host.presentation.getSnapshot(),{sessionId:'new-session',expanded:false,fullscreen:false});
 assert.equal(calls,5);stop();host.dispose();
});

test('early getSnapshot reads cannot swallow mutation notifications and unchanged DOM keeps snapshot identity',()=>{
 const f=fixture(),active=f.panel('session'),host=mountWindowChrome(f.anchor);let calls=0;
 const stop=host.presentation.subscribe(()=>calls++);const before=host.presentation.getSnapshot();
 f.emit();assert.equal(host.presentation.getSnapshot(),before);assert.equal(calls,0);
 active.value.setAttribute('data-sidebar-right-open','');
 const early=host.presentation.getSnapshot();assert.notEqual(early,before);assert.equal(calls,0);
 f.emit();assert.equal(calls,1);assert.equal(host.presentation.getSnapshot(),early);
 f.frame.setAttribute('data-rightbar-fullscreen','');f.emit();
 assert.equal(host.presentation.getSnapshot(),early);assert.equal(calls,1);
 stop();host.dispose();
});

test('one local observer is shared, released after the final consumer, and reconnected with an up-to-date snapshot',()=>{
 const f=fixture(),active=f.panel('session'),host=mountWindowChrome(f.anchor);let first=0,second=0;
 const stopA=host.presentation.subscribe(()=>first++),stopB=host.presentation.subscribe(()=>second++);
 assert.equal(f.observers.length,1);const observer=f.observers[0];
 assert.equal(observer.target,f.frame);assert.equal(observer.options.childList,true);assert.equal(observer.options.subtree,true);
 assert.ok(observer.options.attributeFilter.includes('hidden'));assert.ok(observer.options.attributeFilter.includes('data-sidebar-right-open'));
 assert.equal(observer.options.attributeFilter.includes('data-cgpt-window-frame'),false);assert.equal(observer.options.attributeFilter.includes('class'),false);
 stopA();stopA();assert.equal(observer.connected,true);
 active.value.setAttribute('data-sidebar-right-open','');f.emit();assert.equal(first,0);assert.equal(second,1);
 stopB();assert.equal(observer.connected,false);
 active.value.removeAttribute('data-sidebar-right-open');
 const stopC=host.presentation.subscribe(()=>second++);
 assert.equal(f.observers.length,2);assert.equal(second,2);assert.equal(host.presentation.getSnapshot().expanded,false);
 stopC();host.dispose();
});

test('removing the pane publishes the missing state and disposal releases observers, seats and drag ownership',()=>{
 const f=fixture();f.panel('session',{open:true});const host=mountWindowChrome(f.anchor);let calls=0;
 const stop=host.presentation.subscribe(()=>calls++);
 f.replacePanels([]);f.emit();assert.deepEqual(host.presentation.getSnapshot(),{sessionId:null,expanded:false,fullscreen:false});assert.equal(calls,1);
 const last=host.presentation.getSnapshot();host.dispose();
 assert.equal(f.observers[0].connected,false);assert.deepEqual(f.frame.children,f.nativeChildren);
 f.panel('later',{open:true});f.emit();assert.equal(calls,1);assert.equal(host.presentation.getSnapshot(),last);
 host.presentation.subscribe(()=>calls++);assert.equal(f.observers.length,1);stop();
});
