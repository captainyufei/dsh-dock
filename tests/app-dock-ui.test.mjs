import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {AppDock,wireAppDockPointer} from '../src/app-dock-ui.js';

const h=React.createElement;
const Modal=props=>props.open?h('section',{role:'dialog','aria-label':props.title},props.children):null;
const Menu=props=>props.open?h('section',{role:'menu'},props.anchor,props.children):null;
const MenuItem=props=>h('button',{disabled:props.disabled,onClick:props.onSelect},props.children);
const initial=[{id:'home',label:'首页',pinned:true,active:true,recent:false},{id:'plugins',label:'插件',pinned:true,recent:true},{id:'schedules',label:'自动化任务',pinned:true,recent:false},{id:'chat',label:'聊天',pinned:false,recent:true},{id:'notes',label:'笔记',pinned:false,recent:false}];
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):(node?.children||[]).map(text).join('');
const button=(view,label)=>view.root.findAllByType('button').find(node=>node.props['aria-label']===label||text(node)===label);
const dockButton=(view,id)=>view.root.findByProps({'data-cgpt-app-button':id});
const cards=view=>view.root.findAllByProps({className:'cgpt-app-card'});
function fixture(patch={}){
 let snapshot={apps:initial,dock:initial.slice(0,4),libraryOpen:false,query:'',filter:'all',error:'',loadingId:null,canShowNativeMore:false,...patch};
 const listeners=new Set(),calls=[];
 const publish=patch=>{snapshot={...snapshot,...patch};for(const listener of listeners)listener();};
 const updateApps=apps=>publish({apps,dock:apps.filter(app=>app.pinned||app.recent)});
 const model={getSnapshot:()=>snapshot,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  openLibrary(){calls.push(['library:open']);publish({libraryOpen:true});},closeLibrary(){calls.push(['library:close']);publish({libraryOpen:false});},
  setQuery(query){calls.push(['query',query]);publish({query});},setFilter(filter){calls.push(['filter',filter]);publish({filter});},
  async open(id){calls.push(['open',id]);publish({libraryOpen:false});return true;},
  pin(id,pinned){calls.push(['pin',id,pinned]);updateApps(snapshot.apps.map(app=>app.id===id?{...app,pinned}:app));},
  move(id,delta){calls.push(['move',id,delta]);},place(id,target,after){calls.push(['place',id,target,after]);},
  dismissRecent(id){calls.push(['dismissRecent',id]);updateApps(snapshot.apps.map(app=>app.id===id?{...app,recent:false}:app));},
  async openPluginManager(){calls.push(['manage']);publish({libraryOpen:false});},
 };
 return {model,publish,calls,listeners};
}
async function mount(f,extras={}){
 let view,focuses=0;
 await act(async()=>{view=TestRenderer.create(h(AppDock,{model:f.model,Modal,Menu,MenuItem,...extras}),{createNodeMock:node=>node.type==='input'?{focus(){focuses++;}}:null});});
 return {view,focuses:()=>focuses};
}
const event=patch=>({preventDefault(){},stopPropagation(){},currentTarget:{focus(){},getBoundingClientRect:()=>({right:44,top:80,height:36})},clientX:30,clientY:90,...patch});

test('Dock distinguishes pinned and recent entries, marks only the current page and keeps the library launcher',async()=>{
 const f=fixture(),{view}=await mount(f);
 assert.equal(view.root.findByProps({className:'cgpt-app-dock'}).props['data-cgpt-app-dock'],'');
 assert.equal(dockButton(view,'home').props['aria-current'],'page');assert.equal(dockButton(view,'plugins').props['aria-current'],undefined);
 assert.equal(view.root.findAllByProps({role:'separator'}).length,1);assert.ok(button(view,'全部应用'));
 assert.equal(dockButton(view,'home').props.draggable,false);assert.equal(dockButton(view,'plugins').props.draggable,false);assert.equal(dockButton(view,'chat').props.draggable,false);
 assert.doesNotMatch(text(view.toJSON()),/正在运行|退出应用/);
 await act(async()=>view.unmount());assert.equal(f.listeners.size,0);
});

test('library uses native Modal lifecycle and its search receives autofocus',async()=>{
 const f=fixture(),{view}=await mount(f);assert.equal(view.root.findAllByProps({role:'dialog'}).length,0);
 await act(async()=>button(view,'全部应用').props.onClick());
 assert.equal(view.root.findByType(Modal).props.headless,true);assert.equal(view.root.findByType(Modal).props.shortcutModal,'dsh-dock.apps');
 assert.equal(view.root.findByType('input').props['data-modal-autofocus'],true);
 assert.equal(cards(view).length,5);assert.equal(button(view,'全部应用').props['aria-expanded'],true);
 await act(async()=>view.root.findByType(Modal).props.onClose());assert.equal(f.model.getSnapshot().libraryOpen,false);
 await act(async()=>view.unmount());
});

