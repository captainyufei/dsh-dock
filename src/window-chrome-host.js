import {mountWindowDragStrip} from './window-drag-strip.js';
import {mountWindowMotion} from './window-motion.js';

const PANEL='[data-sidebar-right-session][data-sidebar-right-panel]';
const OBSERVED_ATTRIBUTES=Object.freeze([
 'data-sidebar-right-session','data-sidebar-right-panel','data-sidebar-right-open',
 'data-rightbar-fullscreen','data-rightbar-collapsed','hidden',
 'data-sidebar-drawer','data-sidebar-collapsed',
]);

/** One frame-wide owner, mounted from the Host's permanent shell.overlay seat. */
export function mountWindowChrome(anchor){
 const frame=anchor?.closest?.('[data-shell-overlay]')?.parentElement;
 const document=frame?.ownerDocument;
 if(!frame||!document)return null;
 const undos=[];
 let disposed=false,observer=null,snapshot,publishedSnapshot;
 const listeners=new Set();
 function mark(node,name){
  if(!node)return;
  const before=node.getAttribute(name),installed='';
  node.setAttribute(name,installed);
  undos.push(()=>{
   // A later owner may have changed this marker. Never undo its change.
   if(node.getAttribute(name)!==installed)return;
   if(before===null)node.removeAttribute(name);else node.setAttribute(name,before);
  });
 }
 const center=frame.querySelector('[data-rightbar-col]')?.previousElementSibling
  ||frame.querySelector('[data-slot="sidebar"]')?.parentElement?.nextElementSibling;
 function ownLeadingWidth(){
  const column=frame.querySelector('[data-slot="sidebar"]')?.parentElement,style=frame.style;
  if(typeof column?.getBoundingClientRect!=='function'||typeof style?.getPropertyValue!=='function'||typeof style?.setProperty!=='function')return;
  const property='--cgpt-window-leading',before=style.getPropertyValue(property),priority=style.getPropertyPriority?.(property)||'';
  let installed=null,resizeObserver=null;
  const sync=()=>{
   if(disposed)return;
   const width=column.getBoundingClientRect().width;
   if(!Number.isFinite(width)||width<0)return;
   installed=width+'px';
   if(style.getPropertyValue(property)!==installed)style.setProperty(property,installed);
  };
  undos.push(()=>{
   resizeObserver?.disconnect();
   if(installed===null||style.getPropertyValue(property)!==installed)return;
   if(before)style.setProperty(property,before,priority);else style.removeProperty(property);
  });
  sync();
  const Observer=document.defaultView?.ResizeObserver||globalThis.ResizeObserver;
  if(typeof Observer==='function'){
   resizeObserver=new Observer(sync);
   resizeObserver.observe(column);
  }
 }
 const seat=document.createElement('div');
 seat.className='cgpt-window-chrome-seat';
 const navigationSeat=document.documentElement?.dataset?.platform==='darwin'?document.createElement('div'):null;
 if(navigationSeat)navigationSeat.className='cgpt-window-navigation-seat';
 let dragStrip,motion;
 try{
  mark(frame,'data-cgpt-window-frame');
  mark(center,'data-cgpt-window-center');
  ownLeadingWidth();
  dragStrip=mountWindowDragStrip(frame);
  // Keep the interactive toolbar in the frame, outside every page scrollport.
  // This seat's CSS must size only its toolbar, not a full-window no-drag box.
  frame.appendChild(seat);
  if(navigationSeat)frame.appendChild(navigationSeat);
  motion=mountWindowMotion(frame);
  undos.push(()=>motion.dispose());
 }catch(error){
  seat.remove();navigationSeat?.remove();dragStrip?.dispose();
  for(const undo of undos.reverse())undo();
  throw error;
 }
 function refresh(){
  // The narrow sidebar is a modal drawer. Its native toggle keeps focus;
  // the new sibling controls must not be a keyboard escape from that modal.
  if(navigationSeat){
   if(frame.hasAttribute('data-sidebar-drawer')&&!frame.hasAttribute('data-sidebar-collapsed'))navigationSeat.setAttribute('inert','');
   else navigationSeat.removeAttribute('inert');
  }
  const panel=Array.from(frame.querySelectorAll(PANEL)).find(node=>
   node.getAttribute('data-sidebar-right-session')?.trim()&&!node.closest('[hidden]'));
  const sessionId=panel?.getAttribute('data-sidebar-right-session')||null;
  // Background SessionViews stay mounted under [hidden]. A 0px right grid
  // track can still display a narrow-window fullscreen pane, so the pane's
  // own open marker, rather than the frame's track width, is authoritative.
  const expanded=Boolean(panel?.hasAttribute('data-sidebar-right-open'));
  const fullscreen=expanded&&panel.getAttribute('data-sidebar-right-panel')==='fullscreen';
  if(snapshot&&snapshot.sessionId===sessionId&&snapshot.expanded===expanded&&snapshot.fullscreen===fullscreen)return;
  snapshot=Object.freeze({sessionId,expanded,fullscreen});
 }
 function changed(){
  if(disposed)return;
  refresh();
  if(snapshot===publishedSnapshot)return;
  publishedSnapshot=snapshot;
  for(const listener of [...listeners]){if(disposed)break;listener();}
 }
 function disconnect(){observer?.disconnect();observer=null;}
 refresh();publishedSnapshot=snapshot;
 const presentation={
  getSnapshot(){if(!disposed)refresh();return snapshot;},
  subscribe(listener){
   if(disposed)return()=>{};
   const registered=()=>listener();
   listeners.add(registered);
   if(listeners.size===1){
    try{
     const Observer=document.defaultView?.MutationObserver||globalThis.MutationObserver;
     if(typeof Observer==='function'){
      observer=new Observer(changed);
      observer.observe(frame,{childList:true,subtree:true,attributes:true,attributeFilter:[...OBSERVED_ATTRIBUTES]});
     }
     changed();
    }catch(error){listeners.delete(registered);disconnect();throw error;}
   }
   let stopped=false;
   return()=>{
    if(stopped)return;stopped=true;
    listeners.delete(registered);
    if(!listeners.size)disconnect();
   };
  },
 };
 return {
  frame,seat,navigationSeat,presentation,motion,
  dispose(){
   if(disposed)return;disposed=true;
   disconnect();listeners.clear();
   seat.remove();navigationSeat?.remove();dragStrip?.dispose();
   for(const undo of undos.reverse())undo();
  },
 };
}
