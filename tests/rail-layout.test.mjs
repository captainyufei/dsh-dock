import test from 'node:test';
import assert from 'node:assert/strict';
import {wireRailLayout,wireRailGeometry} from '../src/rail-layout.js';

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
 const styleStop=wireRailLayout(host.anchor,{expanded:false});
 const stop=wireRailGeometry(host.anchor,{setWidth:width=>widths.push(width)});
 try{
  assert.ok(host.nav.hasAttribute('data-cgpt-rail-nav'));
  assert.ok(host.column.hasAttribute('data-cgpt-rail-column'));
  assert.ok(host.frame.hasAttribute('data-cgpt-rail-frame'));
  assert.deepEqual(widths,[]);
  assert.equal(host.nav.parentElement,host.root);
  styleStop();
  assert.equal(host.nav.hasAttribute('data-cgpt-rail-nav'),false);
  assert.ok(host.frame.hasAttribute('data-cgpt-rail-frame'),'layout rerender keeps geometry mounted');
  assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'52px minmax(0px, 1fr) minmax(0px, 0px)');
 }finally{styleStop();stop();}
 assert.equal(host.nav.hasAttribute('data-cgpt-rail-nav'),false);
 assert.equal(host.frame.hasAttribute('data-cgpt-rail-frame'),false);
});

test('collapsed rail preserves host center and right panel tracks as the right panel changes',()=>{
 const host=hostFixture('0px minmax(400px, 1fr) minmax(0px, 720px)');
 let changed,disconnected=false;
 const OriginalObserver=globalThis.MutationObserver;
 globalThis.MutationObserver=class{
  constructor(callback){changed=callback;}
  observe(node,options){assert.equal(node,host.frame);assert.deepEqual(options.attributeFilter,['style','data-sidebar-collapsed','data-sidebar-drawer','data-dragging']);}
  disconnect(){disconnected=true;}
 };
 let stop;
 try{
  stop=wireRailGeometry(host.anchor,{expanded:false});
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
  const stop=wireRailGeometry(host.anchor,{expanded:false});
  try{
   assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'52px minmax('+minimum+'px, 1fr) minmax(0px, 360px)');
   if(leading===0)assert.ok(52+minimum+360<=800);
  }finally{stop();}
 }
});

test('expanded sidebar restores the requested conversation width and cleans up rail overrides',()=>{
 const host=hostFixture('280px minmax(0px, 1fr) minmax(0px, 0px)',{collapsed:false});const widths=[];
 host.frame.style.setProperty('--cgpt-rail-columns','previous-value');
 const stop=wireRailGeometry(host.anchor,{expanded:true,preferredWidth:376,setWidth:width=>widths.push(width)});
 assert.deepEqual(widths,[376]);
 stop();
 assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'previous-value');
 assert.equal(host.column.hasAttribute('data-cgpt-rail-column'),false);
});

test('the right track animates from the actual panel width rather than a larger preference',()=>{
 for(const [width,maximum,right] of [[1200,540,408],[1920,864,864]]){
  const host=hostFixture('392px minmax(400px, 1fr) minmax(0px, '+maximum+'px)',{collapsed:false,width});
  const stop=wireRailGeometry(host.anchor);
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
  stop=wireRailGeometry(host.anchor);
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
  observe(node,options){assert.equal(node,host.frame);assert.deepEqual(options.attributeFilter,['style','data-sidebar-collapsed','data-sidebar-drawer','data-dragging']);}
  disconnect(){mutationDisconnected=true;}
 };
 globalThis.ResizeObserver=class{
  constructor(callback){resized=callback;}
  observe(node){assert.equal(node,host.frame);}
  disconnect(){resizeDisconnected=true;}
 };
 let stop;
 try{
  stop=wireRailGeometry(host.anchor);
  const initialWrites=writes;
  changed();
  assert.equal(writes,initialWrites);
  host.setFrameWidth(1600);resized();
  assert.equal(host.frame.style.getPropertyValue(property),'392px minmax(400px, 1fr) minmax(0px, 540px)');
  changed();resized();
  assert.equal(writes,initialWrites+1);
  host.setFrameWidth(1000);resized();
  assert.equal(host.frame.style.getPropertyValue(property),'392px minmax(400px, 1fr) minmax(0px, 208px)');
  stop();stop=null;
  assert.equal(mutationDisconnected,true);assert.equal(resizeDisconnected,true);
  assert.equal(host.frame.style.getPropertyValue(property),'previous-value');
  assert.equal(host.frame.style.getPropertyPriority(property),'important');
  host.setFrameWidth(1400);changed();resized();
  assert.equal(host.frame.style.getPropertyValue(property),'previous-value');
  stop=wireRailGeometry(host.anchor);
  host.frame.style.setProperty(property,'later-owner');
  stop();stop=null;
  assert.equal(host.frame.style.getPropertyValue(property),'later-owner');
 }finally{stop?.();globalThis.MutationObserver=originalMutation;globalThis.ResizeObserver=originalResize;}
});

