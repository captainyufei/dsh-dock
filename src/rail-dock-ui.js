import React from 'react';
import {wireDockEvents} from './rail-dock-events.js';

const h=React.createElement;
const stop=event=>event.stopPropagation();

export function DockCustomizer({navigationModel,Modal,onClose}){
 const snapshot=React.useSyncExternalStore(navigationModel.subscribe,navigationModel.getSnapshot,navigationModel.getSnapshot);
 const [error,setError]=React.useState('');
 const selected=snapshot.dockIds.map(id=>snapshot.all.find(entry=>entry.id===id)).filter(Boolean);
 const available=snapshot.all.filter(entry=>!snapshot.dockIds.includes(entry.id));
 function change(action){setError('');try{action();}catch(reason){setError(reason?.message||'无法保存 Dock 设置，请重试。');}}
 const item=entry=>h('span',{className:'cgpt-dock-entry-name'},entry.label);
 const row=(entry,index)=>h('li',{key:entry.id,className:'cgpt-dock-entry'},
  item(entry),entry.id==='home'?h('span',{className:'cgpt-dock-fixed'},'固定'):h('span',{className:'cgpt-dock-row-actions'},
   h('button',{type:'button','aria-label':'上移 '+entry.label,disabled:index<=1,onClick:()=>change(()=>navigationModel.move(entry.id,-1))},'↑'),
   h('button',{type:'button','aria-label':'下移 '+entry.label,disabled:index===selected.length-1,onClick:()=>change(()=>navigationModel.move(entry.id,1))},'↓'),
   h('button',{type:'button','aria-label':'从 Dock 移除 '+entry.label,onClick:()=>change(()=>navigationModel.toggleDock(entry.id,false))},'移除'),
  ));
 const availableRows=kind=>available.filter(entry=>entry.kind===kind).map(entry=>h('li',{key:entry.id,className:'cgpt-dock-entry'},item(entry),
  h('button',{type:'button','aria-label':'添加到 Dock '+entry.label,onClick:()=>change(()=>navigationModel.toggleDock(entry.id,true))},'添加')));
 return h('div',{className:'cgpt-dock-ui',onClick:stop,onPointerDown:stop,onContextMenu:stop},h(Modal,{
  open:true,title:'自定义 Dock',description:'选择常用入口；直接显示前 '+snapshot.capacity+' 个，超出后放入“更多”。也可拖动图标调整顺序。',closeLabel:'关闭',onClose,className:'cgpt-dock-modal',
  footer:h('div',{className:'cgpt-dock-footer'},h('button',{type:'button',onClick:()=>change(()=>navigationModel.resetDock()),disabled:!snapshot.customized},'恢复默认'),h('button',{type:'button',className:'cgpt-dock-done',onClick:onClose},'完成')),
 },
  h('h3',{className:'cgpt-dock-section-title'},'Dock 中 · '+selected.length),
  h('ol',{className:'cgpt-dock-list'},selected.map(row)),
  available.some(entry=>entry.kind==='panel')&&h(React.Fragment,null,h('h3',{className:'cgpt-dock-section-title'},'可添加的功能'),h('ul',{className:'cgpt-dock-list'},availableRows('panel'))),
  available.some(entry=>entry.kind==='action')&&h('details',{className:'cgpt-dock-optional'},h('summary',null,'其他入口'),h('ul',{className:'cgpt-dock-list'},availableRows('action'))),
  h('p',{className:'cgpt-dock-hint'},'更改自动保存。已安装插件提供的新入口也可放入 Dock。'),
  error&&h('p',{className:'cgpt-dock-error',role:'alert'},error),
 ));
}

export function RailDockControls({anchorRef,navigationModel,Menu,MenuItem,Modal}){
 const [request,setRequest]=React.useState(null),[customizing,setCustomizing]=React.useState(false),[error,setError]=React.useState('');
 const snapshot=React.useSyncExternalStore(navigationModel.subscribe,navigationModel.getSnapshot,navigationModel.getSnapshot);
 React.useLayoutEffect(()=>wireDockEvents(anchorRef.current,{navigationModel,onContext:setRequest,onError:reason=>setError(reason?.message||'无法保存 Dock 设置，请重试。')}),[anchorRef,navigationModel]);
 const close=React.useCallback(()=>setRequest(null),[]);
 const stopCustomizing=React.useCallback(()=>setCustomizing(false),[]);
 function customize(){setRequest(null);setError('');setCustomizing(true);}
 function remove(){
  try{navigationModel.toggleDock(request.id,false);setRequest(null);}catch(reason){setError(reason?.message||'无法保存 Dock 设置，请重试。');}
 }
 const canRemove=request?.id&&request.id!=='home'&&snapshot.dockIds.includes(request.id);
 return h('div',{className:'cgpt-dock-ui',onClick:stop,onPointerDown:stop,onContextMenu:stop},
  request&&h(Menu,{
   open:true,portal:true,autoFocus:true,onClose:close,className:'cgpt-dock-context',listClassName:'cgpt-dock-context',
   anchorPoint:{x:request.x,y:request.y},contextual:true,
   getAnchorRect:()=>({left:request.x,right:request.x,top:request.y,bottom:request.y,width:0,height:0}),
   anchor:h('button',{type:'button',tabIndex:-1,'aria-hidden':true,className:'cgpt-context-anchor',style:{left:request.x,top:request.y}}),
  },h(MenuItem,{onSelect:customize},'自定义 Dock…'),canRemove&&h(MenuItem,{onSelect:remove},'从 Dock 移除')),
  customizing&&h(DockCustomizer,{navigationModel,Modal,onClose:stopCustomizing}),
  error&&h('div',{role:'alert',className:'cgpt-dock-toast'},error,h('button',{type:'button',onClick:()=>setError(''),'aria-label':'关闭提示'},'×')),
 );
}
