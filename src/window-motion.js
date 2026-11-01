const ATTRIBUTE='data-cgpt-right-motion';
const PANEL='[data-sidebar-right-session][data-sidebar-right-panel]';
const DOCK='[data-dockkit-host="dock"]';
// An abandoned action or a permanently paused animation must not retain an
// owner forever. Normal completion always follows the actual animation promises.
const LEASE_LIMIT_MS=10000;

/** Arm the frame's transition before a native flushSync can commit its target. */
export function mountWindowMotion(frame){
 if(typeof frame?.setAttribute!=='function')return {prepare:()=>()=>{},dispose(){}};
 const view=frame.ownerDocument?.defaultView||globalThis;
 const setTimer=(callback,delay)=>(view.setTimeout||globalThis.setTimeout).call(view,callback,delay);
 const clearTimer=id=>(view.clearTimeout||globalThis.clearTimeout).call(view,id);
 let generation=0,active=null,disposed=false;
 function cancelScheduled(operation){
  if(operation.raf!==null){
   if(operation.rafKind==='animation'){
    (view.cancelAnimationFrame||globalThis.cancelAnimationFrame)?.call(view,operation.raf);
   }else clearTimer(operation.raf);
   operation.raf=null;
  }
  if(operation.timer!==null){clearTimer(operation.timer);operation.timer=null;}
 }
 function release(operation){
  if(active!==operation)return;
  cancelScheduled(operation);active=null;
  // Do not undo another owner's later change to the same presentation hook.
  if(frame.getAttribute(ATTRIBUTE)!==operation.token)return;
  if(operation.before===null)frame.removeAttribute(ATTRIBUTE);
  else frame.setAttribute(ATTRIBUTE,operation.before);
 }
 function flushPreparedStyle(){
  try{
   if(typeof view.getComputedStyle==='function'){
    void view.getComputedStyle(frame).gridTemplateColumns;
    return;
   }
  }catch{}
  try{
   if(typeof frame.getBoundingClientRect==='function')frame.getBoundingClientRect();
   else void frame.offsetWidth;
  }catch{}
 }
 function transitions(node,property){
  let animations;
  try{animations=node.getAnimations?.()||[];}catch{return [];}
  // transitionProperty identifies CSSTransition across document realms and
  // excludes keyframe animations without depending on a global constructor.
  return animations.filter(animation=>animation?.transitionProperty===property&&animation.playState!=='finished'&&animation.playState!=='idle');
 }
 function pendingTransitions(){
  const animations=transitions(frame,'grid-template-columns');
  for(const panel of frame.querySelectorAll?.(PANEL)||[]){
   if(panel.closest?.('[hidden]'))continue;
   for(const dock of panel.querySelectorAll?.(DOCK)||[]){
    if(!dock.closest?.('[hidden]'))animations.push(...transitions(dock,'transform'));
   }
  }
  return [...new Set(animations)];
 }
 function reducedMotion(){
  try{return Boolean(view.matchMedia?.('(prefers-reduced-motion: reduce)').matches);}catch{return false;}
 }
 function finish(operation){
  if(disposed||active!==operation||operation.finishCalled)return;
  operation.finishCalled=true;
  const inspect=()=>{
   operation.raf=null;
   if(disposed||active!==operation)return;
   if(reducedMotion()){release(operation);return;}
   const animations=pendingTransitions();
   if(animations.length===0){release(operation);return;}
   const completions=animations.map(animation=>{
    try{return Promise.resolve(animation.finished);}catch(reason){return Promise.reject(reason);}
   });
   Promise.allSettled(completions).then(()=>{
    if(!disposed&&active===operation)release(operation);
   });
  };
  const request=view.requestAnimationFrame||globalThis.requestAnimationFrame;
  operation.rafKind=typeof request==='function'?'animation':'timer';
  operation.raf=operation.rafKind==='animation'?request.call(view,inspect):setTimer(inspect,0);
 }
 return {
  prepare(){
   if(disposed)return()=>{};
   const current=frame.getAttribute(ATTRIBUTE);
   const before=active&&current===active.token?active.before:current;
   if(active)cancelScheduled(active);
   const operation={token:String(++generation),before,raf:null,rafKind:null,timer:null,finishCalled:false};
   active=operation;
   frame.setAttribute(ATTRIBUTE,operation.token);
   flushPreparedStyle();
   operation.timer=setTimer(()=>release(operation),LEASE_LIMIT_MS);
   return()=>finish(operation);
  },
  dispose(){
   if(disposed)return;disposed=true;
   if(active)release(active);
  },
 };
}