test('the native collapsed marker selects the rail independently of the effect expanded hint',()=>{
 const host=hostFixture('392px minmax(400px, 1fr) minmax(0px, 360px)',{collapsed:false});
 let changed;
 const OriginalObserver=globalThis.MutationObserver;
 globalThis.MutationObserver=class{constructor(callback){changed=callback;}observe(){}disconnect(){}};
 let stop;
 try{
  stop=wireRailGeometry(host.anchor,{expanded:false});
  assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'392px minmax(400px, 1fr) minmax(0px, 360px)');
  host.frame.setAttribute('data-sidebar-collapsed','');changed();
  assert.equal(host.frame.style.getPropertyValue('--cgpt-rail-columns'),'52px minmax(400px, 1fr) minmax(0px, 360px)');
 }finally{stop?.();globalThis.MutationObserver=OriginalObserver;}
});

function observeGeometry(host,options,run){
 const originalMutation=globalThis.MutationObserver,originalResize=globalThis.ResizeObserver;
 let mutate,resize;const observed=[];
 globalThis.MutationObserver=class{constructor(callback){mutate=callback;}observe(){}disconnect(){}};
 globalThis.ResizeObserver=class{constructor(callback){resize=callback;}observe(node){observed.push(node);}disconnect(){}};
 let stop;
 try{stop=wireRailGeometry(host.anchor,options);run({mutate:(records=[])=>mutate(records),resize:()=>resize?.(),observed,stop});}
 finally{stop?.();globalThis.MutationObserver=originalMutation;globalThis.ResizeObserver=originalResize;}
}
const railColumns=host=>host.frame.style.getPropertyValue('--cgpt-rail-columns');
const contentWidth=host=>host.frame.style.getPropertyValue('--cgpt-rail-content-width');

test('closed and reopened geometry retains its final content width and installs the target before measuring',()=>{
 const host=hostFixture('0px minmax(0px, 1fr) minmax(0px, 0px)',{width:1200});
 const widths=[];let measuring=false;
 host.root.getBoundingClientRect=()=>{throw new Error('must not sample animated root');};
 host.frame.getBoundingClientRect=()=>{if(measuring)assert.ok(railColumns(host).startsWith('376px '));return {width:1200};};
 observeGeometry(host,{preferredWidth:376,setWidth:width=>{
  assert.ok(railColumns(host).startsWith('376px '),'CSS target precedes host commit');
  widths.push(width);
  host.frame.style.gridTemplateColumns=width+'px minmax(0px, 1fr) minmax(0px, 0px)';
 }},({mutate,resize,observed})=>{
  assert.deepEqual(widths,[]);assert.equal(contentWidth(host),'376px');
  assert.deepEqual(observed,[host.frame],'only the frame size is observed');
  host.root.style.width='52px';resize();assert.equal(contentWidth(host),'376px');
  host.frame.removeAttribute('data-sidebar-collapsed');
  host.frame.style.gridTemplateColumns='280px minmax(0px, 1fr) minmax(0px, 0px)';
  measuring=true;mutate();mutate();
  host.root.style.width='190px';resize();
  assert.deepEqual(widths,[376]);assert.equal(contentWidth(host),'376px');
  assert.ok(railColumns(host).startsWith('376px '));
  measuring=false;host.frame.setAttribute('data-sidebar-collapsed','');
  host.frame.style.gridTemplateColumns='0px minmax(0px, 1fr) minmax(0px, 0px)';mutate();
  assert.ok(railColumns(host).startsWith('52px '));assert.equal(contentWidth(host),'376px');
 });
});

