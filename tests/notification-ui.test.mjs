import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {HomeNotificationBadge,NotificationBell,mountNotificationSeat} from '../src/notification-ui.js';

const h=React.createElement;
const pendingKinds=new Set(['approval','question','plan-review']);
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):(node?.children||[]).map(text).join('');
const bell=view=>view.root.findByProps({className:'cgpt-notification-button'});
const rows=view=>view.root.findAllByProps({className:'cgpt-notification-item'});
const homeDots=view=>view.root.findAllByProps({className:'cgpt-notification-dot cgpt-home-notification-dot'});
const bellDots=view=>bell(view).findAllByProps({className:'cgpt-notification-dot'});
const rowDots=view=>view.root.findAllByProps({className:'cgpt-notification-item-dot'});
const defaultItems=[
 {id:'b',title:'等待授权的任务',kind:'approval',detail:'等待审批',excerpt:'需要确认这次操作',unread:true,occurredAt:3},
 {id:'a',title:'已完成的任务',workspaceTitle:'DeepSeek 插件',kind:'completed',detail:'任务已完成',excerpt:'已完成页面调整，检查通过。',unread:true,occurredAt:2},
 {id:'c',title:'之前完成的任务',kind:'completed',detail:'任务已完成',excerpt:'这里是此前任务的摘要。',unread:false,occurredAt:1},
];

// Exercise the UI contract independently from host transport and storage tests.
function fixture(overrides={}){
 let snapshot={open:false,busyId:null,error:'',available:true,loading:false,items:defaultItems,count:2,...overrides};
 const listeners=new Set(),calls=[];
 const f={calls,closeCalls:0,markCalls:0,onSelect:async()=>true};
 function publish(patch){snapshot={...snapshot,...patch};for(const fn of [...listeners])fn();}
 function acknowledge(ids){
  const items=snapshot.items.map(item=>ids.has(item.id)&&!pendingKinds.has(item.kind)?{...item,unread:false}:item);
  publish({items,count:items.filter(item=>pendingKinds.has(item.kind)||item.unread).length});
 }
 f.model={
  getSnapshot:()=>snapshot,
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  open(){publish({open:true});},
  close(){f.closeCalls++;publish({open:false});},
  markAllRead(){f.markCalls++;acknowledge(new Set(snapshot.items.map(item=>item.id)));},
  async select(id){
   if(snapshot.busyId!==null)return false;
   calls.push(id);publish({busyId:id,error:''});
   try{
    await f.onSelect(id);acknowledge(new Set([id]));publish({busyId:null});return true;
   }catch(error){publish({busyId:null,error:error.message});return false;}
  },
 };
 return Object.assign(f,{publish,get subscriptions(){return listeners.size;},listeners});
}

async function mount(t,model,{homeClick=()=>{}}={}){
 let view,focusCalls=0;
 const keys=new Set();
 const document={addEventListener(name,fn){if(name==='keydown')keys.add(fn);},removeEventListener(name,fn){if(name==='keydown')keys.delete(fn);}};
 await act(async()=>{view=TestRenderer.create(h('div',{'data-test-home':'',onClick:homeClick,onPointerDown:homeClick,onContextMenu:homeClick},
  h(HomeNotificationBadge,{model}),h(NotificationBell,{model})),{createNodeMock:element=>element.props.className==='cgpt-notification-button'?{ownerDocument:document,focus(){focusCalls++;}}:null});
 });
 t.after(async()=>{await act(async()=>view.unmount());});
 return {view,keys,get focusCalls(){return focusCalls;},key(key,props={}){
  const event={key,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...props};
  for(const fn of [...keys])fn(event);return event;
 }};
}

