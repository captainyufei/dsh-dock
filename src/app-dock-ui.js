import React from 'react';
import {HomeNotificationBadge} from './notification-ui.js';

const h=React.createElement;
const stop=event=>event.stopPropagation();
const PATHS={
 home:'m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9',
 plugins:'M14.5 17.1A8 8 0 1 1 18 10c0 3.6-3.3 4.8-5.5 2.5M6.4 10.6l4.2-4.2 2.1 2.1a3 3 0 0 1-4.2 4.2ZM5 9.2l1.4 1.4M9.2 5l1.4 1.4',
 schedules:'M17.6 10a7.6 7.6 0 1 1-15.2 0 7.6 7.6 0 0 1 15.2 0ZM10 5.5V10l-2.7 2',
 apps:'M4 4h3v3H4V4Zm6.5 0h3v3h-3V4ZM17 4h3v3h-3V4ZM4 10.5h3v3H4v-3Zm6.5 0h3v3h-3v-3Zm6.5 0h3v3h-3v-3ZM4 17h3v3H4v-3Zm6.5 0h3v3h-3v-3Zm6.5 0h3v3h-3v-3Z',
 search:'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.7-1.8L20 20',
 close:'m6 6 12 12M18 6 6 18',
 pin:'m8 3 8 0-1 6 4 4H5l4-4-1-6Zm4 10v8',
};
function Glyph({name,size=18}){
 const legacy=name==='plugins'||name==='schedules';
 return h('svg',{width:size,height:size,viewBox:legacy?'0 0 20 20':'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:legacy?1.5:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:PATHS[name]||PATHS.apps}));
}
function AppArtwork({app}){
 const [failed,setFailed]=React.useState(null);
 const label=Array.from(app.label||'?')[0];
 const url=!['plugins','schedules'].includes(app.id)&&app.iconUrl&&failed!==app.iconUrl?app.iconUrl:null;
 const monochrome=url?.startsWith('data:image/svg+xml,');
 const source=url&&h('img',{src:url,alt:'',draggable:false,onError:()=>setFailed(app.iconUrl)});
 return h('span',{className:'cgpt-app-artwork','aria-hidden':true},
  url?monochrome?h('span',{className:'cgpt-app-symbol',style:{maskImage:'url('+JSON.stringify(url)+')',WebkitMaskImage:'url('+JSON.stringify(url)+')'}},source):source:PATHS[app.id]?h(Glyph,{name:app.id,size:20}):h('span',{className:'cgpt-app-letter'},label),
 );
}

/** Track the pointer directly: native Electron gestures need not emit HTML drag events. */
export function wireAppDockPointer(root,{model,onError=()=>{}}){
 if(!root?.addEventListener)return()=>{};
 const document=root.ownerDocument,view=document?.defaultView;
 let pointer=null,dropMark=null,suppressed=null,releases=[];
 const buttonOf=target=>target?.closest?.('[data-cgpt-app-button]');
 const idOf=button=>button?.getAttribute?.('data-cgpt-app-button');
 const pinned=id=>model.getSnapshot().dock.some(app=>app.id===id&&app.pinned);
 const hit=(x,y)=>{
  const element=document?.elementFromPoint?.(x,y),button=buttonOf(element);
  if(!element||!root.contains(element))return null;
  if(button)return pinned(idOf(button))?button:null;
  // The insertion line is painted just outside a button, and normal spacing
  // belongs to the group/scrollport. Resolve those owned gaps geometrically
  // instead of making users release precisely on another icon's hit box.
  const targets=Array.from(root.querySelectorAll?.('[data-cgpt-app-button]')||[])
   .filter(node=>pinned(idOf(node)))
   .map(node=>({node,rect:node.getBoundingClientRect()}))
   .filter(({rect})=>[rect.left,rect.right,rect.top,rect.height].every(Number.isFinite)&&rect.right>rect.left&&rect.height>0);
  if(!targets.length||x<Math.min(...targets.map(({rect})=>rect.left))||x>=Math.max(...targets.map(({rect})=>rect.right)))return null;
  const top=Math.min(...targets.map(({rect})=>rect.top)),bottom=Math.max(...targets.map(({rect})=>rect.top+rect.height));
  if(y<top-4||y>bottom+4)return null;
  const distance=({rect})=>Math.max(rect.top-y,y-rect.top-rect.height,0);
  return targets.reduce((nearest,target)=>distance(target)<=distance(nearest)?target:nearest).node;
 };
 function clear(){
  for(const release of releases.splice(0))release();
  dropMark?.removeAttribute('data-app-drop');dropMark=null;
  const previous=pointer;pointer=null;
  if(previous){
   previous.button.removeAttribute('data-app-dragging');
   if(previous.captured)try{previous.button.releasePointerCapture?.(previous.pointerId);}catch{}
  }
 }
 const suppress=id=>{suppressed={id,until:Date.now()+350};};
 function cancel(event){
  if(pointer&&event?.pointerId!==undefined&&event.pointerId!==pointer.pointerId)return;
  if(pointer?.active)suppress(pointer.id);
  clear();
 }
 function key(event){
  if(event.key!=='Escape'||!pointer)return;
  const id=pointer.active?pointer.id:null;
  event.preventDefault();event.stopPropagation();cancel();
  // Escape may precede release by an arbitrary interval. A fresh press resets
  // suppression; the canceled gesture's eventual click must never launch.
  if(id)suppressed={id,until:Infinity};
 }
 function move(event){
  if(!pointer||event.pointerId!==pointer.pointerId)return;
  if(!root.contains(pointer.button)||!pinned(pointer.id)){cancel();return;}
  // Track down/up, not buttons: native macOS moves can report buttons=0.
  if(!pointer.active&&Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)<6)return;
  if(!pointer.active){
   pointer.active=true;
   try{pointer.button.setPointerCapture?.(pointer.pointerId);pointer.captured=typeof pointer.button.setPointerCapture==='function';}catch{}
  }
  pointer.button.setAttribute('data-app-dragging','');
  event.preventDefault();event.stopPropagation();
  dropMark?.removeAttribute('data-app-drop');dropMark=null;
  const target=hit(event.clientX,event.clientY);
  if(target&&idOf(target)!==pointer.id){
   const rect=target.getBoundingClientRect();
   target.setAttribute('data-app-drop',event.clientY<rect.top+rect.height/2?'before':'after');dropMark=target;
  }
 }
 function up(event){
  if(!pointer||event.pointerId!==pointer.pointerId)return;
  const {id,active,button}=pointer;
  const target=active?hit(event.clientX,event.clientY):null;
  const valid=root.contains(button)&&pinned(id);
  clear();
  if(!active)return;
  suppress(id);event.preventDefault();event.stopPropagation();
  if(!valid||!target||id===idOf(target))return;
  const rect=target.getBoundingClientRect();
  try{model.place(id,idOf(target),event.clientY>=rect.top+rect.height/2);}catch(error){onError(error);}
 }
 function down(event){
  if(event.button!==0||event.isPrimary===false)return;
  suppressed=null;clear();
  const button=buttonOf(event.target),id=idOf(button);
  if(!button||!root.contains(button)||id==='home'||!pinned(id)||model.getSnapshot().loadingId!=null)return;
  pointer={id,button,pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false,captured:false};
  for(const [target,name,handler] of [[document,'pointermove',move],[document,'pointerup',up],[document,'pointercancel',cancel],[document,'lostpointercapture',cancel],[document,'keydown',key],[view,'blur',cancel]]){
   if(!target?.addEventListener)continue;
   target.addEventListener(name,handler,true);releases.push(()=>target.removeEventListener(name,handler,true));
  }
 }
 function click(event){
  if(!suppressed)return;
  if(Date.now()>=suppressed.until){suppressed=null;return;}
  const button=buttonOf(event.target);
  if(event.detail===0||!root.contains(button)||idOf(button)!==suppressed.id)return;
  suppressed=null;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
 }
 root.addEventListener('pointerdown',down,true);root.addEventListener('click',click,true);
 return()=>{clear();suppressed=null;root.removeEventListener('pointerdown',down,true);root.removeEventListener('click',click,true);};
}

/** Pure presentation over real Host app entries. No plugin component is mounted twice. */
export function AppDock({model,notificationModel,Modal,Menu,MenuItem}){
 const snapshot=React.useSyncExternalStore(model.subscribe,model.getSnapshot,model.getSnapshot);
 const [menu,setMenu]=React.useState(null),[error,setError]=React.useState(''),[pendingId,setPendingId]=React.useState(null);
 const dockRef=React.useRef(null);
 const operation=React.useRef(null),alive=React.useRef(true),search=React.useRef(null);
 const previousLibrary=React.useRef(snapshot.libraryOpen);
 React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;operation.current=null;};},[model]);
 React.useLayoutEffect(()=>wireAppDockPointer(dockRef.current,{model,onError:reason=>setError(reason?.message||'无法保存应用顺序，请重试。')}),[model]);
 React.useLayoutEffect(()=>{
  if(previousLibrary.current&&!snapshot.libraryOpen){operation.current=null;setPendingId(null);setMenu(null);}
  previousLibrary.current=snapshot.libraryOpen;
 },[snapshot.libraryOpen]);
 React.useEffect(()=>{if(menu&&!snapshot.apps.some(app=>app.id===menu.id))setMenu(null);},[menu,snapshot.apps]);
 const busy=snapshot.loadingId!=null||pendingId!==null;
 const appError=error||snapshot.error;
 const pinned=snapshot.dock.filter(app=>app.pinned),recent=snapshot.dock.filter(app=>!app.pinned);
 const query=(snapshot.query||'').trim().toLocaleLowerCase();
 const shown=snapshot.apps.filter(app=>(snapshot.filter!=='pinned'||app.pinned)&&(snapshot.filter!=='recent'||app.recent)&&(!query||app.label.toLocaleLowerCase().includes(query)));
 const selected=menu&&snapshot.apps.find(app=>app.id===menu.id);
 const pinnedOrder=snapshot.dock.filter(app=>app.pinned).map(app=>app.id),selectedIndex=selected?pinnedOrder.indexOf(selected.id):-1;
 async function run(action,id){
  if(busy||operation.current)return;
  const current={id};operation.current=current;setPendingId(id);setError('');setMenu(null);
  try{await action();}catch(reason){if(alive.current&&operation.current===current)setError(reason?.message||'暂时无法打开，请重试。');}
  finally{if(alive.current&&operation.current===current){operation.current=null;setPendingId(null);}}
 }
 function change(action){
  if(busy)return;
  setError('');
  try{action();setMenu(null);}catch(reason){setError(reason?.message||'无法保存应用栏设置，请重试。');}
 }
 function openMenu(event,app,keyboard=false){
  event.preventDefault();event.stopPropagation();
  if(busy)return;
  if(!Menu||!MenuItem){model.openLibrary();return;}
  event.currentTarget.focus?.({preventScroll:true});
  const rect=event.currentTarget.getBoundingClientRect?.();
  setMenu({id:app.id,x:keyboard?(rect?.right||0)+6:event.clientX,y:keyboard?rect?.top||0:event.clientY});
 }
 function menuKey(event,app){if(event.key==='ContextMenu'||(event.key==='F10'&&event.shiftKey))openMenu(event,app,true);}
 function dockButton(app){
  return h('button',{
   key:app.id,type:'button',className:'cgpt-app-dock-button','data-cgpt-app-button':app.id,
   'data-app-pinned':app.pinned?'':undefined,'aria-label':app.label,title:app.label+(app.active?' · 当前页面':''),
   'aria-current':app.active?'page':undefined,'aria-disabled':busy||undefined,draggable:false,
   onClick:()=>void run(()=>model.open(app.id),app.id),onContextMenu:event=>openMenu(event,app),onKeyDown:event=>menuKey(event,app),
  },h(AppArtwork,{app}),app.id==='home'&&notificationModel&&h(HomeNotificationBadge,{model:notificationModel}),
   (pendingId===app.id||snapshot.loadingId===app.id)&&h('span',{className:'cgpt-app-opening','aria-hidden':true}));
 }
 const closeLibrary=()=>{setError('');model.closeLibrary();};
 return h('div',{ref:dockRef,className:'cgpt-app-dock','data-cgpt-app-dock':'',onClick:stop,onPointerDown:stop,onContextMenu:stop},
  h('div',{className:'cgpt-app-dock-scroll','aria-label':'应用 Dock'},
   h('div',{className:'cgpt-app-dock-group','aria-label':'固定应用'},pinned.map(dockButton)),
   recent.length>0&&h(React.Fragment,null,pinned.length>0&&h('div',{className:'cgpt-app-dock-divider',role:'separator'}),h('div',{className:'cgpt-app-dock-group','aria-label':'最近使用的应用'},recent.map(dockButton))),
  ),
  h('button',{type:'button',className:'cgpt-app-library-button','aria-label':'全部应用',title:'全部应用','aria-expanded':snapshot.libraryOpen,onClick:()=>{setError('');model.openLibrary();}},h(Glyph,{name:'apps',size:21})),
  appError&&!snapshot.libraryOpen&&h('div',{className:'cgpt-app-toast',role:'alert'},String(appError),h('button',{type:'button','aria-label':'查看应用详情',onClick:()=>model.openLibrary()},'查看')),
  selected&&Menu&&MenuItem&&h(Menu,{
   open:true,portal:true,autoFocus:true,onClose:()=>setMenu(null),className:'cgpt-app-context',listClassName:'cgpt-app-context',
   anchorPoint:{x:menu.x,y:menu.y},contextual:true,
   getAnchorRect:()=>({left:menu.x,right:menu.x,top:menu.y,bottom:menu.y,width:0,height:0}),
   anchor:h('button',{type:'button',tabIndex:-1,'aria-hidden':true,className:'cgpt-app-context-anchor',style:{left:menu.x,top:menu.y}}),
  },h(MenuItem,{onSelect:()=>void run(()=>model.open(selected.id),selected.id)},'打开 '+selected.label),
   selected.id!=='home'&&h(MenuItem,{onSelect:()=>change(()=>model.pin(selected.id,!selected.pinned))},selected.pinned?'从 Dock 移除':'固定到 Dock'),
   selected.pinned&&selected.id!=='home'&&h(React.Fragment,null,
    h(MenuItem,{disabled:selectedIndex<=1,onSelect:()=>change(()=>model.move(selected.id,-1))},'上移'),
    h(MenuItem,{disabled:selectedIndex===pinnedOrder.length-1,onSelect:()=>change(()=>model.move(selected.id,1))},'下移')),
   !selected.pinned&&selected.recent&&h(MenuItem,{onSelect:()=>change(()=>model.dismissRecent(selected.id))},'不再显示在最近使用'),
   h(MenuItem,{onSelect:()=>{setMenu(null);model.openLibrary();}},'全部应用…'),
  ),
  h(Modal,{open:snapshot.libraryOpen,title:'应用',headless:true,onClose:closeLibrary,shortcutModal:'dsh-dock.apps',className:'cgpt-app-library-modal',contentClassName:'cgpt-app-library-content'},
   h('div',{className:'cgpt-app-library',onClick:stop,onPointerDown:stop,onContextMenu:stop},
    h('header',{className:'cgpt-app-library-header'},h('div',null,h('h2',null,'应用'),h('p',null,'你的插件与工具，都在这里。')),
     h('button',{type:'button',className:'cgpt-app-close','aria-label':'关闭应用总览',onClick:closeLibrary},h(Glyph,{name:'close'}))),
    h('div',{className:'cgpt-app-search'},h(Glyph,{name:'search'}),h('input',{ref:search,type:'search',value:snapshot.query||'',placeholder:'搜索应用','aria-label':'搜索应用','data-modal-autofocus':true,autoComplete:'off',spellCheck:false,onChange:event=>model.setQuery(event.target.value)})),
    h('div',{className:'cgpt-app-filters',role:'group','aria-label':'应用范围'},[['all','全部'],['pinned','已固定'],['recent','最近使用']].map(([id,label])=>h('button',{key:id,type:'button','aria-pressed':snapshot.filter===id,onClick:()=>{model.setFilter(id);search.current?.focus();}},label))),
    h('div',{className:'cgpt-app-library-body','aria-busy':busy},
     appError&&h('p',{className:'cgpt-app-error',role:'alert'},String(appError)),
     shown.length>0?h('ul',{className:'cgpt-app-grid','aria-label':'应用列表'},shown.map(app=>h('li',{key:app.id,className:'cgpt-app-card','data-app-active':app.active?'':undefined},
      h('button',{type:'button',className:'cgpt-app-launch','aria-label':'打开 '+app.label,'aria-current':app.active?'page':undefined,'aria-disabled':busy||undefined,onClick:()=>void run(()=>model.open(app.id),app.id),onContextMenu:event=>openMenu(event,app),onKeyDown:event=>menuKey(event,app)},
       h(AppArtwork,{app}),h('span',{className:'cgpt-app-label'},app.label),h('span',{className:'cgpt-app-status'},pendingId===app.id||snapshot.loadingId===app.id?'正在打开…':app.active?'当前页面':app.recent?'最近使用':'打开应用')),
      app.id==='home'?h('span',{className:'cgpt-app-fixed-note'},'固定入口'):h('button',{type:'button',className:'cgpt-app-pin','aria-label':(app.pinned?'从 Dock 移除 ':'固定到 Dock ')+app.label,'aria-pressed':app.pinned,disabled:busy,onClick:()=>change(()=>model.pin(app.id,!app.pinned))},h(Glyph,{name:'pin',size:13}),app.pinned?'已固定':'固定'),
     ))):h('div',{className:'cgpt-app-empty',role:'status'},h(Glyph,{name:'apps',size:30}),h('p',null,query?'没有找到这个应用':snapshot.filter==='recent'?'打开过的应用会出现在这里':snapshot.filter==='pinned'?'将常用应用固定到 Dock':'暂无可用的应用入口')),
    ),
    h('footer',{className:'cgpt-app-library-footer'},h('span',null,shown.length+' 个应用'),h('button',{type:'button',disabled:busy,onClick:()=>void run(()=>model.openPluginManager(),'plugins')},'管理插件',h('span',{'aria-hidden':true},' ↗'))),
   )),
 );
}
