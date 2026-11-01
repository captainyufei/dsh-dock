import test from 'node:test';
import assert from 'node:assert/strict';
import {wireDockEvents} from './rail-dock-events.js';

function fixture(){
 const listeners=new Map(),documentListeners=new Map(),windowListeners=new Map(),requests=[],writes=[],errors=[],captures=[],releases=[];
 let ids=['home','schedules','plugins'],refuse=false;
 const nav={contains:node=>Boolean(node?.inNav)};
 const eventTarget=collection=>({addEventListener(name,fn,capture){assert.equal(capture,true);collection.set(name,fn);},removeEventListener(name,fn,capture){assert.equal(capture,true);assert.equal(collection.get(name),fn);collection.delete(name);}});
 const root={...eventTarget(listeners),ownerDocument:{...eventTarget(documentListeners),defaultView:eventTarget(windowListeners),elementFromPoint:(_x,y)=>[...buttonCache.values()].find(button=>{const rect=button.getBoundingClientRect();return y>=rect.top&&y<rect.top+rect.height;})},getBoundingClientRect:()=>({left:0,top:0})};
 nav.parentElement=root;
 const button=(id,top=100)=>{
  const attributes=new Map([['data-cgpt-nav-button',id]]);
  return {inNav:true,getAttribute:name=>attributes.get(name)??null,setAttribute:(name,value)=>attributes.set(name,value),removeAttribute:name=>attributes.delete(name),setPointerCapture:pointerId=>captures.push([id,pointerId]),releasePointerCapture:pointerId=>releases.push([id,pointerId]),getBoundingClientRect:()=>({right:44,top,height:36}),closest:selector=>selector.includes('data-cgpt-nav-button')?buttonCache.get(id):selector.startsWith('button')?buttonCache.get(id):null};
 };
 const buttonCache=new Map(ids.map((id,index)=>[id,button(id,52+44*index)]));
 const model={getSnapshot:()=>({dockIds:ids,visible:ids.map(id=>({id}))}),setDockIds:next=>{if(refuse)throw new Error('save refused');writes.push(next);ids=next;}};
 const stop=wireDockEvents({closest:()=>nav},{navigationModel:model,onContext:value=>requests.push(value),onError:reason=>errors.push(reason.message)});
 function emitTo(collection,name,target,extra={}){
  const event={target,clientX:22,clientY:100,buttons:1,detail:1,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra};
  collection.get(name)?.(event);return event;
 }
 const emit=(...args)=>emitTo(listeners,...args),emitDocument=(...args)=>emitTo(documentListeners,...args),emitWindow=(...args)=>emitTo(windowListeners,...args);
 return {listeners,documentListeners,windowListeners,requests,writes,errors,captures,releases,buttons:buttonCache,emit,emitDocument,emitWindow,stop,refuse:()=>{refuse=true;}};
}

test('Dock right-click and keyboard menus target native icons without invoking navigation',()=>{
 const f=fixture(),button=f.buttons.get('schedules');
 const pointer=f.emit('contextmenu',button,{clientX:20,clientY:120});
 assert.equal(pointer.prevented,true);assert.equal(pointer.stopped,true);assert.equal(f.requests[0].id,'schedules');
 const keyboard=f.emit('keydown',button,{key:'F10',shiftKey:true});
 assert.equal(keyboard.prevented,true);assert.deepEqual([f.requests[1].x,f.requests[1].y],[50,96]);
 assert.deepEqual(f.writes,[]);f.stop();assert.equal(f.listeners.size,0);
});

