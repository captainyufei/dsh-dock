const SIDEBAR='sidebar';
const EMPTY=Object.freeze([]);

/** Read the current sidebar's in-memory pin source; never mutate Host pins. */
export function createNativePanelPinsSource(slots){
 const faces=new WeakMap(),listeners=new Set();
 let snapshot=EMPTY,publishedSnapshot=EMPTY;
 let stopSlot=null,stopInner=null,liveInner=null;
 function innerSource(){
  const entry=slots.entriesOfSlot(SIDEBAR).find(candidate=>candidate.locale==='sidebar'&&typeof candidate.inject==='function');
  if(!entry)return null;
  if(!faces.has(entry)){
   let source=null;
   try{
    const candidate=entry.inject()?.hooks?.entryPins;
    if(typeof candidate?.getSnapshot==='function'&&typeof candidate?.subscribe==='function')source=candidate;
   }catch{/* A missing/incompatible optional Host contribution means no hidden panels. */}
   faces.set(entry,source);
  }
  return faces.get(entry);
 }
 function refresh(){
  let ids;
  try{ids=innerSource()?.getSnapshot();}catch{ids=EMPTY;}
  const next=Array.isArray(ids)?[...new Set(ids.filter(id=>typeof id==='string'&&id))]:EMPTY;
  if(next.length===snapshot.length&&next.every((id,index)=>id===snapshot[index]))return;
  snapshot=next.length?Object.freeze(next):EMPTY;
 }
 function rebind(){
  const next=innerSource();
  if(next===liveInner)return;
  const previousStop=stopInner;stopInner=null;liveInner=next;
  previousStop?.();
  if(next&&listeners.size){
   const release=next.subscribe(changed);
   // A source may synchronously notify while subscribing, and a listener may
   // release its consumer or replace the provider during that notification.
   if(liveInner===next&&listeners.size)stopInner=release;else release();
  }
 }
 function changed(){
  rebind();refresh();
  if(snapshot===publishedSnapshot)return;
  publishedSnapshot=snapshot;
  for(const listener of [...listeners])listener();
 }
 function disconnect(){
  const releaseSlot=stopSlot,releaseInner=stopInner;
  stopSlot=null;stopInner=null;liveInner=null;
  releaseSlot?.();releaseInner?.();
 }
 refresh();publishedSnapshot=snapshot;
 return {
  getSnapshot(){refresh();return snapshot;},
  subscribe(listener){
   const registered=()=>listener();listeners.add(registered);
   if(listeners.size===1){
    try{
     const release=slots.subscribe(SIDEBAR,changed);
     if(listeners.size)stopSlot=release;else release();
     changed();
    }catch(error){
     listeners.delete(registered);disconnect();throw error;
    }
   }
   return()=>{
    listeners.delete(registered);
    if(!listeners.size)disconnect();
   };
  },
 };
}
