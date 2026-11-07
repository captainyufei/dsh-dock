import React from 'react';

const h=React.createElement;
const stop=event=>event.stopPropagation();
const pendingKinds=new Set(['approval','question','plan-review']);
const attention=item=>pendingKinds.has(item.kind)||item.unread===true;
const MODE_ATTRIBUTE='data-cgpt-notification-mode';

/** Own the header action and the feed without moving the Host's sidebar nodes. */
export function mountNotificationSeat(anchor,model){
 const root=anchor?.closest?.('nav')?.parentElement;
 if(!root)return null;
 const document=root.ownerDocument,frame=root.closest('[data-slot="sidebar"]')?.parentElement?.parentElement;
 const previousMode=root.getAttribute(MODE_ATTRIBUTE);
 const node=document.createElement('span');node.className='cgpt-notification-seat';root.appendChild(node);
 let observer,unsubscribe,disposed=false;
 const syncMode=()=>{
  if(disposed)return;
  if(model.getSnapshot().open&&!frame?.hasAttribute('data-sidebar-collapsed'))root.setAttribute(MODE_ATTRIBUTE,'');
  else root.removeAttribute(MODE_ATTRIBUTE);
 };
 const closeIfHidden=()=>{
  if(disposed)return;
  if(frame?.hasAttribute('data-sidebar-collapsed'))model.close();
  syncMode();
 };
 const dispose=()=>{
  if(disposed)return;disposed=true;
  observer?.disconnect();unsubscribe?.();node.remove();
  if(previousMode===null)root.removeAttribute(MODE_ATTRIBUTE);else root.setAttribute(MODE_ATTRIBUTE,previousMode);
  model.close();
 };
 try{
  unsubscribe=model.subscribe(syncMode);
  if(frame&&document.defaultView?.MutationObserver){
   observer=new document.defaultView.MutationObserver(closeIfHidden);
   observer.observe(frame,{attributes:true,attributeFilter:['data-sidebar-collapsed']});
  }
  closeIfHidden();
 }catch(error){dispose();throw error;}
 return {node,dispose};
}

function BellIcon(){
 return h('svg',{width:16,height:16,viewBox:'0 0 20 20',fill:'none',stroke:'currentColor',strokeWidth:1.4,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},
  h('path',{d:'M6 7a4 4 0 0 1 8 0c0 5 1.5 5.2 1.5 6.5H4.5C4.5 12.2 6 12 6 7Zm2 9a2.2 2.2 0 0 0 4 0'}));
}

function ReadIcon(){
 return h('svg',{width:16,height:16,viewBox:'0 0 20 20',fill:'none',stroke:'currentColor',strokeWidth:1.4,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},
  h('path',{d:'m3 10 3 3 7-7m-3 7 7-7'}));
}

/** Both entry points use the unread count, never the number of retained records. */
export function HomeNotificationBadge({model}){
 const snapshot=React.useSyncExternalStore(model.subscribe,model.getSnapshot,model.getSnapshot);
 return snapshot.count>0?h('span',{className:'cgpt-notification-dot cgpt-home-notification-dot',role:'img','aria-label':snapshot.count+' 条未读或待处理通知'}):null;
}