test('pointer dragging works without browser HTML drag events, preserves normal clicks and cleans up markers',()=>{
 const f=fixture(),plugin=f.buttons.get('plugins'),schedule=f.buttons.get('schedules');
 f.emit('pointerdown',plugin,{button:0,pointerId:1,clientY:150});
 assert.deepEqual(f.captures,[]);assert.deepEqual(f.releases,[]);
 assert.equal(f.emit('pointermove',plugin,{pointerId:1,clientY:152}).prevented,false);
 assert.deepEqual(f.captures,[]);assert.deepEqual(f.releases,[]);
 assert.equal(f.emit('pointermove',plugin,{pointerId:1,clientY:100}).prevented,true);
 assert.deepEqual(f.captures,[['plugins',1]]);assert.deepEqual(f.releases,[]);
 assert.equal(plugin.getAttribute('data-cgpt-dock-dragging'),'');
 assert.equal(schedule.getAttribute('data-cgpt-dock-drop'),'before');
 f.emit('pointerup',plugin,{pointerId:1,clientY:100});
 assert.deepEqual(f.captures,[['plugins',1]]);assert.deepEqual(f.releases,[['plugins',1]]);
 assert.deepEqual(f.writes,[['home','plugins','schedules']]);
 assert.equal(plugin.getAttribute('data-cgpt-dock-dragging'),null);
 assert.equal(schedule.getAttribute('data-cgpt-dock-drop'),null);
 assert.equal(f.emit('click',plugin).prevented,true);f.stop();
 const plain=fixture();
 plain.emit('pointerdown',plain.buttons.get('plugins'),{button:0,pointerId:1});
 plain.emit('pointerup',plain.buttons.get('plugins'),{pointerId:1});
 assert.equal(plain.emit('click',plain.buttons.get('plugins')).prevented,false);
 assert.deepEqual(plain.captures,[]);assert.deepEqual(plain.releases,[]);
 assert.deepEqual(plain.writes,[]);plain.stop();
});

test('canceled or unmounted pointer drags never persist and release all plugin markers',()=>{
 for(const cancel of ['pointercancel','unmount']){
  const f=fixture(),plugin=f.buttons.get('plugins'),schedule=f.buttons.get('schedules');
  f.emit('pointerdown',plugin,{button:0,pointerId:1,clientY:150});
  f.emit('pointermove',plugin,{pointerId:1,clientY:100});
  if(cancel==='unmount')f.stop();else f.emit('pointercancel',plugin,{pointerId:1});
  assert.equal(plugin.getAttribute('data-cgpt-dock-dragging'),null);assert.equal(schedule.getAttribute('data-cgpt-dock-drop'),null);
  assert.deepEqual(f.writes,[]);if(cancel!=='unmount')f.stop();
  assert.deepEqual(f.captures,[['plugins',1]]);assert.deepEqual(f.releases,[['plugins',1]]);
 }
});

test('a drag suppresses only one trailing source mouse click, leaving other icons and keyboard activation usable',()=>{
 const f=fixture(),plugin=f.buttons.get('plugins'),schedule=f.buttons.get('schedules');
 f.emit('pointerdown',plugin,{button:0,pointerId:1,clientY:150});
 f.emit('pointermove',plugin,{pointerId:1,clientY:100});
 f.emit('pointerup',plugin,{pointerId:1,clientY:100});
 assert.equal(f.emit('click',schedule).prevented,false);
 assert.equal(f.emit('click',plugin,{detail:0}).prevented,false);
 assert.equal(f.emit('click',plugin).prevented,true);
 assert.equal(f.emit('click',plugin).prevented,false);
 f.stop();
});

test('a new press clears drag suppression even when immediately clicking the same icon',()=>{
 const f=fixture(),plugin=f.buttons.get('plugins');
 f.emit('pointerdown',plugin,{button:0,pointerId:1,clientY:150});
 f.emit('pointermove',plugin,{pointerId:1,clientY:100});
 f.emit('pointerup',plugin,{pointerId:1,clientY:100});
 f.emit('pointerdown',plugin,{button:0,pointerId:1,clientY:150});
 f.emit('pointerup',plugin,{pointerId:1,clientY:150});
 assert.equal(f.emit('click',plugin).prevented,false);
 assert.deepEqual(f.captures,[['plugins',1]]);assert.deepEqual(f.releases,[['plugins',1]]);
 f.stop();
});

test('sub-threshold jitter never captures or suppresses normal activation, regardless of the move buttons flag',()=>{
 for(const move of [{clientY:155,buttons:1},{clientY:155,buttons:0}]){
  const f=fixture(),plugin=f.buttons.get('plugins');
  f.emit('pointerdown',plugin,{button:0,pointerId:1,clientY:150});
  assert.equal(f.emit('pointermove',plugin,{pointerId:1,...move}).prevented,false);
  f.emit('pointerup',plugin,{pointerId:1,clientY:move.clientY});
  assert.equal(f.emit('click',plugin).prevented,false);
  assert.deepEqual(f.captures,[]);assert.deepEqual(f.releases,[]);assert.deepEqual(f.writes,[]);f.stop();
 }
});