test('bell opens a sidebar feed with pending, unread and read history; both badges use unread count',async t=>{
 const f=fixture(),{view}=await mount(t,f.model);
 assert.equal(homeDots(view).length,1);assert.equal(bellDots(view).length,1);
 assert.match(homeDots(view)[0].props['aria-label'],/^2 条/);assert.match(bell(view).props['aria-label'],/2 条/);
 assert.equal(view.root.findAllByProps({role:'region'}).length,0);
 const original=f.model.getSnapshot().items;await act(async()=>bell(view).props.onClick());
 assert.equal(bell(view).props['aria-expanded'],true);assert.equal(rows(view).length,3);
 assert.equal(f.model.getSnapshot().items,original);assert.equal(rowDots(view).length,2);
 assert.equal(view.root.findAllByProps({role:'menu'}).length,0);
 assert.match(text(view.root.findByProps({'aria-label':'优先事项'})),/等待授权的任务.*已完成的任务/);
 assert.equal(text(view.root.findByProps({className:'cgpt-notification-workspace'})),'DeepSeek 插件');
 assert.match(text(view.root.findByProps({'aria-label':'最近完成'})),/之前完成的任务.*这里是此前任务的摘要/);
 assert.equal(view.root.findByProps({role:'region'}).props.id,bell(view).props['aria-controls']);
});

test('selecting acknowledges a completed row, keeps the feed open and retains its history without a dot',async t=>{
 const f=fixture(),{view}=await mount(t,f.model);await act(async()=>bell(view).props.onClick());
 await act(async()=>view.root.findByProps({'data-notification-id':'a'}).props.onClick());
 assert.deepEqual(f.calls,['a']);assert.equal(f.model.getSnapshot().open,true);assert.equal(rows(view).length,3);
 assert.equal(f.model.getSnapshot().count,1);assert.equal(rowDots(view).length,1);
 assert.equal(view.root.findByProps({'data-notification-id':'a'}).props['aria-current'],'true');
 assert.match(text(view.root.findByProps({'aria-label':'最近完成'})),/已完成的任务/);
 await act(async()=>bell(view).props.onClick());assert.equal(f.model.getSnapshot().open,false);
 assert.equal(view.root.findAllByProps({role:'region'}).length,0);
});

test('mark all read retains history, leaves pending reminders and clears both badges when no pending remains',async t=>{
 const f=fixture(),{view}=await mount(t,f.model);await act(async()=>bell(view).props.onClick());
 const action=()=>view.root.findByProps({className:'cgpt-notification-read-all'});
 assert.equal(action().props.disabled,false);await act(async()=>action().props.onClick());
 assert.equal(f.markCalls,1);assert.equal(f.model.getSnapshot().count,1);assert.equal(rows(view).length,3);
 assert.equal(action().props.disabled,true);assert.equal(rowDots(view).length,1);
 await act(async()=>f.publish({items:f.model.getSnapshot().items.filter(item=>item.kind==='completed'),count:0}));
 assert.equal(homeDots(view).length,0);assert.equal(bellDots(view).length,0);assert.equal(rowDots(view).length,0);
 assert.equal(rows(view).length,2);assert.equal(bell(view).props['aria-label'],'通知');
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
});

test('pending navigation disables repeat actions and failures stay visible for retry',async t=>{
 const f=fixture();let reject;f.onSelect=()=>new Promise((_,failed)=>{reject=failed;});
 const {view}=await mount(t,f.model);await act(async()=>bell(view).props.onClick());
 await act(async()=>rows(view)[0].props.onClick());assert.deepEqual(f.calls,['b']);
 assert.ok(rows(view).every(item=>item.props.disabled));assert.match(text(rows(view)[0]),/正在打开/);
 await act(async()=>rows(view)[1].props.onClick());assert.deepEqual(f.calls,['b']);
 await act(async()=>reject(new Error('连接已断开')));
 assert.equal(text(view.root.findByProps({role:'alert'})),'连接已断开');assert.ok(rows(view).every(item=>!item.props.disabled));
 assert.equal(f.model.getSnapshot().open,true);
});