test('search and filters show only matching real applications and return focus after category changes',async()=>{
 const f=fixture({libraryOpen:true}),{view,focuses}=await mount(f);
 await act(async()=>button(view,'已固定').props.onClick());assert.equal(cards(view).length,3);assert.equal(focuses(),1);
 await act(async()=>button(view,'最近使用').props.onClick());assert.equal(cards(view).length,2);
 await act(async()=>view.root.findByType('input').props.onChange({target:{value:'聊'}}));assert.equal(cards(view).length,1);assert.ok(button(view,'打开 聊天'));
 await act(async()=>view.root.findByType('input').props.onChange({target:{value:'missing'}}));assert.equal(cards(view).length,0);assert.match(text(view.toJSON()),/没有找到这个应用/);
 await act(async()=>view.unmount());
});

test('pin controls alter preferences without opening an app and the fixed Home entry cannot be removed',async()=>{
 const f=fixture({libraryOpen:true}),{view}=await mount(f);
 assert.equal(button(view,'从 Dock 移除 首页'),undefined);
 await act(async()=>button(view,'固定到 Dock 笔记').props.onClick());assert.ok(dockButton(view,'notes'));assert.ok(button(view,'从 Dock 移除 笔记'));
 await act(async()=>button(view,'从 Dock 移除 笔记').props.onClick());
 assert.deepEqual(f.calls,[['pin','notes',true],['pin','notes',false]]);
 await act(async()=>view.unmount());
});

test('Dock and library launch through the model and pending launches block duplicate activation',async()=>{
 const f=fixture(),finishes=[];f.model.open=id=>{f.calls.push(['open',id]);return new Promise(resolve=>finishes.push(resolve));};
 const {view}=await mount(f);
 await act(async()=>{dockButton(view,'plugins').props.onClick();dockButton(view,'chat').props.onClick();});
 assert.deepEqual(f.calls,[['open','plugins']]);assert.equal(dockButton(view,'chat').props['aria-disabled'],true);
 await act(async()=>finishes[0](true));await act(async()=>f.publish({libraryOpen:true}));
 await act(async()=>button(view,'打开 聊天').props.onClick());assert.deepEqual(f.calls.at(-1),['open','chat']);
 await act(async()=>finishes[1](true));await act(async()=>view.unmount());
});

test('launch and preference errors remain visible and the model stays in charge of plugin management',async()=>{
 const f=fixture({libraryOpen:true});f.model.pin=()=>{throw new Error('storage refused');};f.model.open=()=>Promise.reject(new Error('page gone'));
 const {view}=await mount(f);
 await act(async()=>button(view,'固定到 Dock 笔记').props.onClick());assert.equal(text(view.root.findByProps({role:'alert'})),'storage refused');
 await act(async()=>button(view,'打开 聊天').props.onClick());assert.equal(text(view.root.findByProps({role:'alert'})),'page gone');
 await act(async()=>button(view,'管理插件 ↗').props.onClick());assert.deepEqual(f.calls,[['manage']]);
 await act(async()=>view.unmount());
});

test('right click and Shift+F10 open native app actions for the captured app',async()=>{
 const f=fixture(),{view}=await mount(f);let consumed=0;
 await act(async()=>dockButton(view,'plugins').props.onContextMenu(event({preventDefault(){consumed++;}})));
 assert.equal(consumed,1);assert.ok(button(view,'打开 插件'));assert.ok(button(view,'从 Dock 移除'));assert.equal(button(view,'上移').props.disabled,true);
 await act(async()=>button(view,'下移').props.onClick());assert.deepEqual(f.calls,[['move','plugins',1]]);
 await act(async()=>dockButton(view,'chat').props.onKeyDown(event({key:'F10',shiftKey:true})));
 assert.ok(button(view,'固定到 Dock'));assert.ok(button(view,'不再显示在最近使用'));
 await act(async()=>button(view,'不再显示在最近使用').props.onClick());assert.deepEqual(f.calls.at(-1),['dismissRecent','chat']);
 assert.equal(view.root.findAllByProps({'data-cgpt-app-button':'chat'}).length,0);
 await act(async()=>view.unmount());
});