test('the real WKWebView zero-buttons move still drags using the tracked down/up sequence',()=>{
 const f=fixture(),plugin=f.buttons.get('plugins');
 assert.equal(f.documentListeners.size,0);assert.equal(f.windowListeners.size,0);
 f.emit('pointerdown',plugin,{button:0,pointerId:1,clientY:150});
 assert.equal(f.documentListeners.size,2);assert.equal(f.windowListeners.size,1);
 assert.equal(f.emit('pointermove',plugin,{pointerId:1,clientY:100,buttons:0}).prevented,true);
 assert.deepEqual(f.captures,[['plugins',1]]);
 const released=f.emitDocument('pointerup',plugin,{pointerId:1,clientY:100,buttons:0});
 assert.equal(released.prevented,true);
 assert.deepEqual(f.writes,[['home','plugins','schedules']]);
 assert.deepEqual(f.releases,[['plugins',1]]);
 assert.equal(f.documentListeners.size,0);assert.equal(f.windowListeners.size,0);
 assert.equal(f.emit('click',plugin).prevented,true);f.stop();
});

test('a release outside the sidebar clears an uncaptured press without touching normal clicks',()=>{
 const f=fixture(),plugin=f.buttons.get('plugins'),outside={closest:()=>null};
 f.emit('pointerdown',plugin,{button:0,pointerId:1,clientY:150});
 const released=f.emitDocument('pointerup',outside,{pointerId:1,clientY:400,buttons:0});
 assert.equal(released.prevented,false);assert.equal(released.stopped,false);
 assert.equal(f.documentListeners.size,0);assert.equal(f.windowListeners.size,0);
 assert.equal(f.emit('pointermove',plugin,{pointerId:1,clientY:100,buttons:0}).prevented,false);
 assert.equal(f.emit('click',plugin).prevented,false);
 assert.deepEqual(f.captures,[]);assert.deepEqual(f.releases,[]);assert.deepEqual(f.writes,[]);f.stop();
});

test('pending document listeners are temporary and clear on external cancel, blur, replacement press or unmount',()=>{
 for(const finish of ['cancel','blur','replace','unmount']){
  const f=fixture(),plugin=f.buttons.get('plugins'),schedule=f.buttons.get('schedules');
  f.emit('pointerdown',plugin,{button:0,pointerId:1,clientY:150});
  assert.equal(f.documentListeners.size,2);assert.equal(f.windowListeners.size,1);
  if(finish==='cancel')f.emitDocument('pointercancel',plugin,{pointerId:1});
  else if(finish==='blur')f.emitWindow('blur',null);
  else if(finish==='replace'){
   f.emit('pointerdown',schedule,{button:0,pointerId:2});
   assert.equal(f.documentListeners.size,2);assert.equal(f.windowListeners.size,1);
   f.emitDocument('pointerup',schedule,{pointerId:2});
  }else f.stop();
  assert.equal(f.documentListeners.size,0);assert.equal(f.windowListeners.size,0);
  assert.equal(f.emit('pointermove',plugin,{pointerId:1,clientY:100,buttons:0}).prevented,false);
  assert.deepEqual(f.captures,[]);assert.deepEqual(f.releases,[]);assert.deepEqual(f.writes,[]);
  if(finish!=='unmount')f.stop();
 }
});

test('window blur cancels a captured drag, releases capture and preserves the next deliberate click',()=>{
 const f=fixture(),plugin=f.buttons.get('plugins');
 f.emit('pointerdown',plugin,{button:0,pointerId:1,clientY:150});
 f.emit('pointermove',plugin,{pointerId:1,clientY:100,buttons:0});
 f.emitWindow('blur',null);
 assert.deepEqual(f.captures,[['plugins',1]]);assert.deepEqual(f.releases,[['plugins',1]]);
 assert.equal(f.documentListeners.size,0);assert.equal(f.windowListeners.size,0);
 assert.deepEqual(f.writes,[]);
 f.emit('pointerdown',plugin,{button:0,pointerId:1,clientY:150});
 f.emitDocument('pointerup',plugin,{pointerId:1,clientY:150,buttons:0});
 assert.equal(f.emit('click',plugin).prevented,false);
 assert.equal(f.documentListeners.size,0);assert.equal(f.windowListeners.size,0);f.stop();
});