test('non-success terminal records can be read and are not confused with pending requests',async t=>{
 const f=fixture({count:1,items:[
  {id:'failed',title:'失败任务',kind:'error',detail:'连接中断',unread:true},
  {id:'stopped',title:'停止任务',kind:'aborted',detail:'已停止',unread:false},
 ]}),{view}=await mount(t,f.model);
 await act(async()=>bell(view).props.onClick());assert.equal(rowDots(view).length,1);
 assert.match(text(view.root.findByProps({'aria-label':'优先事项'})),/失败任务/);
 assert.match(text(view.root.findByProps({'aria-label':'最近完成'})),/停止任务/);
 const action=view.root.findByProps({className:'cgpt-notification-read-all'});assert.equal(action.props.disabled,false);
 await act(async()=>action.props.onClick());assert.equal(rows(view).length,2);assert.equal(rowDots(view).length,0);assert.equal(homeDots(view).length,0);
 assert.match(text(view.root.findByProps({'aria-label':'最近完成'})),/失败任务.*停止任务/);
});

test('Escape closes the feed and returns focus to bell, while host dialogs retain their own Escape',async t=>{
 const f=fixture(),m=await mount(t,f.model);await act(async()=>bell(m.view).props.onClick());
 assert.equal(m.keys.size,1);
 await act(async()=>m.key('ArrowDown'));assert.equal(f.model.getSnapshot().open,true);
 await act(async()=>m.key('Escape',{target:{closest:()=>({})}}));assert.equal(f.model.getSnapshot().open,true);
 await act(async()=>m.key('Escape',{defaultPrevented:true}));assert.equal(f.model.getSnapshot().open,true);
 let event;await act(async()=>{event=m.key('Escape');});
 assert.equal(event.defaultPrevented,true);assert.equal(event.stopped,true);assert.equal(f.model.getSnapshot().open,false);
 assert.equal(m.focusCalls,1);assert.equal(m.keys.size,0);
});

test('loading, empty history and missing capability have distinct states',async t=>{
 const f=fixture({items:[],count:0,loading:true}),{view}=await mount(t,f.model);
 await act(async()=>bell(view).props.onClick());assert.match(text(view.root.findByProps({role:'status'})),/正在读取/);
 assert.equal(view.root.findByProps({role:'region'}).props['aria-busy'],true);
 await act(async()=>f.publish({loading:false}));assert.match(text(view.root.findByProps({role:'status'})),/暂无通知记录/);
 await act(async()=>f.publish({available:false}));assert.match(text(view.root.findByProps({role:'status'})),/会话提醒暂不可用/);
 assert.equal(homeDots(view).length,0);
});

function bubble(node,name){
 const event={stopped:false,stopPropagation(){this.stopped=true;}};
 for(let current=node;current&&!event.stopped;current=current.parent)if(typeof current.type==='string')current.props[name]?.(event);
 return event.stopped;
}
test('bell and feed actions never bubble to the Home portal owner; unmount releases listeners',async t=>{
 const f=fixture();let homeClicks=0;const m=await mount(t,f.model,{homeClick:()=>homeClicks++}),view=m.view;
 for(const name of ['onPointerDown','onContextMenu'])assert.equal(bubble(bell(view),name),true);
 let consumed;await act(async()=>{consumed=bubble(bell(view),'onClick');});assert.equal(consumed,true);assert.equal(f.model.getSnapshot().open,true);
 await act(async()=>{consumed=bubble(rows(view)[0],'onClick');});assert.equal(consumed,true);assert.deepEqual(f.calls,['b']);
 assert.equal(homeClicks,0);assert.equal(f.listeners.size,2);
 await act(async()=>view.unmount());assert.equal(f.listeners.size,0);assert.equal(m.keys.size,0);
});

