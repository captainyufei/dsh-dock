import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWindowMotion} from '../src/window-motion.js';

const ATTRIBUTE='data-cgpt-right-motion';
function deferredTransition(property='transform'){
 let resolve,reject;
 const animation={transitionProperty:property,playState:'running',finished:new Promise((yes,no)=>{resolve=yes;reject=no;})};
 return {animation,resolve:()=>{animation.playState='finished';resolve();},reject:()=>{animation.playState='idle';reject(new Error('cancelled'));}};
}
function fixture({before=null,reduced=false,computed=true}={}){
 const attributes=new Map(before===null?[]:[[ATTRIBUTE,before]]),rafs=new Map(),timers=new Map(),events=[];
 const panels=[],grid=[],view={};
 let sequence=0;
 view.requestAnimationFrame=callback=>{const id=++sequence;rafs.set(id,callback);return id;};
 view.cancelAnimationFrame=id=>rafs.delete(id);
 view.setTimeout=(callback,delay)=>{const id=++sequence;timers.set(id,{callback,delay});return id;};
 view.clearTimeout=id=>timers.delete(id);
 view.matchMedia=()=>({matches:reduced});
 if(computed)view.getComputedStyle=()=>({get gridTemplateColumns(){events.push('computed:'+attributes.get(ATTRIBUTE));return '392px 664px 864px';}});
 const frame={
  ownerDocument:{defaultView:view},
  getAttribute:name=>attributes.get(name)??null,
  setAttribute:(name,value)=>{attributes.set(name,value);if(name===ATTRIBUTE)events.push('marker:'+value);},
  removeAttribute:name=>attributes.delete(name),
  getBoundingClientRect:()=>{events.push('bounds:'+attributes.get(ATTRIBUTE));return {width:1920};},
  getAnimations:()=>grid,
  querySelectorAll:()=>panels,
 };
 const dock=(animations,{hidden=false}={})=>({getAnimations:()=>animations,closest:()=>hidden?{}:null});
 const panel=(docks,{hidden=false}={})=>({querySelectorAll:()=>docks,closest:()=>hidden?{}:null});
 return {frame,view,events,grid,panels,dock,panel,rafs,timers,
  flushFrame(){const callbacks=[...rafs.values()];rafs.clear();for(const callback of callbacks)callback();},
  flushLease(){for(const timer of [...timers.values()])timer.callback();},
 };
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};

test('prepare flushes the marked starting grid before the native action and finish waits a frame',()=>{
 const f=fixture(),motion=mountWindowMotion(f.frame);
 const finish=motion.prepare();f.events.push('action');
 assert.deepEqual(f.events,['marker:1','computed:1','action']);
 finish();finish();
 assert.equal(f.rafs.size,1);
 assert.equal(f.frame.getAttribute(ATTRIBUTE),'1');
 f.flushFrame();
 assert.equal(f.frame.getAttribute(ATTRIBUTE),null);assert.equal(f.timers.size,0);
 motion.dispose();
});

test('finish waits for both the frame grid and visible dock transforms, including cancelled transitions',async()=>{
 const f=fixture(),motion=mountWindowMotion(f.frame),grid=deferredTransition('grid-template-columns'),dock=deferredTransition(),irrelevant=deferredTransition('opacity'),hidden=deferredTransition();
 f.grid.push(grid.animation,irrelevant.animation);
 f.panels.push(f.panel([f.dock([dock.animation]),f.dock([hidden.animation],{hidden:true})]),f.panel([f.dock([hidden.animation])],{hidden:true}));
 const finish=motion.prepare();finish();f.flushFrame();
 grid.resolve();await settle();
 assert.equal(f.frame.getAttribute(ATTRIBUTE),'1');
 dock.reject();await settle();
 assert.equal(f.frame.getAttribute(ATTRIBUTE),null);assert.equal(f.timers.size,0);
 motion.dispose();
});

test('reduced motion and already-finished animations release without awaiting unrelated promises',()=>{
 for(const reduced of [false,true]){
  const f=fixture({reduced}),motion=mountWindowMotion(f.frame),transition=deferredTransition('grid-template-columns');
  if(!reduced)transition.animation.playState='finished';
  f.grid.push(transition.animation);
  const finish=motion.prepare();finish();f.flushFrame();
  assert.equal(f.frame.getAttribute(ATTRIBUTE),null);assert.equal(f.timers.size,0);
  motion.dispose();
 }
});

test('a reverse prepare owns a new generation and late old promises or finishes cannot clear it',async()=>{
 const f=fixture({before:'original'}),motion=mountWindowMotion(f.frame),old=deferredTransition('grid-template-columns'),next=deferredTransition('grid-template-columns');
 f.grid.push(old.animation);
 const oldFinish=motion.prepare();oldFinish();f.flushFrame();
 f.grid.splice(0,1,next.animation);
 const nextFinish=motion.prepare();nextFinish();f.flushFrame();
 assert.equal(f.frame.getAttribute(ATTRIBUTE),'2');assert.equal(f.timers.size,1);
 old.resolve();oldFinish();await settle();
 assert.equal(f.frame.getAttribute(ATTRIBUTE),'2');
 next.resolve();await settle();
 assert.equal(f.frame.getAttribute(ATTRIBUTE),'original');assert.equal(f.timers.size,0);
 motion.dispose();
});

test('dispose cancels scheduled work, restores the prior marker and ignores late completion',async()=>{
 const f=fixture({before:'original'}),motion=mountWindowMotion(f.frame),animation=deferredTransition('grid-template-columns');
 f.grid.push(animation.animation);
 const finish=motion.prepare();finish();f.flushFrame();
 motion.dispose();motion.dispose();
 assert.equal(f.frame.getAttribute(ATTRIBUTE),'original');assert.equal(f.rafs.size,0);assert.equal(f.timers.size,0);
 animation.resolve();await settle();finish();motion.prepare()();
 assert.equal(f.frame.getAttribute(ATTRIBUTE),'original');assert.equal(f.rafs.size,0);
 const another=mountWindowMotion(f.frame);another.prepare()();
 assert.equal(f.rafs.size,1);another.dispose();assert.equal(f.rafs.size,0);assert.equal(f.timers.size,0);
});

test('later owners are preserved by animation completion, subsequent prepares and disposal',async()=>{
 const f=fixture({before:'original'}),motion=mountWindowMotion(f.frame),animation=deferredTransition('grid-template-columns');
 f.grid.push(animation.animation);motion.prepare()();f.flushFrame();
 f.frame.setAttribute(ATTRIBUTE,'later-owner');animation.resolve();await settle();
 assert.equal(f.frame.getAttribute(ATTRIBUTE),'later-owner');
 motion.prepare()();f.flushFrame();
 assert.equal(f.frame.getAttribute(ATTRIBUTE),'later-owner');
 motion.prepare();f.frame.setAttribute(ATTRIBUTE,'latest-owner');motion.dispose();
 assert.equal(f.frame.getAttribute(ATTRIBUTE),'latest-owner');
});

test('a missing computed-style API falls back to bounds and an abandoned lease has bounded cleanup',()=>{
 const f=fixture({computed:false}),motion=mountWindowMotion(f.frame);
 motion.prepare();
 assert.deepEqual(f.events,['marker:1','bounds:1']);
 assert.equal([...f.timers.values()][0].delay,10000);
 f.flushLease();assert.equal(f.frame.getAttribute(ATTRIBUTE),null);assert.equal(f.timers.size,0);
 motion.dispose();
});