test('a canceled drag suppresses only its source tail and never the next deliberate click',()=>{
 const f=fixture(),plugin=f.buttons.get('plugins'),schedule=f.buttons.get('schedules');
 f.emit('pointerdown',plugin,{button:0,pointerId:1,clientY:150});
 f.emit('pointermove',plugin,{pointerId:1,clientY:100});
 f.emit('pointercancel',plugin,{pointerId:1});
 assert.equal(f.emit('click',schedule).prevented,false);
 assert.equal(f.emit('click',plugin).prevented,true);
 assert.equal(f.emit('click',plugin).prevented,false);
 assert.deepEqual(f.writes,[]);assert.deepEqual(f.releases,[['plugins',1]]);f.stop();
});

test('HTML drag fallback also suppresses only one source tail and expires after 350 ms',()=>{
 const realNow=Date.now;let time=1000;
 Date.now=()=>time;
 try{
  const f=fixture(),plugin=f.buttons.get('plugins'),schedule=f.buttons.get('schedules');
  f.emit('dragstart',plugin);f.emit('dragend',plugin);
  assert.equal(f.emit('click',schedule).prevented,false);
  assert.equal(f.emit('click',plugin,{detail:0}).prevented,false);
  assert.equal(f.emit('click',plugin).prevented,true);
  assert.equal(f.emit('click',plugin).prevented,false);
  f.emit('dragstart',plugin);f.emit('dragend',plugin);time+=350;
  assert.equal(f.emit('click',plugin).prevented,false);
  assert.deepEqual(f.captures,[]);assert.deepEqual(f.releases,[]);f.stop();
 }finally{Date.now=realNow;}
});

test('blank rail opens customization while workspace area, account controls and editors keep their original menus',()=>{
 const f=fixture(),blank={closest:()=>null};
 f.emit('contextmenu',blank,{clientX:20,clientY:350});
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].id,null);
 for(const extra of [{clientX:80,clientY:350},{clientX:20,clientY:20}])assert.equal(f.emit('contextmenu',blank,extra).prevented,false);
 const account={closest:selector=>selector.startsWith('button')?{}:null};
 const input={closest:selector=>selector.startsWith('input')?{}:null};
 assert.equal(f.emit('contextmenu',account).prevented,false);
 assert.equal(f.emit('contextmenu',input).prevented,false);
 assert.equal(f.emit('keydown',blank,{key:'ContextMenu'}).prevented,false);
 assert.equal(f.requests.length,1);f.stop();
});

test('internal dragging persists icon order and suppresses the trailing navigation click only inside the Dock',()=>{
 const f=fixture(),plugin=f.buttons.get('plugins'),schedule=f.buttons.get('schedules'),transfer={setData(){}};
 f.emit('dragstart',plugin,{dataTransfer:transfer});
 assert.equal(transfer.effectAllowed,'move');
 assert.equal(f.emit('dragover',schedule,{dataTransfer:transfer}).prevented,true);
 f.emit('drop',schedule,{clientY:97});
 assert.deepEqual(f.writes,[['home','plugins','schedules']]);
 assert.equal(f.emit('click',plugin).prevented,true);
 assert.equal(f.emit('click',{closest:()=>null}).prevented,false);f.stop();
});

test('external drags and Home do not reorder, and dragging to Home keeps it first',()=>{
 const f=fixture(),home=f.buttons.get('home'),plugin=f.buttons.get('plugins');
 assert.equal(f.emit('drop',plugin).prevented,false);
 f.emit('dragstart',home);assert.equal(f.emit('dragover',plugin).prevented,false);
 f.emit('dragstart',plugin);f.emit('drop',home,{clientY:52});
 assert.deepEqual(f.writes,[['home','plugins','schedules']]);f.stop();
});

test('refused persistence reports the failure and all drag/menu listeners are released',()=>{
 const f=fixture();f.refuse();
 f.emit('dragstart',f.buttons.get('plugins'));
 f.emit('drop',f.buttons.get('schedules'),{clientY:97});
 assert.deepEqual(f.errors,['save refused']);assert.deepEqual(f.writes,[]);
 f.stop();assert.equal(f.listeners.size,0);
});