export function NotificationBell({model}){
 const snapshot=React.useSyncExternalStore(model.subscribe,model.getSnapshot,model.getSnapshot);
 const bell=React.useRef(null),feedId=React.useId();
 const [selectedId,setSelectedId]=React.useState(null);
 const close=React.useCallback(()=>{model.close();bell.current?.focus({preventScroll:true});},[model]);
 React.useEffect(()=>{
  if(!snapshot.open)return;
  const document=bell.current?.ownerDocument;
  const escape=event=>{
   // A host dialog or menu keeps its own Escape handling above this sidebar.
   if(event.key!=='Escape'||event.defaultPrevented||event.isComposing||event.target?.closest?.('[role="dialog"],[role="menu"]'))return;
   event.preventDefault();event.stopPropagation();close();
  };
  document?.addEventListener('keydown',escape);
  return()=>document?.removeEventListener('keydown',escape);
 },[snapshot.open,close]);
 const title=snapshot.count?'通知 · '+snapshot.count+' 条未读或待处理':'通知';
 const priority=snapshot.items.filter(attention),recent=snapshot.items.filter(item=>!attention(item));
 const busy=snapshot.busyId!==null&&snapshot.busyId!==undefined;
 const canMarkRead=snapshot.items.some(item=>!pendingKinds.has(item.kind)&&item.unread===true);
 const select=async item=>{
  if(busy)return;
  try{if(await model.select(item.id)!==false)setSelectedId(item.id);}catch{}
 };
 const row=item=>h('button',{key:item.id,type:'button',className:'cgpt-notification-item',disabled:busy,
  'data-notification-id':item.id,'data-selected':selectedId===item.id?'':undefined,'aria-current':selectedId===item.id?'true':undefined,
  onClick:()=>{void select(item);}},
  h('span',{className:'cgpt-notification-copy'},
   h('span',{className:'cgpt-notification-title-line'},h('span',{className:'cgpt-notification-title'},item.title),
    item.workspaceTitle&&h('span',{className:'cgpt-notification-workspace'},item.workspaceTitle)),
   h('span',{className:'cgpt-notification-excerpt'},snapshot.busyId===item.id?'正在打开…':item.excerpt||item.detail),
   pendingKinds.has(item.kind)&&item.excerpt&&h('span',{className:'cgpt-notification-detail'},item.detail)),
  attention(item)&&h('span',{className:'cgpt-notification-item-dot',role:'img','aria-label':pendingKinds.has(item.kind)?'待处理':'未读'}),
 );
 const readButton=typeof model.markAllRead==='function'&&h('button',{type:'button',className:'cgpt-notification-read-all',
  disabled:busy||!canMarkRead,'aria-label':'将完成通知全部标为已读',title:'将完成通知全部标为已读',
  onClick:()=>{void Promise.resolve(model.markAllRead()).catch(()=>{});}},h(ReadIcon));
 return h('span',{className:'cgpt-notifications',onClick:stop,onPointerDown:stop,onContextMenu:stop},
  h('button',{ref:bell,type:'button',className:'cgpt-notification-button','aria-label':title,title,'aria-controls':feedId,'aria-expanded':snapshot.open,
   onClick:()=>snapshot.open?model.close():model.open()},h(BellIcon),snapshot.count>0&&h('span',{className:'cgpt-notification-dot','aria-hidden':true})),
  snapshot.open&&h('section',{id:feedId,className:'cgpt-notification-feed',role:'region','aria-label':'会话通知','aria-busy':snapshot.loading||undefined},
   h('div',{className:'cgpt-notification-heading'},h('h2',null,priority.length?'优先事项':'通知'),readButton),
   snapshot.error&&h('p',{className:'cgpt-notification-error',role:'alert'},snapshot.error),
   snapshot.notice&&h('p',{className:'cgpt-notification-notice',role:'status'},snapshot.notice),
   h('div',{className:'cgpt-notification-list'},
    priority.length>0&&h('div',{className:'cgpt-notification-group','aria-label':'优先事项'},priority.map(row)),
    recent.length>0&&h('div',{className:'cgpt-notification-group','aria-label':'最近完成'},
     h('h3',{className:'cgpt-notification-group-title'},'最近完成'),recent.map(row)),
    !snapshot.items.length&&h('div',{className:'cgpt-notification-empty',role:'status'},h(BellIcon),
     h('p',null,snapshot.loading?'正在读取会话记录…':snapshot.available?'暂无通知记录':'会话提醒暂不可用'),
     !snapshot.loading&&h('small',null,snapshot.available?'会话完成或需要你处理时，会显示在这里。':'当前宿主尚未提供会话提醒状态。')),
   ),
  ),
 );
}