test('removed menu targets close automatically; missing Menu capability opens the library',async()=>{
 const f=fixture(),{view}=await mount(f);
 await act(async()=>dockButton(view,'plugins').props.onContextMenu(event()));
 await act(async()=>f.publish({apps:initial.filter(app=>app.id!=='plugins'),dock:initial.filter(app=>app.id!=='plugins'&&(app.pinned||app.recent))}));
 assert.equal(view.root.findAllByProps({role:'menu'}).length,0);await act(async()=>view.unmount());
 const g=fixture(),other=await mount(g,{Menu:null,MenuItem:null});
 await act(async()=>dockButton(other.view,'home').props.onContextMenu(event()));assert.equal(g.model.getSnapshot().libraryOpen,true);
 await act(async()=>other.view.unmount());
});

test('artwork failure falls back to a readable symbol and a new image URL is retried',async()=>{
 const apps=initial.map(app=>app.id==='chat'?{...app,iconUrl:'data:image/png;base64,abc'}:app),f=fixture({apps,dock:apps.slice(0,4)}),{view}=await mount(f);
 const artwork=dockButton(view,'chat');assert.equal(artwork.findByType('img').props.alt,'');
 await act(async()=>artwork.findByType('img').props.onError());assert.equal(artwork.findAllByType('img').length,0);assert.equal(text(artwork),'聊');
 const next=apps.map(app=>app.id==='chat'?{...app,iconUrl:'data:image/png;base64,def'}:app);
 await act(async()=>f.publish({apps:next,dock:next.slice(0,4)}));assert.equal(artwork.findByType('img').props.src,'data:image/png;base64,def');
 await act(async()=>view.unmount());
});

test('portaled library and Dock events do not bubble into the native Home button',async()=>{
 const f=fixture({libraryOpen:true}),{view}=await mount(f);let calls=0;
 for(const className of ['cgpt-app-dock','cgpt-app-library']){
  const root=view.root.findByProps({className});
  for(const name of ['onClick','onPointerDown','onContextMenu'])root.props[name]({stopPropagation(){calls++;}});
 }
 assert.equal(calls,6);assert.deepEqual(f.calls,[]);await act(async()=>view.unmount());
});

test('closing and reopening the library clears pending UI and an older completion cannot release the new operation',async()=>{
 const f=fixture({libraryOpen:true}),finishes=[];
 f.model.open=id=>{f.calls.push(['open',id]);return new Promise(resolve=>finishes.push(resolve));};
 const {view}=await mount(f);
 await act(async()=>button(view,'打开 聊天').props.onClick());assert.equal(button(view,'打开 笔记').props['aria-disabled'],true);
 await act(async()=>f.model.closeLibrary());await act(async()=>f.model.openLibrary());assert.equal(button(view,'打开 笔记').props['aria-disabled'],undefined);
 await act(async()=>button(view,'打开 笔记').props.onClick());assert.equal(f.calls.filter(c=>c[0]==='open').length,2);
 await act(async()=>finishes[0](true));assert.equal(button(view,'打开 聊天').props['aria-disabled'],true);
 await act(async()=>finishes[1](true));assert.equal(button(view,'打开 聊天').props['aria-disabled'],undefined);
 await act(async()=>view.unmount());
});

function pointerFixture(){
 const rootListeners=new Map(),documentListeners=new Map(),viewListeners=new Map(),placements=[],errors=[],captures=[],released=[];
 const target=map=>({addEventListener(name,fn,capture){assert.equal(capture,true);map.set(name,fn);},removeEventListener(name,fn,capture){assert.equal(capture,true);assert.equal(map.get(name),fn);map.delete(name);}});
 let dock=initial.slice(0,4),loadingId=null,failure=null;
 const buttons=new Map(dock.map((app,index)=>{
  const attributes=new Map([['data-cgpt-app-button',app.id]]);
  const button={inside:true,getAttribute:key=>attributes.get(key)??null,setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key),
   closest:selector=>selector==='[data-cgpt-app-button]'?button:null,getBoundingClientRect:()=>({left:8,right:44,top:50+46*index,height:36}),
   setPointerCapture:id=>captures.push([app.id,id]),releasePointerCapture:id=>released.push([app.id,id])};
  return [app.id,button];
 }));
 const gap={inside:true,closest:()=>null};
 const doc={...target(documentListeners),defaultView:target(viewListeners),elementFromPoint:(x,y)=>[...buttons.values()].find(button=>{
  const rect=button.getBoundingClientRect();return button.inside&&x>=rect.left&&x<rect.right&&y>=rect.top&&y<rect.top+rect.height;
 })||(x>=8&&x<44&&y>=50&&y<232?gap:null)};
 const root={...target(rootListeners),ownerDocument:doc,contains:button=>Boolean(button?.inside),querySelectorAll:()=>[...buttons.values()].filter(button=>button.inside)};
 const model={getSnapshot:()=>({dock,loadingId}),place(...args){if(failure)throw failure;placements.push(args);}};
 const dispose=wireAppDockPointer(root,{model,onError:error=>errors.push(error.message)});
 const emit=(map,name,button,extra={})=>{
  const e={target:button,pointerId:1,button:0,detail:1,buttons:1,clientX:25,clientY:110,prevented:false,stopped:false,
   preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=true;},...extra};
  map.get(name)?.(e);return e;
 };
 return {rootListeners,documentListeners,viewListeners,buttons,placements,errors,captures,released,dispose,
  root:(...args)=>emit(rootListeners,...args),document:(...args)=>emit(documentListeners,...args),view:(...args)=>emit(viewListeners,...args),
  busy:value=>{loadingId=value;},unpin:id=>{dock=dock.map(app=>app.id===id?{...app,pinned:false}:app);},fail:()=>{failure=new Error('save refused');}};
}

