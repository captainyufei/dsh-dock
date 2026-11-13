import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {NATIVE_SESSION_MENU,SESSION_CONTEXT_MENU,mirrorNativeSessionMenu,createSessionContextController,SessionContextMenu} from '../src/session-context-menu.js';

function contextFixture(extra={}){
 const byId={one:{id:'one',title:'Original title',blank:false},blank:{id:'blank',blank:true}};
 const controller=createSessionContextController({sessions:{list:{getSnapshot:()=>({byId})}},...extra});
 return {controller,byId};
}

function nativeMenuFixture(){
 let active=null,point=null,closed=0;
 const calls=[];
 const service={
  active:{getSnapshot:()=>active},
  open(target,nextPoint){
   calls.push({target,point:nextPoint});
   if(active?.value.sessionId===target.value.sessionId&&point?.x===nextPoint.x&&point?.y===nextPoint.y){active=null;return;}
   active=target;point=nextPoint;
  },
  close(){closed++;active=null;},
 };
 return {service,calls,get closed(){return closed;}};
}

test('new hosts open the shared native menu with the captured Session and never render an empty legacy popup',()=>{
 const native=nativeMenuFixture();let focused=0,notifications=0;
 const {controller,byId}=contextFixture({get(name){assert.equal(name,'contextMenus');return native.service;}});
 controller.subscribe(()=>notifications++);
 const trigger={focus(options){assert.deepEqual(options,{preventScroll:true});focused++;byId.one.title='Changed on focus';}};
 assert.equal(controller.open({sessionId:'blank',x:3,y:5,trigger}),false);
 assert.equal(controller.open({sessionId:'missing',x:3,y:5,trigger}),false);
 assert.equal(native.calls.length,0);assert.equal(focused,0);
 assert.equal(controller.open({sessionId:'one',x:123,y:456,trigger}),true);
 assert.equal(focused,1);
 assert.deepEqual(native.calls,[{target:{kind:'session',value:{sessionId:'one',displayTitle:'Original title'}},point:{x:123,y:456}}]);
 assert.equal(controller.getSnapshot(),null);assert.equal(notifications,0);
 controller.close();assert.equal(native.closed,1);
 controller.dispose();assert.equal(native.closed,1);
});

test('repeated native gestures retain the Host toggle behavior instead of closing and reopening the menu',()=>{
 const native=nativeMenuFixture();
 const {controller}=contextFixture({get:()=>native.service});
 const request={sessionId:'one',x:30,y:60};
 controller.open(request);assert.notEqual(native.service.active.getSnapshot(),null);
 controller.open(request);assert.equal(native.service.active.getSnapshot(),null);
 controller.close();assert.equal(native.closed,0);
 controller.open({...request,x:80});
 controller.dispose();assert.equal(native.closed,1);
});

test('closing or disposing the adapter never dismisses another trigger\'s menu, even for the same Session',()=>{
 for(const cleanup of ['close','dispose']){
  const native=nativeMenuFixture();
  const {controller}=contextFixture({get:()=>native.service});
  controller.open({sessionId:'one',x:20,y:30});
  const other={kind:'session',value:{sessionId:'one',displayTitle:'Same Session from another trigger'}};
  native.service.open(other,{x:100,y:200});
  controller[cleanup]();
  assert.equal(native.closed,0);assert.equal(native.service.active.getSnapshot(),other);
 }
});

test('optional native menu service is looked up per gesture and old hosts keep their legacy fallback',()=>{
 let current;
 const native=nativeMenuFixture();
 const {controller}=contextFixture({get:()=>current});
 controller.open({sessionId:'one',x:20,y:30});
 assert.equal(controller.getSnapshot().sessionId,'one');
 current=native.service;
 controller.open({sessionId:'one',x:-2,y:NaN});
 assert.equal(controller.getSnapshot(),null);
 assert.deepEqual(native.calls[0].point,{x:0,y:0});
 current=undefined;
 controller.open({sessionId:'one',x:40,y:50});
 assert.equal(native.closed,1);
 assert.equal(controller.getSnapshot().x,40);
 controller.dispose();
});

test('menu activation is read-only, ignores missing or blank chats, and keeps the exact target identity',()=>{
 const {controller,byId}=contextFixture();let notifications=0,focused=0;
 const stop=controller.subscribe(()=>notifications++);
 assert.equal(controller.open({sessionId:'missing',x:1,y:2}),false);
 assert.equal(controller.open({sessionId:'blank',x:1,y:2}),false);
 const trigger={focus:()=>focused++};
 assert.equal(controller.open({sessionId:'one',x:123,y:456,trigger}),true);
 assert.deepEqual(controller.getSnapshot(),{sessionId:'one',displayTitle:'Original title',x:123,y:456,trigger});
 assert.equal(focused,1);
 assert.equal(notifications,1);
 assert.deepEqual(byId.one,{id:'one',title:'Original title',blank:false});
 controller.close();controller.close();
 assert.equal(notifications,2);
 stop();controller.dispose();
});

