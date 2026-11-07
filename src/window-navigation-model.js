const source=value=>typeof value?.getSnapshot==='function'&&typeof value?.subscribe==='function';
const same=(a,b)=>a?.kind===b?.kind&&a?.id===b?.id;

/** In-window visit history over Host navigation, not browser or tool history.
 * No Session is created or retained by this model. The permanent chrome keeps
 * one subscription alive; disposing it discards the visit list. */
export function createWindowNavigationModel(ctx,{limit=80}={}){
 const {layout,uiWorkspace,sessions,workspaces,slots}=ctx;
 const capacity=Number.isFinite(limit)?Math.max(2,Math.min(80,Math.floor(limit))):80;
 const selection=source(uiWorkspace?.selection)?uiWorkspace.selection:null;
 const sources=[...new Set([layout?.panelInfo,selection,sessions?.list,workspaces?.list].filter(source))];
 const listeners=new Set();
 let entries=[],cursor=-1,snapshot,subscriptions=[],queued=false,epoch=0,disposed=false;
 const read=(observable,fallback)=>observable?.getSnapshot?.()??fallback;

 function panelExists(id){
  const list=typeof slots?.entries==='function'?slots.entries('main'):slots?.entriesOfSlot?.('main');
  return Array.isArray(list)&&list.some(entry=>entry.options?.key===id);
 }
 function available(entry){
  if(!entry)return false;
  if(entry.kind==='panel')return typeof layout?.selectPanel==='function'&&panelExists(entry.id);
  const catalog=read(sessions?.list,{byId:{}});
  return typeof uiWorkspace?.openSession==='function'&&Boolean(catalog.byId?.[entry.id])&&
   !read(workspaces?.list,{}).archivedSessionIds?.includes(entry.id);
 }
 function current(){
  const panel=read(layout?.panelInfo,{}).activePanelId;
  if(typeof panel==='string'){
   const entry={kind:'panel',id:panel};
   return available(entry)?entry:null;
  }
  if(panel!==null)return null;
  const selected=selection?read(selection,{}):null;
  const id=selection?selected.sessionId:Object.values(read(sessions?.list,{byId:{}}).byId||{})
   .find(row=>(row?.retainedBy?.mainView||0)>0)?.id;
  if(typeof id!=='string'||!id)return null;
  // Preserve a durable subagent address when the Host supplies one. Ordinary
  // chats (including existing blank drafts) reopen by their actual Session id.
  const entry={kind:'session',id,...selected?.subagentAddress?{target:{...selected.subagentAddress}}:{}};
  return available(entry)?entry:null;
 }
 function seek(direction){
  for(let index=cursor+direction;index>=0&&index<entries.length;index+=direction){
   if(available(entries[index])&&!same(entries[index],entries[cursor]))return index;
  }
  return -1;
 }
 function publish(){
  const selected=entries[cursor];
  const next={canBack:!disposed&&seek(-1)!==-1,canForward:!disposed&&seek(1)!==-1,
   current:selected?Object.freeze({kind:selected.kind,id:selected.id}):null};
  if(snapshot&&snapshot.canBack===next.canBack&&snapshot.canForward===next.canForward&&same(snapshot.current,next.current))return;
  snapshot=Object.freeze(next);
  for(const listener of [...listeners])listener();
 }
 function settle(){
  if(disposed)return;
  queued=false;
  const selected=current();
  // Source notifications can briefly lack a main Session during replacement.
  // They are not visits; background metadata changes also keep the cursor.
  if(selected&&!same(selected,entries[cursor])){
   entries=entries.slice(0,cursor+1);
   entries.push(selected);
   if(entries.length>capacity)entries.splice(0,entries.length-capacity);
   cursor=entries.length-1;
  }else if(selected){
   entries[cursor]=selected;
  }
  publish();
 }
 function changed(){
  if(disposed||queued)return;
  queued=true;
  const scheduled=epoch;
  // openSession publishes retain/selection/release/panel changes synchronously.
  // Observe the settled destination once, not each intermediate notification.
  queueMicrotask(()=>{if(!disposed&&queued&&epoch===scheduled)settle();});
 }
 function disconnect(){
  epoch++;queued=false;
  for(const stop of subscriptions.splice(0).reverse())stop();
 }
 function move(direction){
  if(disposed)return false;
  // A user's immediately preceding navigation may still await the batch flush.
  settle();
  const index=seek(direction);
  if(index===-1)return false;
  const entry=entries[index];
  // Both supported Host navigation methods commit selection synchronously;
  // loading the selected Session's messages happens independently afterward.
  if(entry.kind==='panel')layout.selectPanel(entry.id);
  else uiWorkspace.openSession(entry.target??entry.id);
  if(!same(current(),entry))return false;
  cursor=index;
  publish();
  return true;
 }
 settle();
 return {
  getSnapshot:()=>snapshot,
  subscribe(listener){
   if(disposed)return()=>{};
   const registered=()=>listener();listeners.add(registered);
   if(listeners.size===1){
    try{
     for(const observable of sources)subscriptions.push(observable.subscribe(changed));
     if(typeof slots?.subscribe==='function')subscriptions.push(slots.subscribe('main',changed));
     settle();
    }catch(error){listeners.delete(registered);disconnect();throw error;}
   }
   let stopped=false;
   return()=>{
    if(stopped)return;stopped=true;listeners.delete(registered);
    if(!listeners.size)disconnect();
   };
  },
  back:()=>move(-1),
  forward:()=>move(1),
  dispose(){
   if(disposed)return;disposed=true;
   disconnect();listeners.clear();entries=[];cursor=-1;publish();
  },
 };
}