test('native drag targets persist across close and reopen while intermediate root animation widths are ignored',()=>{
 const host=hostFixture('392px minmax(0px, 1fr) minmax(0px, 0px)',{collapsed:false,width:1200});
 const widths=[],restored=[];
 observeGeometry(host,{onWidth:width=>widths.push(width),setWidth:width=>restored.push(width)},({mutate,resize})=>{
  host.frame.setAttribute('data-dragging','');mutate();
  host.frame.style.gridTemplateColumns='318px minmax(0px, 1fr) minmax(0px, 0px)';mutate();
  assert.equal(contentWidth(host),'318px');assert.deepEqual(widths,[318]);
  host.frame.removeAttribute('data-dragging');mutate();
  host.root.style.width='275px';resize();assert.deepEqual(widths,[318]);
  host.frame.setAttribute('data-sidebar-collapsed','');
  host.frame.style.gridTemplateColumns='0px minmax(0px, 1fr) minmax(0px, 0px)';mutate();
  host.frame.removeAttribute('data-sidebar-collapsed');
  host.frame.style.gridTemplateColumns='280px minmax(0px, 1fr) minmax(0px, 0px)';mutate();
  mutate();resize();resize();
  assert.deepEqual(restored,[318],'unacknowledged host write does not create a feedback loop');
  assert.deepEqual(widths,[318]);assert.ok(railColumns(host).startsWith('318px '));
 });
});

test('a drag completed in one mutation batch records its host target, and rapid toggles keep the last state',()=>{
 const host=hostFixture('392px minmax(0px, 1fr) minmax(0px, 0px)',{collapsed:false});const widths=[];
 observeGeometry(host,{onWidth:width=>widths.push(width),setWidth:()=>{}},({mutate})=>{
  host.frame.style.gridTemplateColumns='340px minmax(0px, 1fr) minmax(0px, 0px)';
  mutate([{attributeName:'data-dragging',oldValue:'true'}]);assert.deepEqual(widths,[340]);
  for(const collapsed of [true,false,true,false,true]){
   if(collapsed)host.frame.setAttribute('data-sidebar-collapsed','');else host.frame.removeAttribute('data-sidebar-collapsed');
   host.frame.style.gridTemplateColumns=(collapsed?0:280)+'px minmax(0px, 1fr) minmax(0px, 0px)';mutate();
  }
  assert.equal(contentWidth(host),'340px');assert.ok(railColumns(host).startsWith('52px '));
  mutate();assert.deepEqual(widths,[340]);
 });
});

test('drawer and centered host presentation do not overwrite the remembered drag width',()=>{
 const host=hostFixture('560px minmax(0px, 1fr) minmax(0px, 0px)',{collapsed:false,width:1120});const widths=[];
 observeGeometry(host,{preferredWidth:318,setWidth:width=>widths.push(width)},({mutate,resize})=>{
  assert.ok(railColumns(host).startsWith('560px '));assert.equal(contentWidth(host),'560px');
  resize();assert.deepEqual(widths,[]);
  host.frame.setAttribute('data-sidebar-drawer','');host.column.style.width='300px';
  host.frame.style.gridTemplateColumns='0px minmax(0px, 1fr) minmax(0px, 0px)';mutate();
  assert.equal(railColumns(host),host.frame.style.gridTemplateColumns);assert.equal(contentWidth(host),'300px');
  assert.deepEqual(widths,[]);
  host.frame.removeAttribute('data-sidebar-drawer');
  host.frame.style.gridTemplateColumns='280px minmax(0px, 1fr) minmax(0px, 0px)';mutate();
  assert.equal(contentWidth(host),'318px');assert.deepEqual(widths,[318]);
 });
});

test('an initial host setter failure restores geometry ownership',()=>{
 const host=hostFixture('280px minmax(0px, 1fr) minmax(0px, 0px)',{collapsed:false});
 host.frame.style.setProperty('--cgpt-rail-content-width','old-content','important');
 assert.throws(()=>wireRailGeometry(host.anchor,{setWidth:()=>{throw new Error('host failure');}}),/host failure/);
 assert.equal(host.frame.hasAttribute('data-cgpt-rail-frame'),false);
 assert.equal(host.column.hasAttribute('data-cgpt-rail-column'),false);
 assert.equal(railColumns(host),'');assert.equal(contentWidth(host),'old-content');
 assert.equal(host.frame.style.getPropertyPriority('--cgpt-rail-content-width'),'important');
});