test('pointer drag places a pinned application without HTML drag events and uses the actual drop half',()=>{
 const f=pointerFixture(),from=f.buttons.get('plugins'),to=f.buttons.get('schedules');
 assert.equal(f.root('pointerdown',from,{clientY:110}).prevented,false);assert.equal(f.documentListeners.size,5);assert.equal(f.viewListeners.size,1);
 assert.equal(f.document('pointermove',from,{clientY:114}).prevented,false);assert.deepEqual(f.captures,[]);
 assert.equal(f.document('pointermove',from,{clientY:169,buttons:0}).prevented,true);
 assert.equal(from.getAttribute('data-app-dragging'),'');assert.equal(to.getAttribute('data-app-drop'),'after');
 assert.deepEqual(f.captures,[['plugins',1]]);
 assert.equal(f.document('pointerup',from,{clientY:169,buttons:0}).prevented,true);
 assert.deepEqual(f.placements,[['plugins','schedules',true]]);assert.deepEqual(f.released,[['plugins',1]]);
 assert.equal(from.getAttribute('data-app-dragging'),null);assert.equal(to.getAttribute('data-app-drop'),null);
 assert.equal(f.documentListeners.size,0);assert.equal(f.viewListeners.size,0);f.dispose();assert.equal(f.rootListeners.size,0);
});

test('clicks, small pointer jitter and external moves never reorder or earn pointer capture',()=>{
 const f=pointerFixture(),from=f.buttons.get('plugins');
 f.document('pointermove',from,{clientY:160});f.document('pointerup',from,{clientY:160});
 f.root('pointerdown',from,{clientY:110});f.document('pointermove',from,{clientY:113,buttons:0});f.document('pointerup',from,{clientY:113});
 assert.equal(f.root('click',from).prevented,false);assert.deepEqual(f.captures,[]);assert.deepEqual(f.released,[]);assert.deepEqual(f.placements,[]);f.dispose();
});

test('releasing on the insertion gap between pinned icons places the app and clears its marker',()=>{
 const f=pointerFixture(),from=f.buttons.get('schedules'),to=f.buttons.get('plugins');
 f.root('pointerdown',from,{clientY:160});
 f.document('pointermove',from,{clientY:94});
 assert.equal(to.getAttribute('data-app-drop'),'before');
 f.document('pointerup',from,{clientY:94});
 assert.deepEqual(f.placements,[['schedules','plugins',false]]);
 assert.equal(to.getAttribute('data-app-drop'),null);
 assert.equal(from.getAttribute('data-app-dragging'),null);
 assert.equal(f.documentListeners.size,0);assert.equal(f.viewListeners.size,0);f.dispose();
});

test('the trailing insertion edge works while dropping in recent apps or outside the Dock stays canceled',()=>{
 for(const [x,y,wanted] of [[25,180,[['plugins','schedules',true]]],[25,184,[]],[25,200,[]],[100,180,[]]]){
  const f=pointerFixture(),from=f.buttons.get('plugins');
  f.root('pointerdown',from,{clientY:110});
  f.document('pointermove',from,{clientX:x,clientY:y});
  f.document('pointerup',from,{clientX:x,clientY:y});
  assert.deepEqual(f.placements,wanted,`drop at ${x},${y}`);f.dispose();
 }
});

