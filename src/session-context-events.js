const NATIVE_ROW='[data-row-key^="session:"]';
const PINNED_ROW='[data-cgpt-pinned-session]';
const ROWS=NATIVE_ROW+','+PINNED_ROW;
const MORE='data-cgpt-session-more';
const EDITABLE='input,textarea,select,[contenteditable]:not([contenteditable="false"])';

/** Adapt only this sidebar region; all menu actions remain the caller's. */
export function wireSessionContextEvents(region,{onRequest,isMoreButton,moreLabelPattern}={}){
 if(!region||typeof onRequest!=='function')throw new TypeError('A sidebar region and onRequest callback are required.');
 const owned=new Map();
 let disposed=false;
 function mark(node,name,value){
  let attributes=owned.get(node);
  if(!attributes){attributes=new Map();owned.set(node,attributes);}
  if(!attributes.has(name))attributes.set(name,{before:node.getAttribute(name),written:value});
  node.setAttribute(name,value);
 }
 function restore(node,name){
  const attributes=owned.get(node),record=attributes?.get(name);
  if(!record)return;
  // Do not overwrite a later change made by the Host or another plugin.
  if(node.getAttribute(name)===record.written){
   if(record.before===null)node.removeAttribute(name);else node.setAttribute(name,record.before);
  }
  attributes.delete(name);
  if(attributes.size===0)owned.delete(node);
 }
 function matchesMore(label){
  if(typeof label!=='string')return false;
  if(typeof isMoreButton==='function')return !!isMoreButton(label);
  const {prefix='',suffix=''}=moreLabelPattern||{};
  return prefix.length+suffix.length>0&&label.length>=prefix.length+suffix.length&&label.startsWith(prefix)&&label.endsWith(suffix);
 }
 function scan(){
  if(disposed)return;
  const rows=new Set(region.querySelectorAll(NATIVE_ROW));
  const buttons=new Set();
  for(const row of rows){
   if(!row.hasAttribute('tabindex'))mark(row,'tabindex','0');
   for(const button of row.querySelectorAll('button[aria-label]')){
    if(button.closest(NATIVE_ROW)===row&&matchesMore(button.getAttribute('aria-label'))){
     buttons.add(button);mark(button,MORE,'');
    }
   }
  }
  for(const [node,attributes] of [...owned]){
   if(!region.contains(node)){
    for(const name of [...attributes.keys()])restore(node,name);
   }else{
    if(attributes.has(MORE)&&!buttons.has(node))restore(node,MORE);
    if(attributes.has('tabindex')&&!rows.has(node))restore(node,'tabindex');
   }
  }
 }
 function targetOf(event){
  const target=event.target?.closest?event.target:event.target?.parentElement;
  if(!target||!region.contains(target)||target.isContentEditable||target.closest(EDITABLE))return null;
  const row=target.closest(ROWS);
  if(!row||!region.contains(row))return null;
  const pinned=row.getAttribute('data-cgpt-pinned-session');
  const key=row.getAttribute('data-row-key');
  const sessionId=pinned||((key||'').startsWith('session:')?key.slice('session:'.length):'');
  if(!sessionId)return null;
  const button=target.closest('button');
  return {sessionId,trigger:button&&row.contains(button)?button:row};
 }
 function keyboardPoint(trigger){
  const rect=trigger.getBoundingClientRect();
  return {x:rect.left+Math.min(12,Math.max(0,rect.width||0)),y:rect.bottom};
 }
 function request(event,keyboard){
  const match=targetOf(event);
  if(!match)return;
  const point=keyboard||(event.clientX===0&&event.clientY===0)?keyboardPoint(match.trigger):{x:event.clientX,y:event.clientY};
  event.preventDefault();event.stopPropagation();
  onRequest({...match,...point});
 }
 const onContextMenu=event=>request(event,false);
 const onKeyDown=event=>{
  if(event.repeat||event.altKey||event.ctrlKey||event.metaKey)return;
  if(event.key==='ContextMenu'||(event.key==='F10'&&event.shiftKey))request(event,true);
 };
 // Capture reaches a portal's actual DOM region before its React ancestor can
 // stop bubbling; only matched menu gestures are consumed.
 region.addEventListener('contextmenu',onContextMenu,true);
 region.addEventListener('keydown',onKeyDown,true);
 let observer;
 try{
  scan();
  if(typeof MutationObserver==='function'){
   observer=new MutationObserver(scan);
   observer.observe(region,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-label']});
  }
 }catch(error){
  cleanup();throw error;
 }
 function cleanup(){
  if(disposed)return;
  disposed=true;
  observer?.disconnect();
  region.removeEventListener('contextmenu',onContextMenu,true);
  region.removeEventListener('keydown',onKeyDown,true);
  for(const [node,attributes] of [...owned])for(const name of [...attributes.keys()])restore(node,name);
 }
 return cleanup;
}
