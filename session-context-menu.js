import React from 'react';

export const NATIVE_SESSION_MENU='sidebar.workspaces.session.menu.item';
export const SESSION_CONTEXT_MENU='chatgptRail.session.contextMenu';
const ACTIONS=new Set(['pin','rename','fork','archive','session-id']);
const h=React.createElement;

/** Mirror the Host's action components into our own legally-owned menu slot.
 * Their original injection closures keep the Host dialogs, access checks and
 * notifications. No action is invoked while this registry is assembled. */
export function mirrorNativeSessionMenu(slots){
 let stops=[];
 const clear=()=>{for(const stop of stops.splice(0).reverse())stop();};
 function sync(){
  clear();
  try{
   for(const entry of slots.entriesOfSlot(NATIVE_SESSION_MENU)){
    if(!ACTIONS.has(entry.options.id))continue;
    const options={
     name:SESSION_CONTEXT_MENU,id:entry.options.id,order:entry.options.order,
     priority:entry.options.priority,inject:entry.inject,locale:entry.locale,
     ...(entry.store===undefined?{}:{store:entry.store}),
    };
    stops.push(slots.register(options,entry.component));
   }
  }catch(error){clear();throw error;}
 }
 sync();
 const unsubscribe=slots.subscribe(NATIVE_SESSION_MENU,sync);
 return()=>{unsubscribe();clear();};
}

/** Transient presentation state; opening a menu never opens or creates a chat. */
export function createSessionContextController({sessions}){
 let snapshot=null;
 const listeners=new Set();
 const publish=value=>{snapshot=value;for(const listener of [...listeners])listener();};
 return {
  getSnapshot:()=>snapshot,
  subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  open({sessionId,x,y,trigger}){
   const summary=sessions.list.getSnapshot().byId?.[sessionId];
   if(!summary||summary.blank)return false;
   trigger?.focus?.({preventScroll:true});
   publish({sessionId,displayTitle:summary.title||summary.projectionValues?.title||'',
    x:Number.isFinite(x)?Math.max(0,x):0,y:Number.isFinite(y)?Math.max(0,y):0,trigger});
   return true;
  },
  close(){if(snapshot!==null)publish(null);},
  dispose(){listeners.clear();snapshot=null;},
 };
}

/** Own only this empty portal seat; native menu portals and dialogs own theirs. */
export function mountSessionContextSeat(document){
 const node=document.createElement('div');
 node.setAttribute('data-cgpt-context-seat','');
 document.body.appendChild(node);
 return {node,dispose:()=>node.remove()};
}

export function SessionContextMenu({controller,renderSlot,Menu}){
 const request=React.useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
 const setOpen=React.useCallback(value=>{if(!value)controller.close();},[controller]);
 const hookContext=React.useMemo(()=>[request!==null,setOpen],[request,setOpen]);
 React.useEffect(()=>{
  if(!request)return;
  return()=>queueMicrotask(()=>{
   if(controller.getSnapshot()!==null)return;
   const trigger=request.trigger,document=trigger?.ownerDocument;
   if(!document||!trigger.isConnected)return;
   const active=document.activeElement;
   // An action may have opened the Host rename/archive dialog. Leave its
   // autofocus intact; only restore focus stranded in this closing menu.
   if(!active||active===document.body||active.closest?.('.cgpt-session-context-popup,.cgpt-context-anchor'))trigger.focus?.({preventScroll:true});
  });
 },[request,controller]);
 if(request===null)return null;
 const stop=event=>event.stopPropagation();
 // Portal events follow HomeIcon's React ancestry; keep menu-item clicks out
 // of the Home navigation button, while leaving global keyboard hooks intact.
 return h('div',{className:'cgpt-context-layer',onClick:stop,onPointerDown:stop,onContextMenu:stop},
  h(Menu,{
   key:request.sessionId+'@'+request.x+','+request.y,
   open:true,portal:true,autoFocus:true,onClose:controller.close,className:'cgpt-session-context-popup',listClassName:'cgpt-session-context-popup',
   getAnchorRect:()=>({left:request.x,right:request.x,top:request.y,bottom:request.y,width:0,height:0}),
   anchor:h('button',{type:'button',tabIndex:-1,'aria-hidden':true,className:'cgpt-context-anchor',style:{left:request.x,top:request.y}}),
  },renderSlot(SESSION_CONTEXT_MENU,{sessionId:request.sessionId,displayTitle:request.displayTitle},{hookContext})),
 );
}