test('mirrors the original components, injection closures and locale without copying ownership or invoking any action',()=>{
 let changed,registrations=[],removed=[];
 const ids=['pin','rename','fork','archive','session-id'];
 const entries=ids.map((id,order)=>({options:{id,order,priority:2,children:{unsafe:{}}},component:()=>null,inject:()=>{throw new Error('Must not run actions while registering');},locale:'workspace'}));
 entries.push({options:{id:'unrelated'},component:()=>null});
 const slots={
  entriesOfSlot:name=>{assert.equal(name,NATIVE_SESSION_MENU);return entries;},
  register(options,component){registrations.push({options,component});return()=>removed.push(options.id);},
  subscribe(name,callback){assert.equal(name,NATIVE_SESSION_MENU);changed=callback;return()=>removed.push('subscription');},
 };
 const stop=mirrorNativeSessionMenu(slots);
 assert.deepEqual(registrations.map(x=>x.options.id),ids);
 for(const [index,{options,component}] of registrations.entries()){
  assert.equal(options.name,SESSION_CONTEXT_MENU);
  assert.equal(component,entries[index].component);
  assert.equal(options.inject,entries[index].inject);
  assert.equal(options.locale,'workspace');
  assert.equal(options.children,undefined);
  assert.equal(options.registrant,undefined);
 }
 changed();
 assert.equal(registrations.length,10);
 assert.deepEqual(removed,[...ids].reverse());
 stop();
 assert.equal(removed.includes('subscription'),true);
 assert.equal(removed.filter(id=>id==='archive').length,2);
});

test('uses a legal own slot with native hook context and a pointer anchor, then closes before the original action runs',async()=>{
 const {controller}=contextFixture();let menuProps,rendered,actionRan=false;
 function Menu(props){menuProps=props;return React.createElement('div',null,props.children);}
 function renderSlot(name,owner,options){
  rendered={name,owner,options};
  return React.createElement('button',{onClick:()=>{options.hookContext[1](false);assert.equal(controller.getSnapshot(),null);actionRan=true;}},'Native rename');
 }
 let view;
 await act(async()=>{view=TestRenderer.create(React.createElement(SessionContextMenu,{controller,renderSlot,Menu}));});
 assert.equal(view.toJSON(),null);
 await act(async()=>controller.open({sessionId:'one',x:40,y:80}));
 assert.equal(menuProps.portal,true);assert.equal(menuProps.autoFocus,true);
 assert.deepEqual(menuProps.getAnchorRect(),{left:40,right:40,top:80,bottom:80,width:0,height:0});
 assert.deepEqual(menuProps.anchorPoint,{x:40,y:80});assert.equal(menuProps.contextual,true);
 assert.equal(rendered.name,SESSION_CONTEXT_MENU);
 assert.deepEqual(rendered.owner,{sessionId:'one',displayTitle:'Original title'});
 assert.equal(rendered.options.hookContext[0],true);
 let stopped=0;view.root.findByProps({className:'cgpt-context-layer'}).props.onClick({stopPropagation(){stopped++;}});
 assert.equal(stopped,1);
 await act(async()=>view.root.findAllByType('button')[0].props.onClick());
 assert.equal(actionRan,true);assert.equal(view.toJSON(),null);
 await act(async()=>view.unmount());
});

test('restores keyboard focus on dismissal and never steals focus from a Host action dialog',async()=>{
 const {controller}=contextFixture();let restored=0;
 const body={},document={body,activeElement:body};
 const trigger={ownerDocument:document,isConnected:true,focus(){restored++;}};
 const Menu=props=>React.createElement('div',null,props.children);
 let view;
 await act(async()=>{view=TestRenderer.create(React.createElement(SessionContextMenu,{controller,renderSlot:()=>null,Menu}));});
 await act(async()=>controller.open({sessionId:'one',x:10,y:20,trigger}));
 await act(async()=>controller.close());
 assert.equal(restored,2);
 await act(async()=>controller.open({sessionId:'one',x:10,y:20,trigger}));
 document.activeElement={closest:()=>null};
 await act(async()=>controller.close());
 assert.equal(restored,3);
 await act(async()=>view.unmount());
});
