import {resolveRailElements} from './rail-layout.js';

/** Own listeners only. Native navigation callbacks and button nodes stay intact. */
export function wireDockEvents(anchor,{navigationModel,onContext,onError=()=>{}}){
 const {nav,root}=resolveRailElements(anchor);
 if(!nav||!root)return()=>{};
 let dragged=null,suppressedClick=null,pointer=null,dropMark=null;
 let pendingListeners=[];
 const buttonOf=target=>target?.closest?.('[data-cgpt-nav-button],[data-cgpt-rail-action]');
 const idOf=button=>button?.getAttribute('data-cgpt-nav-button')||button?.getAttribute('data-cgpt-rail-action');
 const editable=target=>target?.closest?.('input,textarea,select,[contenteditable="true"]');
 function request(event,keyboard=false){
  if(editable(event.target))return;
  const button=buttonOf(event.target),inside=button&&nav.contains(button);
  if(!inside){
   if(keyboard||event.target?.closest?.('button,[role="button"],a,[data-cgpt-account-seat]'))return;
   const bounds=root.getBoundingClientRect();
   if(event.clientX<bounds.left||event.clientX>=bounds.left+52||event.clientY<bounds.top+44)return;
  }
  const rect=button?.getBoundingClientRect();
  event.preventDefault();event.stopPropagation();
  onContext({id:inside?idOf(button):null,x:keyboard?rect.right+6:event.clientX,y:keyboard?rect.top:event.clientY,trigger:inside?button:null});
 }
 const context=event=>request(event);
 const keydown=event=>{if(event.key==='ContextMenu'||(event.key==='F10'&&event.shiftKey))request(event,true);};
 function start(event){
  const button=buttonOf(event.target),id=idOf(button);
  if(!button||!nav.contains(button)||id==='home'||!navigationModel.getSnapshot().visible.some(entry=>entry.id===id))return;
  dragged=id;
  event.stopPropagation();
  if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);}
 }
 function over(event){
  if(!dragged||!nav.contains(buttonOf(event.target)))return;
  event.preventDefault();event.stopPropagation();
  if(event.dataTransfer)event.dataTransfer.dropEffect='move';
 }
 const suppressTrailingClick=id=>{suppressedClick={id,until:Date.now()+350};};
 function end(){if(dragged)suppressTrailingClick(dragged);dragged=null;}
 function saveMove(id,button,y){
  const target=idOf(button),current=navigationModel.getSnapshot().dockIds;
  if(id===target||!current.includes(target))return;
  const ids=current.filter(value=>value!==id),rect=button.getBoundingClientRect();
  const index=ids.indexOf(target)+(y>=rect.top+rect.height/2?1:0);
  ids.splice(Math.max(1,index),0,id);
  try{navigationModel.setDockIds(ids);}catch(error){onError(error);}
 }
 function drop(event){
  if(!dragged)return;
  const button=buttonOf(event.target),target=idOf(button);
  if(!button||!nav.contains(button)||!navigationModel.getSnapshot().dockIds.includes(target)){end();return;}
  event.preventDefault();event.stopPropagation();
  const id=dragged;end();
  saveMove(id,button,event.clientY);
 }
 function clearPointer(){
  for(const release of pendingListeners.splice(0))release();
  dropMark?.removeAttribute('data-cgpt-dock-drop');dropMark=null;
  const previous=pointer;pointer=null;
  if(previous){
   previous.button.removeAttribute('data-cgpt-dock-dragging');
   if(previous.captured)try{previous.button.releasePointerCapture?.(previous.pointerId);}catch{}
  }
 }
 function watchPendingPointer(){
  const document=root.ownerDocument,view=document?.defaultView;
  // Until a real drag earns capture, release/cancellation can occur outside
  // the sidebar. Keep these listeners only for this pressed pointer.
  for(const [target,name,handler] of [[document,'pointerup',pointerUp],[document,'pointercancel',pointerCancel],[view,'blur',pointerCancel]]){
   if(typeof target?.addEventListener!=='function'||typeof target?.removeEventListener!=='function')continue;
   target.addEventListener(name,handler,true);
   pendingListeners.push(()=>target.removeEventListener(name,handler,true));
  }
 }
 function pointerDown(event){
  if(event.button!==0||event.isPrimary===false)return;
  // A fresh press is deliberate user input, never the previous drag's click.
  suppressedClick=null;
  clearPointer();
  const button=buttonOf(event.target),id=idOf(button);
  if(!button||!nav.contains(button)||id==='home'||!navigationModel.getSnapshot().visible.some(entry=>entry.id===id))return;
  // Leave ordinary press/release/click targeting entirely to the Host.
  pointer={button,id,pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false,captured:false};
  watchPendingPointer();
 }
 function pointerMove(event){
  if(!pointer||event.pointerId!==pointer.pointerId)return;
  // This WKWebView can report buttons=0 while a native drag is still down.
  // The tracked down/up/cancel sequence is the pressed-state authority.
  if(!pointer.active&&Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)<6)return;
  if(!pointer.active){
   pointer.active=true;
   if(typeof pointer.button.setPointerCapture==='function')try{
    pointer.button.setPointerCapture(pointer.pointerId);pointer.captured=true;
   }catch{}
  }
  pointer.button.setAttribute('data-cgpt-dock-dragging','');
  event.preventDefault();event.stopPropagation();
  const target=buttonOf(root.ownerDocument?.elementFromPoint(event.clientX,event.clientY));
  dropMark?.removeAttribute('data-cgpt-dock-drop');dropMark=null;
  if(target&&nav.contains(target)&&idOf(target)!==pointer.id&&navigationModel.getSnapshot().dockIds.includes(idOf(target))){
   const rect=target.getBoundingClientRect();
   target.setAttribute('data-cgpt-dock-drop',event.clientY<rect.top+rect.height/2?'before':'after');
   dropMark=target;
  }
 }
 function pointerUp(event){
  if(!pointer||event.pointerId!==pointer.pointerId)return;
  const {active,id}=pointer;
  const target=active?buttonOf(root.ownerDocument?.elementFromPoint(event.clientX,event.clientY)):null;
  clearPointer();
  if(!active)return;
  suppressTrailingClick(id);
  event.preventDefault();event.stopPropagation();
  if(target&&nav.contains(target))saveMove(id,target,event.clientY);
 }
 function pointerCancel(event){
  if(pointer&&event?.pointerId!==undefined&&event.pointerId!==pointer.pointerId)return;
  if(pointer?.active)suppressTrailingClick(pointer.id);
  clearPointer();
 }
 function click(event){
  if(!suppressedClick)return;
  if(Date.now()>=suppressedClick.until){suppressedClick=null;return;}
  // Keyboard activation and clicks on a different icon remain immediate.
  const button=buttonOf(event.target);
  if(event.detail===0||!nav.contains(button)||idOf(button)!==suppressedClick.id)return;
  suppressedClick=null;
  event.preventDefault();event.stopPropagation();
 }
 const bindings=[['contextmenu',context],['keydown',keydown],['dragstart',start],['dragover',over],['drop',drop],['dragend',end],['click',click],['pointerdown',pointerDown],['pointermove',pointerMove],['pointerup',pointerUp],['pointercancel',pointerCancel]];
 for(const [name,handler] of bindings)root.addEventListener(name,handler,true);
 return()=>{for(const [name,handler] of bindings)root.removeEventListener(name,handler,true);dragged=null;suppressedClick=null;clearPointer();};
}
