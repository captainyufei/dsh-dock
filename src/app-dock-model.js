const RECENT_LIMIT=5;

/** Application-style presentation over real Host pages; never a process manager. */
export function createAppDockModel({navigationModel,slots,layout}){
 const listeners=new Set();
 let recent=[],dismissed=new Set(),lastActive,icons=new Map(),snapshot,published,stops=[],disposed=false,operation=0;
 let state={libraryOpen:false,query:'',filter:'all',error:'',loadingId:null};
 function refresh(){
  const nav=navigationModel.getSnapshot(),main=new Set((slots.entries('main')||[]).map(entry=>entry.options?.key));
  const activeId=layout.panelInfo.getSnapshot().activePanelId;
  const valid=nav.all.filter(row=>row.kind==='panel'&&main.has(row.id)),ids=new Set(valid.map(row=>row.id));
  recent=recent.filter(id=>ids.has(id));
  if(activeId!==lastActive){
   lastActive=activeId;
   if(ids.has(activeId)){recent=[activeId,...recent.filter(id=>id!==activeId)].slice(0,RECENT_LIMIT);dismissed.delete(activeId);}
  }
  const pins=new Set(nav.dockIds),recentIds=new Set(recent);
  const apps=valid.map(row=>({id:row.id,label:row.label,iconUrl:icons.get(row.id)||'',active:row.id===activeId||(row.id==='home'&&activeId===null),pinned:pins.has(row.id),recent:recentIds.has(row.id)}));
  const byId=new Map(apps.map(row=>[row.id,row]));
  // Pin capacity belongs to the scrollable Dock, not an arbitrary six-item cap.
  const pinned=nav.dockIds.map(id=>byId.get(id)).filter(Boolean);
  const temporary=recent.filter(id=>!pins.has(id)&&!dismissed.has(id)).map(id=>byId.get(id)).filter(Boolean);
  const canShowNativeMore=nav.overflow.some(row=>row.kind==='action')||slots.entriesOfSlot('sidebar.panellist.actions').some(entry=>entry.options?.id!=='entry-customization');
  const next={...state,apps,dock:[...pinned,...temporary],canShowNativeMore,reservedEntryCount:nav.visible.filter(row=>row.kind==='action').length+(canShowNativeMore?1:0)};
  if(snapshot&&JSON.stringify(snapshot)===JSON.stringify(next))return;
  snapshot=Object.freeze({...next,apps:Object.freeze(apps.map(Object.freeze)),dock:Object.freeze([...pinned,...temporary])});
 }
 function changed(){
  if(disposed)return;refresh();
  if(snapshot===published)return;published=snapshot;
  for(const listener of [...listeners])listener();
 }
 function available(id){refresh();return snapshot.apps.find(row=>row.id===id);}
 function change(action){
  state.error='';
  try{action();changed();return true;}catch(error){state.error=error?.message||'无法保存应用栏设置';changed();return false;}
 }
 function disconnect(){for(const stop of stops.splice(0))stop();}
 refresh();published=snapshot;
 const model={
  getSnapshot(){refresh();return snapshot;},
  subscribe(listener){
   if(disposed)return()=>{};
   const registered=()=>listener();listeners.add(registered);
   if(listeners.size===1)try{
    stops.push(navigationModel.subscribe(changed));
    stops.push(layout.panelInfo.subscribe(changed));
    stops.push(slots.subscribe('main',changed));changed();
   }catch(error){listeners.delete(registered);disconnect();throw error;}
   return()=>{listeners.delete(registered);if(!listeners.size)disconnect();};
  },
  setIcons(next){
   if(disposed)return;
   const entries=[...next].filter(([id,url])=>typeof id==='string'&&typeof url==='string');
   if(entries.length===icons.size&&entries.every(([id,url])=>icons.get(id)===url))return;
   icons=new Map(entries);changed();
  },
  openLibrary(){if(disposed)return;state={...state,libraryOpen:true,query:'',filter:'all',error:''};changed();},
  closeLibrary(){if(disposed)return;operation++;state={...state,libraryOpen:false,error:'',loadingId:null};changed();},
  setQuery(value){if(disposed)return;state.query=String(value).slice(0,200);changed();},
  setFilter(value){if(disposed||!['all','pinned','recent'].includes(value))return;state.filter=value;changed();},
  async open(id){
   if(disposed||state.loadingId)return false;
   if(!available(id)){state.error='这个应用入口已不可用，请刷新应用列表。';changed();return false;}
   const epoch=++operation;state.loadingId=id;state.error='';changed();
   try{
    await navigationModel.run(id);
    if(disposed||epoch!==operation)return true;
    recent=[id,...recent.filter(value=>value!==id)].slice(0,RECENT_LIMIT);dismissed.delete(id);
    state={...state,libraryOpen:false,loadingId:null,error:''};changed();return true;
   }catch(error){if(!disposed&&epoch===operation){state.error=error?.message||'应用暂时无法打开';state.loadingId=null;changed();}return false;}
  },
  pin(id,enabled){
   if(disposed)return false;
   return change(()=>{if(!available(id))throw new Error('这个应用入口已不可用');navigationModel.toggleDock(id,enabled);if(!enabled)dismissed.add(id);else dismissed.delete(id);});
  },
  move(id,delta){if(disposed)return false;return change(()=>navigationModel.move(id,delta));},
  place(id,targetId,after){
   if(disposed)return false;
   return change(()=>{
    const a=available(id),b=available(targetId);
    if(!a?.pinned||!b?.pinned||id==='home'||id===targetId)return;
    const ids=[...navigationModel.getSnapshot().dockIds].filter(value=>value!==id);
    ids.splice(Math.max(1,ids.indexOf(targetId)+(after?1:0)),0,id);
    navigationModel.setDockIds(ids);
   });
  },
  dismissRecent(id){if(disposed)return;dismissed.add(id);changed();},
  openPluginManager(){return model.open('plugins');},
  dispose(){if(disposed)return;disposed=true;operation++;disconnect();listeners.clear();},
 };
 return model;
}
