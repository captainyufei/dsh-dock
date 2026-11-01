import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {RailActionButtons,RailOverflowContent,mountRailActionsSeat} from '../src/rail-navigation.js';

function fixture(snapshot){
 const listeners=new Set(),calls=[];let current=snapshot;
 const model={getSnapshot:()=>current,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},run:id=>{calls.push(id);}};
 return {model,calls,set:value=>{current=value;for(const fn of listeners)fn();},listeners};
}
const action=(id,icon)=>({id,label:id,kind:'action',icon,active:false});

test('promoted action icons keep their global order, execute only on a click, and do not navigate Home through portal bubbling',async()=>{
 const f=fixture({visible:[{id:'home',kind:'panel'},action('browse','browse'),action('create','create'),action('settings','settings')],overflow:[],showMore:false});let view;
 await act(async()=>{view=TestRenderer.create(React.createElement(RailActionButtons,{navigationModel:f.model}));});
 assert.deepEqual(f.calls,[]);
 const buttons=view.root.findAllByType('button');
 assert.equal(buttons.length,3);
 assert.deepEqual(buttons.map(button=>button.props.style.order),[1,2,3]);
 await act(async()=>buttons[1].props.onClick());
 assert.deepEqual(f.calls,['create']);
 let stopped=0;view.root.findByProps({className:'cgpt-rail-action-buttons'}).props.onClick({stopPropagation(){stopped++;}});
 assert.equal(stopped,1);
 await act(async()=>view.unmount());assert.equal(f.listeners.size,0);
});

test('More contains only overflow entries and uses the native onOpen callback for real panels',async()=>{
 const f=fixture({visible:[],overflow:[{id:'extra',label:'Extra panel',kind:'panel',active:true},action('settings','settings')],showMore:true});let view;const opened=[];let dismissed=0;
 const MenuItem=props=>React.createElement('button',{onClick:props.onSelect},props.children);
 await act(async()=>{view=TestRenderer.create(React.createElement(RailOverflowContent,{navigationModel:f.model,MenuItem,onOpen:id=>opened.push(id),onDismiss:()=>dismissed++}));});
 assert.deepEqual(view.root.findAllByType('button').map(button=>button.children[0]),['Extra panel','settings']);
 await act(async()=>view.root.findAllByType('button')[0].props.onClick());
 assert.deepEqual(opened,['extra']);assert.deepEqual(f.calls,[]);assert.equal(dismissed,1);
 await act(async()=>view.root.findAllByType('button')[1].props.onClick());
 assert.deepEqual(f.calls,['settings']);assert.equal(dismissed,2);
 await act(async()=>view.unmount());
});

test('an unavailable overflow action leaves a visible error instead of dismissing the menu',async()=>{
 const f=fixture({visible:[],overflow:[action('settings','settings')],showMore:true});
 f.model.run=()=>{throw new Error('Settings is unavailable');};let dismissed=0,view;
 const MenuItem=props=>React.createElement('button',{onClick:props.onSelect},props.children);
 await act(async()=>{view=TestRenderer.create(React.createElement(RailOverflowContent,{navigationModel:f.model,MenuItem,onDismiss:()=>dismissed++}));});
 await act(async()=>view.root.findByType('button').props.onClick());
 assert.equal(dismissed,0);assert.equal(view.root.findByProps({role:'alert'}).children[0],'Settings is unavailable');
 await act(async()=>view.unmount());
});

test('the action seat is plugin-owned and removed without touching native navigation',()=>{
 const children=[];const node={remove:()=>children.splice(children.indexOf(node),1)};
 const nav={ownerDocument:{createElement:()=>node},appendChild:child=>children.push(child)};
 const seat=mountRailActionsSeat({closest:()=>nav});
 assert.equal(seat.node,node);assert.equal(children.length,1);seat.dispose();assert.equal(children.length,0);
});
