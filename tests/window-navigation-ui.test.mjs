import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {WindowNavigationToolbar} from '../src/window-chrome-ui.js';

const h=React.createElement;
function fixture(){
 let snapshot={canBack:false,canForward:false,current:{kind:'panel',id:'home'}};
 const listeners=new Set(),calls=[];
 const model={getSnapshot:()=>snapshot,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},back(){calls.push('back');},forward(){calls.push('forward');}};
 return {model,listeners,calls,change(patch){snapshot={...snapshot,...patch};for(const listener of [...listeners])listener();}};
}
const button=(view,label)=>view.root.findByProps({'aria-label':label});

test('navigation buttons follow history availability, route independently and release their subscription',async()=>{
 const f=fixture();let view;
 await act(async()=>{view=TestRenderer.create(h(WindowNavigationToolbar,{model:f.model}));});
 assert.deepEqual(view.root.findAllByType('button').map(node=>node.props['aria-label']),['返回','前进']);
 assert.equal(button(view,'返回').props.disabled,true);assert.equal(button(view,'前进').props.disabled,true);
 await act(async()=>f.change({canBack:true}));
 assert.equal(button(view,'返回').props.disabled,false);
 await act(async()=>button(view,'返回').props.onClick());
 assert.deepEqual(f.calls,['back']);
 await act(async()=>f.change({canBack:false,canForward:true}));
 assert.equal(button(view,'返回').props.disabled,true);assert.equal(button(view,'前进').props.disabled,false);
 await act(async()=>button(view,'前进').props.onClick());
 assert.deepEqual(f.calls,['back','forward']);
 await act(async()=>view.unmount());assert.equal(f.listeners.size,0);
});

test('a rejected navigation displays a dismissible error without inventing a successful destination',async()=>{
 const f=fixture();f.model.back=()=>{throw new Error('页面已关闭，请重试。');};let view;
 await act(async()=>{view=TestRenderer.create(h(WindowNavigationToolbar,{model:f.model}));f.change({canBack:true});});
 await act(async()=>button(view,'返回').props.onClick());
 assert.equal(view.root.findByProps({role:'alert'}).findByType('span').children[0],'页面已关闭，请重试。');
 assert.equal(f.model.getSnapshot().current.id,'home');
 await act(async()=>button(view,'关闭提示').props.onClick());
 assert.equal(view.root.findAllByProps({role:'alert'}).length,0);
 await act(async()=>view.unmount());
});
