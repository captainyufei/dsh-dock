const PANELS='sidebar.panellist';
const MORE='sidebar.panellist.actions';
const SETTINGS='sidebar.settings';
const PRIORITY=['home','schedules','plugins'];

/** Display registered Host entries according to this Dock's own preferences. */
export function createRailNavigationModel({slots,layout,locale},{capacity=6,getLabels,preferences,nativePins}={}){
 const limit=Number.isFinite(capacity)&&capacity>=0?Math.floor(capacity):6;
 const faces=new WeakMap();
 const listeners=new Set();
 let subscriptions=[];
 let snapshot,publishedSnapshot,memoryPreference=null;
 const text=value=>typeof value==='string'?value.trim():'';
 function normalizeIds(value){
  if(!Array.isArray(value))return null;
  return ['home',...new Set(value.filter(id=>typeof id==='string'&&id.trim()&&id!=='home'))];
 }
 const readPreference=()=>normalizeIds(preferences?preferences.getSnapshot():memoryPreference);
 const sameIds=(before,after)=>before===null||after===null?before===after:before.length===after.length&&before.every((id,index)=>id===after[index]);
 function panelEntries(){
  const seen=new Set();
  return slots.entriesOfSlot(PANELS).filter(entry=>{
   const id=entry.options?.id;
   if(typeof id!=='string'||!id||seen.has(id))return false;
   seen.add(id);return true;
  }).slice().sort((a,b)=>{
   const aPriority=PRIORITY.indexOf(a.options.id),bPriority=PRIORITY.indexOf(b.options.id);
   const rankA=aPriority<0?PRIORITY.length:aPriority,rankB=bPriority<0?PRIORITY.length:bPriority;
   const order=value=>Number.isFinite(value)?value:0;
   return rankA-rankB||order(a.options.order)-order(b.options.order)||a.options.id.localeCompare(b.options.id);
  });
 }
 function customization(){
  // registrant is a Cordis ancestor name (minified in the desktop build),
  // not the imported package id. Our own shadow has no such locale.
  const entry=slots.entries(MORE).find(candidate=>candidate.options?.id==='entry-customization'&&candidate.locale==='entryCustomization'&&typeof candidate.inject==='function');
  if(!entry)return null;
  if(!faces.has(entry)){
   try{faces.set(entry,{face:entry.inject()});}catch(error){faces.set(entry,{error});}
  }
  const result=faces.get(entry);
  if(result.error)return {entry,error:result.error};
  const face=result.face;
  return typeof face?.browsePlugins==='function'&&typeof face?.createPlugin==='function'?{entry,face}:null;
 }
 function settingsEntry(){
  const entry=slots.entriesOfSlot(SETTINGS)[0];
  return entry?.locale==='settings'&&typeof entry.store?.create==='function'?entry:null;
 }
 function translated(namespace,key,fallback){
  const value=locale?.bind?.(namespace)?.(key);
  return text(value)&&value!==key?value:fallback;
 }
 function refresh(){
  const labels=getLabels?.()||{};
  const activeId=layout.panelInfo.getSnapshot().activePanelId;
  const rows=panelEntries().map(entry=>{
   const id=entry.options.id;
   const label=typeof entry.options.label==='function'?entry.options.label():entry.options.label;
   return {id,label:text(label)||id,kind:'panel',icon:id,active:activeId===id};
  });
  const provider=customization();
  if(provider?.face){
   rows.push({id:'action:browse-plugins',label:text(labels.browsePlugins)||translated('entryCustomization','install','浏览更多插件'),kind:'action',icon:'browse',active:false});
   rows.push({id:'action:create-plugin',label:text(labels.createPlugin)||translated('entryCustomization','create','创建你的插件'),kind:'action',icon:'create',active:false});
  }
  if(settingsEntry())rows.push({id:'action:settings',label:text(labels.settings)||translated('settings','trigger','设置'),kind:'action',icon:'settings',active:false});
  const preference=readPreference(),customized=preference!==null;
  const byId=new Map(rows.map(row=>[row.id,row]));
  const ids=preference||rows.filter(row=>row.kind==='panel').map(row=>row.id);
  const dockIds=ids.filter(id=>byId.has(id));
  const selected=dockIds.map(id=>byId.get(id)),selectedSet=new Set(dockIds);
  const nativeUnpinned=nativePins?.getSnapshot?.();
  const unpinned=new Set(Array.isArray(nativeUnpinned)?nativeUnpinned:[]);
  const renderable=row=>row.kind!=='panel'||row.id==='plugins'||!unpinned.has(row.id);
  const rendered=selected.filter(renderable);
  const visible=rendered.slice(0,limit);
  const visibleSet=new Set(visible.map(row=>row.id));
  // Native panels remain reachable when removed from the Dock. Optional
  // actions have their original Host entry points and do not force More open.
  const overflow=[...selected.filter(row=>!visibleSet.has(row.id)),...rows.filter(row=>row.kind==='panel'&&!selectedSet.has(row.id))];
  const showMore=overflow.length>0||slots.entriesOfSlot(MORE).some(entry=>entry.options?.id!=='entry-customization');
  const equal=(before,after)=>before.length===after.length&&after.every((row,index)=>{
   const previous=before[index];
   return row.id===previous.id&&row.label===previous.label&&row.kind===previous.kind&&row.icon===previous.icon&&row.active===previous.active;
  });
  if(snapshot&&snapshot.customized===customized&&snapshot.showMore===showMore&&sameIds(snapshot.dockIds,dockIds)&&equal(snapshot.all,rows)&&equal(snapshot.visible,visible)&&equal(snapshot.overflow,overflow))return;
  const freeze=items=>Object.freeze(items.map(item=>Object.freeze(item)));
  snapshot=Object.freeze({all:freeze(rows),dockIds:Object.freeze(dockIds),visible:freeze(visible),overflow:freeze(overflow),showMore,capacity:limit,customized});
 }
 function changed(){
  refresh();
  if(snapshot===publishedSnapshot)return;
  publishedSnapshot=snapshot;
  for(const listener of [...listeners])listener();
 }
 function writePreference(value){
  const next=normalizeIds(value),before=readPreference();
  if(sameIds(before,next))return;
  // Persist first: a refused write must never appear as a saved UI change.
  if(preferences)preferences.set(next);else memoryPreference=next;
  changed();
 }
 function editableIds(){
  refresh();
  return readPreference()||[...snapshot.dockIds];
 }
 refresh();publishedSnapshot=snapshot;
 return {
  getSnapshot(){refresh();return snapshot;},
  subscribe(listener){
   const registered=()=>listener();
   listeners.add(registered);
   if(listeners.size===1){
    try{
     for(const name of [PANELS,MORE,SETTINGS])subscriptions.push(slots.subscribe(name,changed));
     subscriptions.push(layout.panelInfo.subscribe(changed));
     if(typeof locale?.subscribe==='function')subscriptions.push(locale.subscribe(changed));
     if(typeof preferences?.subscribe==='function')subscriptions.push(preferences.subscribe(changed));
     if(typeof nativePins?.subscribe==='function')subscriptions.push(nativePins.subscribe(changed));
     changed();
    }catch(error){
     for(const stop of subscriptions.splice(0))stop();
     listeners.delete(registered);throw error;
    }
   }
   return()=>{
    listeners.delete(registered);
    if(listeners.size===0)for(const stop of subscriptions.splice(0))stop();
   };
  },
  setDockIds(ids){
   if(!Array.isArray(ids))throw new TypeError('Dock 图标顺序必须是数组。');
   refresh();
   const available=new Set(snapshot.all.map(entry=>entry.id));
   const missing=(readPreference()||[]).filter(id=>!available.has(id));
   writePreference([...ids,...missing]);
  },
  toggleDock(id,enabled){
   refresh();
   if(!snapshot.all.some(entry=>entry.id===id))throw new Error('该导航入口已不可用。');
   if(id==='home'&&!enabled)throw new Error('首页始终保留在 Dock 中。');
   const ids=editableIds(),has=ids.includes(id);
   if(Boolean(enabled)===has)return;
   writePreference(enabled?[...ids,id]:ids.filter(item=>item!==id));
  },
  move(id,delta){
   refresh();
   const current=snapshot.dockIds,index=current.indexOf(id);
   if(index<0)throw new Error('该图标尚未放入 Dock。');
   if(id==='home'||!Number.isFinite(delta)||delta===0)return;
   const target=Math.max(current[0]==='home'?1:0,Math.min(current.length-1,index+Math.trunc(delta)));
   if(target===index)return;
   const ids=editableIds();
   const from=ids.indexOf(id),to=ids.indexOf(current[target]);
   ids.splice(from,1);
   ids.splice(to,0,id);
   writePreference(ids);
  },
  resetDock(){writePreference(null);},
  run(id){
   if(id==='action:settings'){
    const entry=settingsEntry();
    if(!entry)throw new Error('原生设置入口已不可用。');
    const instance=entry.store.create();
    if(typeof instance?.actions?.open!=='function')throw new Error('原生设置入口不支持打开。');
    return instance.actions.open();
   }
   if(id==='action:browse-plugins'||id==='action:create-plugin'){
    const provider=customization();
    if(provider?.error)throw provider.error;
    if(!provider?.face)throw new Error('原生插件入口已不可用。');
    return id==='action:browse-plugins'?provider.face.browsePlugins():provider.face.createPlugin();
   }
   if(!panelEntries().some(entry=>entry.options.id===id))throw new Error('该导航入口已不可用。');
   return layout.selectPanel(id);
  },
 };
}