test('drag cancellation, lost capture, blur and unmount release every listener and never reorder',()=>{
 for(const reason of ['pointercancel','lostpointercapture','blur','unmount']){
  const f=pointerFixture(),from=f.buttons.get('plugins'),to=f.buttons.get('schedules');
  f.root('pointerdown',from);f.document('pointermove',from,{clientY:149});
  assert.equal(to.getAttribute('data-app-drop'),'before');
  if(reason==='blur')f.view('blur',null,{pointerId:undefined});else if(reason==='unmount')f.dispose();else f.document(reason,from);
  assert.deepEqual(f.placements,[]);assert.deepEqual(f.released,[['plugins',1]]);
  assert.equal(f.documentListeners.size,0);assert.equal(f.viewListeners.size,0);assert.equal(to.getAttribute('data-app-drop'),null);assert.equal(from.getAttribute('data-app-dragging'),null);
  if(reason!=='unmount')f.dispose();
 }
});

test('only the trailing source mouse click is suppressed and a new deliberate press resets suppression',()=>{
 const f=pointerFixture(),from=f.buttons.get('plugins'),to=f.buttons.get('schedules');
 f.root('pointerdown',from);f.document('pointermove',from,{clientY:169});f.document('pointerup',from,{clientY:169});
 assert.equal(f.root('click',to).prevented,false);assert.equal(f.root('click',from,{detail:0}).prevented,false);
 assert.equal(f.root('click',from).prevented,true);assert.equal(f.root('click',from).prevented,false);
 f.root('pointerdown',from);f.document('pointermove',from,{clientY:169});f.document('pointerup',from,{clientY:169});
 f.root('pointerdown',from);f.document('pointerup',from);assert.equal(f.root('click',from).prevented,false);f.dispose();
});

test('Home, recent apps, non-primary pointers and loading state cannot start reorder',()=>{
 const f=pointerFixture();
 for(const [id,extra] of [['home',{}],['chat',{}],['plugins',{button:2}],['plugins',{isPrimary:false}]]){
  f.root('pointerdown',f.buttons.get(id),extra);assert.equal(f.documentListeners.size,0);
 }
 f.busy('notes');f.root('pointerdown',f.buttons.get('plugins'));assert.equal(f.documentListeners.size,0);assert.deepEqual(f.placements,[]);f.dispose();
});

test('release outside, disappearing source and unpinned targets do not persist a move',()=>{
 for(const reason of ['outside','removed','unpin-source','unpin-target']){
  const f=pointerFixture(),from=f.buttons.get('plugins');f.root('pointerdown',from);f.document('pointermove',from,{clientY:169});
  if(reason==='removed')from.inside=false;if(reason==='unpin-source')f.unpin('plugins');if(reason==='unpin-target')f.unpin('schedules');
  f.document('pointerup',from,{clientY:reason==='outside'?900:169});assert.deepEqual(f.placements,[]);assert.equal(f.documentListeners.size,0);f.dispose();
 }
});

test('another pointer cannot finish the tracked drag and persistence errors clean up without changing navigation',()=>{
 const f=pointerFixture(),from=f.buttons.get('plugins');f.fail();f.root('pointerdown',from);
 f.document('pointermove',from,{pointerId:2,clientY:169});assert.deepEqual(f.captures,[]);
 f.document('pointercancel',from,{pointerId:2});assert.equal(f.documentListeners.size,5);
 f.document('pointermove',from,{clientY:169});f.document('pointerup',from,{pointerId:2,clientY:169});assert.deepEqual(f.errors,[]);
 f.document('pointerup',from,{clientY:169});assert.deepEqual(f.errors,['save refused']);assert.deepEqual(f.placements,[]);assert.equal(f.documentListeners.size,0);f.dispose();
});


test('Escape cancels an active reorder and a delayed release cannot launch the app',t=>{
 const f=pointerFixture(),from=f.buttons.get('plugins'),to=f.buttons.get('schedules');
 f.root('pointerdown',from);f.document('pointermove',from,{clientY:169});
 assert.equal(to.getAttribute('data-app-drop'),'after');
 assert.equal(f.document('keydown',from,{key:'Escape',pointerId:undefined}).prevented,true);
 assert.equal(to.getAttribute('data-app-drop'),null);assert.equal(from.getAttribute('data-app-dragging'),null);
 const later=Date.now()+1000;t.mock.method(Date,'now',()=>later);
 f.document('pointerup',from,{clientY:169});assert.deepEqual(f.placements,[]);
 assert.equal(f.root('click',from).prevented,true);assert.equal(f.documentListeners.size,0);
 f.root('pointerdown',from);f.document('pointerup',from);assert.equal(f.root('click',from).prevented,false);
 f.dispose();
});
