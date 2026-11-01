const DEFAULT_KEY='cgpt-rail.dock.v1';
const MAX_ENTRIES=128;

function normalize(value){
 if(value===null)return null;
 if(!Array.isArray(value)||value.length>MAX_ENTRIES||value.some(id=>typeof id!=='string'||!id.trim()))throw new TypeError('Dock 入口必须是不超过 128 项的非空字符串列表。');
 return Object.freeze([...new Set(value)]);
}

/** Local display preferences only. Never writes Host panel pins or sessions. */
export function createDockPreferences(options={}){
 let storage=options.storage,eventTarget=options.eventTarget;
 const key=options.key??DEFAULT_KEY;
 if(!Object.hasOwn(options,'storage')){
  try{storage=globalThis.localStorage;}catch{}
 }
 if(!Object.hasOwn(options,'eventTarget')){
  try{eventTarget=globalThis.window;}catch{}
 }
 const listeners=new Set();
 let snapshot=null,disposed=false,listening=false;
 const equal=(a,b)=>a===b||(a!==null&&b!==null&&a.length===b.length&&a.every((id,index)=>id===b[index]));
 function read(){
  // Storage access failures differ from malformed saved data: a later access
  // failure must not erase the last successfully loaded preference snapshot.
  const raw=storage?.getItem?.(key)??null;
  if(raw===null)return null;
  try{return normalize(JSON.parse(raw));}catch{return null;}
 }
 function publish(next){
  if(equal(snapshot,next))return;
  snapshot=next;
  // A consumer cannot turn an already persisted change into a reported save
  // failure or prevent another consumer from observing the same snapshot.
  for(const listener of [...listeners]){
   try{listener();}catch{}
  }
 }
 function sync(){
  try{publish(read());}catch{}
 }
 function onStorage(event){
  if(disposed||(event.key!==key&&event.key!==null))return;
  if(event.storageArea!=null&&event.storageArea!==storage)return;
  sync();
 }
 function detach(){
  if(!listening)return;
  eventTarget.removeEventListener('storage',onStorage);
  listening=false;
 }
 sync();
 return {
  getSnapshot:()=>snapshot,
  subscribe(listener){
   if(disposed)return()=>{};
   if(typeof listener!=='function')throw new TypeError('Dock preference listener must be a function.');
   const registered=()=>listener();
   listeners.add(registered);
   if(listeners.size===1){
    if(typeof eventTarget?.addEventListener==='function'&&typeof eventTarget?.removeEventListener==='function'){
     eventTarget.addEventListener('storage',onStorage);
     listening=true;
    }
    sync();
   }
   let stopped=false;
   return()=>{
    if(stopped)return;
    stopped=true;
    listeners.delete(registered);
    if(listeners.size===0)detach();
   };
  },
  set(ids){
   if(disposed)throw new Error('Dock 偏好已关闭。');
   const next=normalize(ids);
   if(typeof storage?.setItem!=='function'||typeof storage?.removeItem!=='function')throw new Error('无法保存 Dock 偏好：本地存储不可用。');
   if(next===null)storage.removeItem(key);
   else storage.setItem(key,JSON.stringify(next));
   publish(next);
  },
  dispose(){
   if(disposed)return;
   disposed=true;
   detach();
   listeners.clear();
  },
 };
}
