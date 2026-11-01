import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWindowDragStrip} from '../src/window-drag-strip.js';

function fixture(platform='darwin'){
 const nativeButtons={native:true},children=[nativeButtons],attributes=new Map();
 const document={documentElement:{dataset:{platform}},createElement:tag=>{assert.equal(tag,'div');return node;}};
 const node={setAttribute:(name,value)=>attributes.set(name,value),remove:()=>{const index=children.indexOf(node);if(index>=0)children.splice(index,1);}};
 const frame={ownerDocument:document,prepend:value=>children.unshift(value)};
 return {frame,children,nativeButtons,node,attributes};
}

test('the native drag background precedes Host controls and owns no mouse listeners or React nodes',()=>{
 const f=fixture(),seat=mountWindowDragStrip(f.frame);
 assert.equal(seat.node,f.node);assert.deepEqual(f.children,[f.node,f.nativeButtons]);
 assert.equal(f.attributes.get('data-window-drag'),'');assert.equal(f.attributes.get('aria-hidden'),'true');
 assert.equal(f.node.className,'cgpt-window-drag-strip');
 seat.dispose();seat.dispose();assert.deepEqual(f.children,[f.nativeButtons]);
});

test('other platforms and a missing frame never add a native window region',()=>{
 for(const platform of ['win32','linux',undefined]){
  const f=fixture(platform);
  if(platform===undefined)delete f.frame.ownerDocument.documentElement.dataset.platform;
  assert.equal(mountWindowDragStrip(f.frame),null);assert.deepEqual(f.children,[f.nativeButtons]);
 }
 assert.equal(mountWindowDragStrip(null),null);
});
