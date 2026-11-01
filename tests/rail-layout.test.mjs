import test from 'node:test';
import assert from 'node:assert/strict';
import {wireRailLayout} from '../src/rail-layout.js';

// Minimal host boundary: no React nodes are replaced or moved by the adapter.
function hostFixture(columns='0px minmax(0px, 1fr) minmax(0px, 0px)',{collapsed=true,width}={}){
 const makeNode=()=>{
  const attributes=new Map(),properties=new Map(),priorities=new Map();
  return {
   children:[],parentElement:null,
   getAttribute:name=>attributes.get(name)??null,
   hasAttribute:name=>attributes.has(name),
   setAttribute:(name,value)=>attributes.set(name,value),
   removeAttribute:name=>attributes.delete(name),
   querySelector:()=>null,querySelectorAll:()=>[],
   style:{gridTemplateColumns:'',getPropertyValue:name=>properties.get(name)||'',getPropertyPriority:name=>priorities.get(name)||'',setProperty:(name,value,priority='')=>{properties.set(name,value);priorities.set(name,priority);},removeProperty:name=>{properties.delete(name);priorities.delete(name);}},
  };
 };
 const frame=makeNode(),column=makeNode(),slot=makeNode(),root=makeNode(),nav=makeNode();
 frame.style.gridTemplateColumns=columns;
 if(collapsed)frame.setAttribute('data-sidebar-collapsed','');
 let frameWidth=width;
 if(width!==undefined)frame.getBoundingClientRect=()=>({width:frameWidth});
 column.parentElement=frame;slot.parentElement=column;root.parentElement=slot;nav.parentElement=root;
 root.closest=selector=>selector==='[data-slot="sidebar"]'?slot:null;
 const anchor={closest:selector=>selector==='nav'?nav:null};
 return {anchor,root,nav,column,frame,setFrameWidth:value=>{frameWidth=value;}};
}

test('a collapsed sidebar keeps native navigation mounted without reopening the conversation list',()=>{
 const host=hostFixture();const widths=[];
 const stop=wireRailLayout(host.anchor,{expanded:false,setWidth:width=>widths.push(width)});
 try{
  assert.ok(host.nav.hasAttribute('data-cgpt-rail-nav'));
  assert.ok(host.column.hasAttribute('data-cgpt-rail-column'));
  assert.ok(host.frame.hasAttribute('data-cgpt-rail-frame'));
  assert.deepEqual(widths,[]);
  assert.equal(host.nav.parentElement,host.root);
 }finally{stop();}
 assert.equal(host.nav.hasAttribute('data-cgpt-rail-nav'),false);
 assert.equal(host.frame.hasAttribute('data-cgpt-rail-frame'),false);
});

test('collapsed rail preserves host center and right panel tracks as the right panel changes',()=>{
 const host=hostFixture('0px minmax(400px, 1fr) minmax(0px, 720px)');
 let changed,disconnected=false;
 const OriginalObserver=globalThis.MutationObserver;
 globalThis.MutationObserver=class{
  constructor(callback){changed=callback;}
  observe(node,options){assert.equal(node,host.frame);assert.deepEqual(options.attributeFilter,['style','data-sidebar-collapsed']);}
  disconnect(){disconnected=true;}
 };
 let stop;
 try{
  stop=wireRailLayout(host.anchor,{expanded:false});
  assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'52px minmax(348px, 1fr) minmax(0px, 720px)');
  host.frame.style.gridTemplateColumns='0px minmax(0px, 1fr) minmax(0px, 0px)';
  changed();
  assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'52px minmax(0px, 1fr) minmax(0px, 0px)');
  assert.equal(host.frame.style.gridTemplateColumns,'0px minmax(0px, 1fr) minmax(0px, 0px)');
 }finally{stop?.();globalThis.MutationObserver=OriginalObserver;}
 assert.equal(disconnected,true);
 assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'');
});

test('a narrow macOS frame leaves room for the right panel while browser rails keep their existing center minimum',()=>{
 for(const [leading,minimum] of [[0,348],[56,400]]){
  const host=hostFixture(leading+'px minmax(400px, 1fr) minmax(0px, 360px)');
  const stop=wireRailLayout(host.anchor,{expanded:false});
  try{
   assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'52px minmax('+minimum+'px, 1fr) minmax(0px, 360px)');
   if(leading===0)assert.ok(52+minimum+360<=800);
  }finally{stop();}
 }
});

test('expanded sidebar restores the requested conversation width and cleans up rail overrides',()=>{
 const host=hostFixture('280px minmax(0px, 1fr) minmax(0px, 0px)',{collapsed:false});const widths=[];
 host.frame.style.setProperty('--cgpt-rail-columns','previous-value');
 const stop=wireRailLayout(host.anchor,{expanded:true,preferredWidth:376,setWidth:width=>widths.push(width)});
 assert.deepEqual(widths,[376]);
 stop();
 assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'previous-value');
 assert.equal(host.column.hasAttribute('data-cgpt-rail-column'),false);
});

