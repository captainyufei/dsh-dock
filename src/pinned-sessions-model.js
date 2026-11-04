/** A read-only presentation of the Host's single, registry-global pin set. */
export function createPinnedSessionsModel({sessions,workspaces,layout,uiWorkspace}){
 const sources=[sessions.list,workspaces.list,layout.panelInfo];
 const listeners=new Set();
 const pendingUnpins=new Map();
 let subscriptions=[];
 let snapshot;
 let publishedSnapshot;

 const text=value=>typeof value==='string'?value.trim():'';
 function refresh(){
  const list=sessions.list.getSnapshot();
  const workspaceState=workspaces.list.getSnapshot();
  const panel=layout.panelInfo.getSnapshot();
  const byId=list.byId||{};
  const archived=new Set(workspaceState.archivedSessionIds||[]);
  const workspaceTitles=new Map();
  for(const workspace of workspaceState.items||[]){
   for(const id of workspace.sessionIds||[]){
    if(!workspaceTitles.has(id))workspaceTitles.set(id,text(workspace.title));
   }
  }
  const seen=new Set();
  const rows=[];
  for(const id of workspaceState.pinnedSessionIds||[]){
   if(seen.has(id))continue;
   seen.add(id);
   const summary=byId[id];
   if(!summary||summary.blank||archived.has(id))continue;
   rows.push({id,title:text(summary.title)||text(summary.projectionValues?.title)||'未命名',workspaceTitle:workspaceTitles.get(id)||'',running:summary.running===true});
  }
  const activeId=panel.activePanelId===null?Object.values(byId).find(summary=>(summary?.retainedBy?.mainView||0)>0)?.id:null;
  const nextActiveId=activeId??null;
  if(snapshot&&snapshot.activeId===nextActiveId&&snapshot.rows.length===rows.length&&rows.every((row,index)=>{
   const previous=snapshot.rows[index];
   return row.id===previous.id&&row.title===previous.title&&row.workspaceTitle===previous.workspaceTitle&&row.running===previous.running;
  }))return false;
  snapshot=Object.freeze({rows:Object.freeze(rows.map(row=>Object.freeze(row))),activeId:nextActiveId});
  return true;
 }
 function changed(){
  refresh();
  // A different source consumer may read getSnapshot before our subscription
  // callback runs. That read must not swallow the update for our listeners.
  if(snapshot===publishedSnapshot)return;
  publishedSnapshot=snapshot;
  for(const listener of [...listeners])listener();
 }
 refresh();
 publishedSnapshot=snapshot;

 return {
  getSnapshot(){refresh();return snapshot;},
  subscribe(listener){
   // A separate registration also permits two consumers to share a callback.
   const registered=()=>listener();
   listeners.add(registered);
   if(listeners.size===1){
    try{for(const source of sources)subscriptions.push(source.subscribe(changed));}
    catch(error){
     for(const stop of subscriptions.splice(0))stop();
     listeners.delete(registered);
     throw error;
    }
    changed();
   }
   return()=>{
    listeners.delete(registered);
    if(listeners.size===0)for(const stop of subscriptions.splice(0))stop();
   };
  },
  open(id){
   const summary=sessions.list.getSnapshot().byId?.[id];
   const archived=workspaces.list.getSnapshot().archivedSessionIds||[];
   if(!summary||summary.blank||archived.includes(id))return false;
   uiWorkspace.openSession(id);
   return true;
  },
  unpin(id){
   if(pendingUnpins.has(id))return pendingUnpins.get(id);
   const request=Promise.resolve().then(()=>uiWorkspace.unpinSession(id)).finally(()=>{
    if(pendingUnpins.get(id)===request)pendingUnpins.delete(id);
   });
   pendingUnpins.set(id,request);
   return request;
  },
 };
}