function seatFixture({collapsed=false,observeFails=false,observerAvailable=true,previousMode=null}={}){
 const f=fixture();let disconnected=0,observed,observerCallback,removed=0;
 const children=[],attributes=new Set(collapsed?['data-sidebar-collapsed']:[]),rootAttributes=new Map();
 if(previousMode!==null)rootAttributes.set('data-cgpt-notification-mode',previousMode);
 const frame={hasAttribute:name=>attributes.has(name)};
 const sidebar={parentElement:{parentElement:frame}};
 const document={defaultView:observerAvailable?{MutationObserver:class {
  constructor(callback){observerCallback=callback;}
  observe(target,options){if(observeFails)throw new Error('observer unavailable');observed={target,options};}
  disconnect(){disconnected++;}
 }}:{},createElement:tag=>({tagName:tag,remove(){removed++;const index=children.indexOf(this);if(index>=0)children.splice(index,1);}})};
 const root={ownerDocument:document,closest:selector=>selector==='[data-slot="sidebar"]'?sidebar:null,appendChild:node=>children.push(node),
  getAttribute:name=>rootAttributes.has(name)?rootAttributes.get(name):null,setAttribute:(name,value)=>rootAttributes.set(name,value),removeAttribute:name=>rootAttributes.delete(name)};
 const anchor={closest:selector=>selector==='nav'?{parentElement:root}:null};
 return {anchor,model:f.model,children,frame,attributes,rootAttributes,get closeCalls(){return f.closeCalls;},get listeners(){return f.listeners.size;},get disconnected(){return disconnected;},get observed(){return observed;},get removed(){return removed;},mutate(){observerCallback?.();}};
}

test('seat toggles sidebar mode without moving host children, closes on collapse and restores on dispose',()=>{
 const f=seatFixture(),seat=mountNotificationSeat(f.anchor,f.model);assert.ok(seat);assert.deepEqual(f.children,[seat.node]);assert.equal(f.closeCalls,0);
 assert.equal(f.observed.target,f.frame);assert.deepEqual(f.observed.options.attributeFilter,['data-sidebar-collapsed']);
 assert.equal(f.rootAttributes.has('data-cgpt-notification-mode'),false);f.model.open();assert.equal(f.rootAttributes.has('data-cgpt-notification-mode'),true);
 f.model.close();assert.equal(f.rootAttributes.has('data-cgpt-notification-mode'),false);f.model.open();
 f.attributes.add('data-sidebar-collapsed');f.mutate();assert.equal(f.closeCalls,2);assert.equal(f.model.getSnapshot().open,false);assert.equal(f.rootAttributes.has('data-cgpt-notification-mode'),false);
 f.attributes.delete('data-sidebar-collapsed');f.mutate();assert.equal(f.closeCalls,2);
 seat.dispose();assert.equal(f.children.length,0);assert.equal(f.disconnected,1);assert.equal(f.closeCalls,3);assert.equal(f.removed,1);assert.equal(f.listeners,0);
 seat.dispose();f.attributes.add('data-sidebar-collapsed');f.mutate();assert.equal(f.closeCalls,3);assert.equal(f.disconnected,1);assert.equal(f.removed,1);
});

test('collapsed startup and absent observers are safe; a preexisting attribute is restored on cleanup',()=>{
 const missing=seatFixture();assert.equal(mountNotificationSeat(null,missing.model),null);assert.equal(missing.closeCalls,0);
 const f=seatFixture({collapsed:true}),seat=mountNotificationSeat(f.anchor,f.model);assert.equal(f.closeCalls,1);seat.dispose();
 const fallback=seatFixture({observerAvailable:false,previousMode:'previous'}),fallbackSeat=mountNotificationSeat(fallback.anchor,fallback.model);assert.ok(fallbackSeat);
 fallback.model.open();fallbackSeat.dispose();assert.equal(fallback.children.length,0);assert.equal(fallback.closeCalls,1);assert.equal(fallback.rootAttributes.get('data-cgpt-notification-mode'),'previous');
});

test('observer setup failure removes the seat and mode subscription and closes its model',()=>{
 const f=seatFixture({observeFails:true});assert.throws(()=>mountNotificationSeat(f.anchor,f.model),/observer unavailable/);
 assert.equal(f.children.length,0);assert.equal(f.disconnected,1);assert.equal(f.closeCalls,1);assert.equal(f.removed,1);assert.equal(f.listeners,0);
 assert.equal(f.rootAttributes.has('data-cgpt-notification-mode'),false);
});