test('the right track animates from the actual panel width rather than a larger preference',()=>{
 for(const [width,maximum,right] of [[1200,540,408],[1920,864,864]]){
  const host=hostFixture('392px minmax(400px, 1fr) minmax(0px, '+maximum+'px)',{collapsed:false,width});
  const stop=wireRailLayout(host.anchor);
  try{
   assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'392px minmax(400px, 1fr) minmax(0px, '+right+'px)');
   assert.equal(host.frame.style.gridTemplateColumns,'392px minmax(400px, 1fr) minmax(0px, '+maximum+'px)');
  }finally{stop();}
 }
});

test('a measured collapsed rail preserves the native panel solve and a closed track stays zero',()=>{
 const host=hostFixture('0px minmax(400px, 1fr) minmax(0px, 540px)',{width:800});
 let changed;
 const OriginalObserver=globalThis.MutationObserver;
 globalThis.MutationObserver=class{constructor(callback){changed=callback;}observe(){}disconnect(){}};
 let stop;
 try{
  stop=wireRailLayout(host.anchor);
  assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'52px minmax(348px, 1fr) minmax(0px, 400px)');
  host.frame.style.gridTemplateColumns='0px minmax(0px, 1fr) minmax(0px, 0px)';
  changed();
  assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'52px minmax(0px, 1fr) minmax(0px, 0px)');
 }finally{stop?.();globalThis.MutationObserver=OriginalObserver;}
});

test('frame resize converges without a style-mutation loop and disposal restores only owned values',()=>{
 const host=hostFixture('392px minmax(400px, 1fr) minmax(0px, 540px)',{collapsed:false,width:1200});
 const property='--cgpt-rail-columns',originalMutation=globalThis.MutationObserver,originalResize=globalThis.ResizeObserver;
 host.frame.style.setProperty(property,'previous-value','important');
 let changed,resized,mutationDisconnected=false,resizeDisconnected=false,writes=0;
 const setProperty=host.frame.style.setProperty;
 host.frame.style.setProperty=(...args)=>{if(args[0]===property)writes+=1;setProperty(...args);};
 globalThis.MutationObserver=class{
  constructor(callback){changed=callback;}
  observe(node,options){assert.equal(node,host.frame);assert.deepEqual(options.attributeFilter,['style','data-sidebar-collapsed']);}
  disconnect(){mutationDisconnected=true;}
 };
 globalThis.ResizeObserver=class{
  constructor(callback){resized=callback;}
  observe(node){assert.equal(node,host.frame);}
  disconnect(){resizeDisconnected=true;}
 };
 let stop;
 try{
  stop=wireRailLayout(host.anchor);
  assert.equal(writes,1);
  changed();
  assert.equal(writes,1);
  host.setFrameWidth(1600);resized();
  assert.equal(host.frame.style.getPropertyValue(property),'392px minmax(400px, 1fr) minmax(0px, 540px)');
  changed();resized();
  assert.equal(writes,2);
  host.setFrameWidth(1000);resized();
  assert.equal(host.frame.style.getPropertyValue(property),'392px minmax(400px, 1fr) minmax(0px, 208px)');
  stop();stop=null;
  assert.equal(mutationDisconnected,true);assert.equal(resizeDisconnected,true);
  assert.equal(host.frame.style.getPropertyValue(property),'previous-value');
  assert.equal(host.frame.style.getPropertyPriority(property),'important');
  host.setFrameWidth(1400);changed();resized();
  assert.equal(host.frame.style.getPropertyValue(property),'previous-value');
  stop=wireRailLayout(host.anchor);
  host.frame.style.setProperty(property,'later-owner');
  stop();stop=null;
  assert.equal(host.frame.style.getPropertyValue(property),'later-owner');
 }finally{stop?.();globalThis.MutationObserver=originalMutation;globalThis.ResizeObserver=originalResize;}
});

test('the native collapsed marker selects the rail independently of the effect expanded hint',()=>{
 const host=hostFixture('56px minmax(400px, 1fr) minmax(0px, 360px)',{collapsed:false});
 let changed;
 const OriginalObserver=globalThis.MutationObserver;
 globalThis.MutationObserver=class{constructor(callback){changed=callback;}observe(){}disconnect(){}};
 let stop;
 try{
  stop=wireRailLayout(host.anchor,{expanded:false});
  assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'56px minmax(400px, 1fr) minmax(0px, 360px)');
  host.frame.setAttribute('data-sidebar-collapsed','');changed();
  assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'52px minmax(400px, 1fr) minmax(0px, 360px)');
 }finally{stop?.();globalThis.MutationObserver=OriginalObserver;}
});
