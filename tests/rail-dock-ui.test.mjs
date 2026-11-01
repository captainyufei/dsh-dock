import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {DockCustomizer,RailDockControls} from '../src/rail-dock-ui.js';

const h=React.createElement;
const entries=[
 {id:'home',label:'首页',kind:'panel'},
 {id:'schedules',label:'自动化任务',kind:'panel'},
 {id:'plugins',label:'插件',kind:'panel'},
 {id:'action:browse-plugins',label:'浏览更多插件',kind:'action'},
 {id:'action:create-plugin',label:'创建你的插件',kind:'action'},
 {id:'action:settings',label:'设置',kind:'action'},
];
const defaults=['home','schedules','plugins'];
const Modal=props=>props.open?h('section',{role:'dialog','aria-label':props.title},props.children,props.footer):null;
const Menu=props=>props.open?h('section',{role:'menu'},props.anchor,props.children):null;
const MenuItem=props=>h('button',{onClick:props.onSelect},props.children);
const text=node=>typeof node==='string'?node:(node.children||[]).map(text).join('');
const button=(view,label)=>view.root.findAllByType('button').find(node=>node.props['aria-label']===label||text(node)===label);

function fixture({ids=defaults,customized=false}={}){
 const listeners=new Set(),calls=[];let failure=null,current;
 function publish(next,custom=true){
  current={all:entries,dockIds:[...next],visible:next.map(id=>entries.find(entry=>entry.id===id)).slice(0,6),overflow:[],showMore:false,capacity:6,customized:custom};
  for(const listener of [...listeners])listener();
 }
 publish(ids,customized);
 function change(method,args,next,custom=true){calls.push([method,...args]);if(failure)throw failure;publish(next,custom);}
 const model={
  getSnapshot:()=>current,
  subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  move(id,delta){const next=[...current.dockIds],index=next.indexOf(id);next.splice(index,1);next.splice(index+delta,0,id);change('move',[id,delta],next);},
  toggleDock(id,enabled){change('toggleDock',[id,enabled],enabled?[...current.dockIds,id]:current.dockIds.filter(item=>item!==id));},
  resetDock(){change('resetDock',[],defaults,false);},
  run(){throw new Error('Configuration must never navigate or execute an entry');},
 };
 return {model,calls,listeners,publish,fail:error=>{failure=error;}};
}

test('the default customizer has three selected rows and collapsed optional actions, with Home fixed',async()=>{
 const f=fixture();let view;
 await act(async()=>{view=TestRenderer.create(h(DockCustomizer,{navigationModel:f.model,Modal,onClose:()=>{}}));});
 assert.equal(view.root.findByProps({role:'dialog'}).props['aria-label'],'自定义 Dock');
 const selected=view.root.findByType('ol').findAllByType('li');
 assert.deepEqual(selected.map(row=>row.findByProps({className:'cgpt-dock-entry-name'}).children[0]),['首页','自动化任务','插件']);
 assert.equal(selected[0].findAllByType('button').length,0);
 assert.equal(selected[0].findByProps({className:'cgpt-dock-fixed'}).children[0],'固定');
 const optional=view.root.findByType('details');
 assert.equal(Boolean(optional.props.open),false);
 assert.equal(optional.findByType('summary').children[0],'其他入口');
 assert.deepEqual(optional.findAllByType('li').map(row=>row.findByType('button').props['aria-label']),['添加到 Dock 浏览更多插件','添加到 Dock 创建你的插件','添加到 Dock 设置']);
 assert.equal(button(view,'上移 自动化任务').props.disabled,true);
 assert.equal(button(view,'下移 插件').props.disabled,true);
 assert.equal(button(view,'恢复默认').props.disabled,true);
 assert.deepEqual(f.calls,[]);
 await act(async()=>view.unmount());assert.equal(f.listeners.size,0);
});

test('move, remove, add and restore use only preference methods and update the rendered rows',async()=>{
 const f=fixture();let view,closed=0;
 await act(async()=>{view=TestRenderer.create(h(DockCustomizer,{navigationModel:f.model,Modal,onClose:()=>closed++}));});
 await act(async()=>button(view,'上移 插件').props.onClick());
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','plugins','schedules']);
 await act(async()=>button(view,'从 Dock 移除 插件').props.onClick());
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','schedules']);
 assert.equal(button(view,'添加到 Dock 插件').parent.parent.type,'ul');
 await act(async()=>button(view,'添加到 Dock 插件').props.onClick());
 await act(async()=>button(view,'添加到 Dock 设置').props.onClick());
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','schedules','plugins','action:settings']);
 assert.equal(button(view,'恢复默认').props.disabled,false);
 await act(async()=>button(view,'恢复默认').props.onClick());
 assert.deepEqual(f.model.getSnapshot().dockIds,defaults);
 assert.deepEqual(f.calls,[['move','plugins',-1],['toggleDock','plugins',false],['toggleDock','plugins',true],['toggleDock','action:settings',true],['resetDock']]);
 assert.equal(closed,0);
 await act(async()=>button(view,'完成').props.onClick());assert.equal(closed,1);
 await act(async()=>view.unmount());assert.equal(f.listeners.size,0);
});

