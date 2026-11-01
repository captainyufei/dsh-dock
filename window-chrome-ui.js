import React from 'react';
import {createPortal} from 'react-dom';
import {mountWindowChrome} from './window-chrome-host.js';
import {createWindowChromeModel} from './window-chrome-model.js';

const h=React.createElement;
const stop=event=>event.stopPropagation();
function PlusIcon(){return h('svg',{width:18,height:18,viewBox:'0 0 20 20',fill:'none',stroke:'currentColor',strokeWidth:1.35,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('rect',{x:3,y:3,width:14,height:14,rx:2.5}),h('path',{d:'M10 6.5v7M6.5 10h7'}));}
function CollapseIcon(){return h('svg',{width:18,height:18,viewBox:'0 0 20 20',fill:'none',stroke:'currentColor',strokeWidth:1.35,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('rect',{x:3,y:3,width:14,height:14,rx:2.5}),h('path',{d:'M12 3v14'}));}
function ExpandIcon(){return h('svg',{width:16,height:16,viewBox:'0 0 20 20',fill:'none',stroke:'currentColor',strokeWidth:1.4,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:'M3.5 8V3.5H8M12 3.5h4.5V8M16.5 12v4.5H12M8 16.5H3.5V12'}));}

export function WindowChromeToolbar({model,Menu,MenuItem,Modal}){
 const snapshot=React.useSyncExternalStore(model.subscribe,model.getSnapshot,model.getSnapshot);
 const [open,setOpen]=React.useState(false),[picker,setPicker]=React.useState(null),[query,setQuery]=React.useState(''),[notice,setNotice]=React.useState(null);
 const [direction,setDirection]=React.useState(null);
 const alive=React.useRef(true);
 const action=React.useRef(null),scope=React.useRef({model,id:snapshot.context?.id??null});
 const contextId=snapshot.context?.id??null;
 if(scope.current.model!==model||scope.current.id!==contextId){
  const pending=action.current;
  if(pending&&!pending.invalid&&pending.model===model&&pending.target===contextId&&!pending.switched&&pending.from!==contextId)pending.switched=true;
  else if(pending)pending.invalid=true;
  scope.current={model,id:contextId};
 }
 React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 React.useEffect(()=>{if(!notice||notice.error)return;const timer=setTimeout(()=>setNotice(null),4500);return()=>clearTimeout(timer);},[notice]);
 React.useEffect(()=>{setOpen(false);setPicker(null);},[snapshot.expanded,snapshot.hasTabs,snapshot.canExpand,contextId,model]);
 const closeMenu=React.useCallback(()=>setOpen(false),[]);
 const closePicker=React.useCallback(()=>setPicker(null),[]);
 function begin(target=contextId){const ticket={model,target,from:contextId,switched:false,invalid:false};action.current=ticket;return ticket;}
 const current=ticket=>alive.current&&action.current===ticket&&!ticket.invalid;
 async function run(fullscreen,sessionId){
  const ticket=begin(sessionId??contextId);
  setOpen(false);setPicker(null);setNotice(null);
  try{
   await model.openTab({fullscreen,...sessionId?{sessionId}:{}});
   if(current(ticket))setNotice({error:false,text:fullscreen?'已在完整视图打开标签页入口。':'已打开标签页入口，可选择文件、终端或浏览器。'});
  }catch(reason){if(current(ticket)&&reason?.code!=='cancelled')setNotice({error:true,text:reason?.message||'暂时无法打开标签页，请重试。'});}
 }
 async function changePanel(next){
  if(snapshot.busy||direction)return;
  const ticket=begin();
  setOpen(false);setPicker(null);setNotice(null);setDirection(next);
  try{await (next==='expand'?model.expandPanel():model.collapsePanel());}
  catch(reason){if(current(ticket)&&reason?.code!=='cancelled')setNotice({error:true,text:reason?.message||'暂时无法切换右侧面板，请重试。'});}
  finally{if(alive.current&&action.current===ticket)setDirection(null);}
 }
 function choose(fullscreen){
  if(snapshot.busy||direction||!snapshot.available)return;
  if(snapshot.context)return run(fullscreen);
  setOpen(false);setQuery('');setPicker({fullscreen});
 }
 const filtered=snapshot.sessions.filter(entry=>[entry.title,entry.workspaceTitle].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 const busy=snapshot.busy||Boolean(direction);
 const busyText=direction==='collapse'?'正在收起右侧面板…':direction==='expand'?'正在展开右侧面板…':'正在打开标签页…';
 const panelAction=snapshot.expanded?'收起右侧面板':'展开右侧面板';
 return h('div',{className:'cgpt-window-toolbar',onClick:stop,onPointerDown:stop,onContextMenu:stop},
  snapshot.expanded||snapshot.hasTabs||snapshot.canExpand?h('button',{type:'button',className:'cgpt-window-plus','aria-label':panelAction,title:busy?busyText:panelAction,'aria-expanded':snapshot.expanded,'aria-busy':busy,disabled:busy,onClick:()=>changePanel(snapshot.expanded?'collapse':'expand')},h(CollapseIcon)):
  h(Menu,{open,portal:true,autoFocus:true,align:'end',onClose:closeMenu,className:'cgpt-window-plus-menu',listClassName:'cgpt-window-plus-menu',
   anchor:h('button',{type:'button',className:'cgpt-window-plus','aria-label':'新建标签页菜单',title:busy?busyText:'新建标签页','aria-haspopup':'menu','aria-expanded':open,'aria-busy':busy,disabled:busy,onClick:()=>setOpen(value=>!value)},h(PlusIcon)),
  },
   h(MenuItem,{icon:h('span',{'aria-hidden':true,className:'cgpt-window-menu-plus'},'+'),disabled:!snapshot.available||snapshot.busy,onSelect:()=>choose(false)},'新建标签页'),
   h(MenuItem,{icon:h(ExpandIcon),disabled:!snapshot.available||snapshot.busy,onSelect:()=>choose(true)},'在完整视图中打开新标签页'),
   h('p',{className:'cgpt-window-menu-context'},snapshot.available?(snapshot.context?'基于会话：'+snapshot.context.title:'选择已有会话后打开工具标签页'):'原生标签页功能暂不可用'),
  ),
  !snapshot.expanded&&!snapshot.hasTabs&&!snapshot.canExpand&&picker&&h(Modal,{open:true,title:'选择会话',description:'DeepSeek 的工具标签页需要一个会话。选择已有会话后打开。',closeLabel:'关闭',onClose:closePicker,className:'cgpt-window-session-modal',
   footer:h('button',{type:'button',className:'cgpt-window-secondary',onClick:closePicker},'取消'),
  },
   snapshot.sessions.length>0&&h('input',{type:'search',className:'cgpt-window-session-search','aria-label':'搜索已有会话',placeholder:'搜索已有会话',value:query,'data-modal-autofocus':true,onChange:event=>setQuery(event.target.value)}),
   h('ul',{className:'cgpt-window-session-list'},filtered.map(entry=>h('li',{key:entry.id},h('button',{type:'button',onClick:()=>run(picker.fullscreen,entry.id),'aria-label':'在「'+entry.title+'」中打开标签页'},h('span',null,entry.title),entry.workspaceTitle&&h('small',null,entry.workspaceTitle))))),
   filtered.length===0&&h('p',{className:'cgpt-window-empty'},snapshot.sessions.length?'没有匹配的会话。':'暂无已有会话。请先打开一个会话，再使用工具标签页。'),
  ),
  busy&&!direction&&h('div',{className:'cgpt-window-notice',role:'status'},busyText),
  !busy&&notice&&h('div',{className:'cgpt-window-notice','data-error':notice.error||undefined,role:notice.error?'alert':'status'},h('span',null,notice.text),h('button',{type:'button','aria-label':'关闭提示',onClick:()=>setNotice(null)},'×')),
 );
}

/** The outer frame stays mounted when the main page changes. */
export function GlobalWindowChrome({ctx,Menu,MenuItem,Modal}){
 const ref=React.useRef(null),[host,setHost]=React.useState(null);
 const [,refreshServices]=React.useState(0);
 React.useLayoutEffect(()=>{
  const mounted=mountWindowChrome(ref.current);setHost(mounted);
  return()=>mounted?.dispose();
 },[]);
 React.useEffect(()=>ctx.slots.subscribe('rightbar',()=>refreshServices(value=>value+1)),[ctx.slots]);
 const optional=name=>{try{return ctx.get?.(name);}catch{return undefined;}};
 const sidebarRight=optional('sidebarRight'),sidebarRightTabs=optional('sidebarRightTabs');
 const model=React.useMemo(()=>host?createWindowChromeModel({sessions:ctx.sessions,workspaces:ctx.workspaces,layout:ctx.layout,uiWorkspace:ctx.uiWorkspace,sidebarRight,sidebarRightTabs},{presentation:host.presentation,motion:host.motion}):null,[host,ctx.sessions,ctx.workspaces,ctx.layout,ctx.uiWorkspace,sidebarRight,sidebarRightTabs]);
 React.useEffect(()=>()=>model?.dispose(),[model]);
 return h(React.Fragment,null,h('span',{ref,className:'cgpt-window-chrome-anchor','aria-hidden':true}),host&&model&&createPortal(h(WindowChromeToolbar,{model,Menu,MenuItem,Modal}),host.seat));
}