for(const [label,method] of [['上移 插件','move'],['从 Dock 移除 插件','toggleDock'],['添加到 Dock 设置','toggleDock'],['恢复默认','resetDock']]){
 test(`a failed ${method} request keeps the modal and previous preferences with a visible error`,async()=>{
  const f=fixture({customized:true});let view,closed=0;
  await act(async()=>{view=TestRenderer.create(h(DockCustomizer,{navigationModel:f.model,Modal,onClose:()=>closed++}));});
  f.fail(new Error('Storage denied'));
  await act(async()=>button(view,label).props.onClick());
  assert.deepEqual(f.model.getSnapshot().dockIds,defaults);
  assert.equal(view.root.findByProps({role:'alert'}).children[0],'Storage denied');
  assert.equal(view.root.findByType(Modal).props.open,true);assert.equal(closed,0);
  f.fail(null);
  await act(async()=>button(view,'添加到 Dock 设置').props.onClick());
  assert.equal(view.root.findAllByProps({role:'alert'}).length,0);
  await act(async()=>view.unmount());assert.equal(f.listeners.size,0);
 });
}

test('the customizer isolates portal pointer, click and context events from Home navigation',async()=>{
 const f=fixture();let view,stopped=0;
 await act(async()=>{view=TestRenderer.create(h(DockCustomizer,{navigationModel:f.model,Modal,onClose:()=>{}}));});
 const wrapper=view.root.findByProps({className:'cgpt-dock-ui'});
 for(const name of ['onClick','onPointerDown','onContextMenu'])wrapper.props[name]({stopPropagation(){stopped++;}});
 assert.equal(stopped,3);assert.deepEqual(f.calls,[]);
 await act(async()=>view.unmount());
});

test('right-click controls open the customizer without navigation and release every listener on unmount',async()=>{
 const f=fixture(),bindings=new Map();
 const root={
  addEventListener:(name,handler)=>bindings.set(name,handler),
  removeEventListener:(name,handler)=>{assert.equal(bindings.get(name),handler);bindings.delete(name);},
  getBoundingClientRect:()=>({left:0,top:0}),
 };
 const nativeButton={
  closest:selector=>selector==='[data-cgpt-nav-button],[data-cgpt-rail-action]'?nativeButton:null,
  getAttribute:name=>name==='data-cgpt-nav-button'?'plugins':null,
  getBoundingClientRect:()=>({left:8,right:44,top:140,height:36}),
 };
 const nav={parentElement:root,contains:target=>target===nativeButton};
 const anchorRef={current:{closest:selector=>selector==='nav'?nav:null}};
 let view,prevented=0,stopped=0;
 await act(async()=>{view=TestRenderer.create(h(RailDockControls,{anchorRef,navigationModel:f.model,Menu,MenuItem,Modal}));});
 assert.equal(bindings.size,11);assert.equal(f.listeners.size,1);
 await act(async()=>bindings.get('contextmenu')({target:nativeButton,clientX:20,clientY:150,preventDefault(){prevented++;},stopPropagation(){stopped++;}}));
 assert.equal(prevented,1);assert.equal(stopped,1);
 assert.equal(view.root.findByProps({role:'menu'}).findAllByType(MenuItem).length,2);
 await act(async()=>button(view,'自定义 Dock…').props.onClick());
 assert.equal(view.root.findAllByProps({role:'menu'}).length,0);
 assert.equal(view.root.findAllByProps({role:'dialog'}).length,1);
 assert.equal(f.listeners.size,2);assert.deepEqual(f.calls,[]);
 await act(async()=>button(view,'完成').props.onClick());
 assert.equal(view.root.findAllByProps({role:'dialog'}).length,0);assert.equal(f.listeners.size,1);
 await act(async()=>view.unmount());assert.equal(f.listeners.size,0);assert.equal(bindings.size,0);
});
