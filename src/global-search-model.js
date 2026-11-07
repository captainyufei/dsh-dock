const CATEGORIES=[['all','全部'],['actions','操作'],['sessions','聊天'],['workspaces','工作区'],['text','文本']];
const text=value=>typeof value==='string'?value.trim():'';
const read=source=>source?.getSnapshot?.()||{};
const time=value=>typeof value==='number'?value:Date.parse(value)||0;
const INDEX_DISABLED='当前 DSH 未启用聊天正文搜索，现按会话标题和工作区查找。';
function sanitizeQuery(value){
 let query=String(value).replace(/\0/g,'').slice(0,500);
 const last=query.charCodeAt(query.length-1);
 if(last>=0xd800&&last<=0xdbff)query=query.slice(0,-1);
 return query;
}

/** A window-local palette. Searching never opens, retains or creates a Session. */
export function createGlobalSearchModel(ctx,{openHome,openWorkspace,debounceMs=180}={}){
 const listeners=new Set();
 const supportsText=typeof ctx.sessions.search==='function';
 const categories=CATEGORIES.filter(([id])=>id!=='text'||supportsText).map(([id,label])=>({id,label}));
 let state={open:false,query:'',category:'all',loading:false,error:'',notice:'',busyId:null,hasMore:false};
 let remoteItems=[],snapshot,rows=new Map(),stops=[],timer,request,queryEpoch=0,actionEpoch=0,disposed=false,textUnavailable=false;
 const mainPanels=()=>new Set((ctx.slots?.entries?.('main')||[]).map(entry=>entry.options?.key));
 function catalog(){
  const list=read(ctx.sessions.list),workspaceState=read(ctx.workspaces.list);
  const workspaces=workspaceState.items||[],archived=new Set(workspaceState.archivedSessionIds||[]),membership=new Map();
  for(const workspace of workspaces)for(const id of workspace.sessionIds||[]){
   if(!membership.has(id))membership.set(id,text(workspace.title)||text(workspace.path));
  }
  // byId also contains virtual subagent projections. The Host's ids list is
  // the visible root-chat roster; never promote projected children into it.
  const sessions=[...new Set(list.ids||[])].map(id=>list.byId?.[id]).filter(s=>s?.id&&s.origin!=='subagent'&&!s.blank&&!archived.has(s.id))
   .sort((a,b)=>time(b.updatedAt)-time(a.updatedAt)||a.id.localeCompare(b.id));
  const sessionRows=sessions.map(s=>({id:'session:'+s.id,sessionId:s.id,kind:'session',
   title:text(s.title)||text(s.projectionValues?.title)||'未命名聊天',
   detail:membership.get(s.id)||text(s.cwd).split(/[\\/]/).filter(Boolean).at(-1)||''}));
  const workspaceRows=workspaces.filter(w=>w.workspaceId).map(w=>({id:'workspace:'+w.workspaceId,workspaceId:w.workspaceId,kind:'workspace',title:text(w.title)||text(w.path)||'未命名工作区',detail:text(w.path)}));
  const panels=mainPanels();
  const actions=[
   {id:'action:home',kind:'action',title:'新聊天',panel:'home'},
   {id:'action:plugins',kind:'action',title:'打开插件',panel:'plugins'},
   {id:'action:schedules',kind:'action',title:'自动化任务',panel:'schedules'},
  ].filter(row=>panels.has(row.panel));
  return {sessionRows,workspaceRows,actions};
 }
 function publish(){
  const {sessionRows,workspaceRows,actions}=catalog(),query=state.query.trim().toLocaleLowerCase();
  const terms=query.split(/\s+/).filter(Boolean);
  const matches=row=>terms.every(term=>[row.title,row.detail,row.sessionId].filter(Boolean).join(' ').toLocaleLowerCase().includes(term));
  // Intersect body hits with today's visible metadata on every publication.
  const byId=new Map(sessionRows.map(row=>[row.sessionId,row])),hits=new Map();
  for(const item of remoteItems){if(byId.has(item?.sessionId)&&!hits.has(item.sessionId))hits.set(item.sessionId,text(item.snippet));}
  const local=sessionRows.filter(matches);
  const seen=new Set(local.map(row=>row.sessionId));
  const combined=[...local,...[...hits.keys()].filter(id=>!seen.has(id)).map(id=>byId.get(id))]
   .map(row=>({...row,...hits.has(row.sessionId)?{snippet:hits.get(row.sessionId)}:{}}));
  const body=[...hits].map(([id,snippet])=>({...byId.get(id),id:'text:'+id,kind:'text',snippet}));
  const all=state.category==='all',groups=[];
  let truncated=false;
  const add=(id,label,items,limit=20)=>{if((all||state.category===id)&&items.length){truncated||=items.length>limit;groups.push({id,label,items:items.slice(0,limit)});}};
  add('actions','快捷操作',actions.filter(matches));
  add('sessions',query?'聊天':'最近聊天',combined,all?8:20);
  add('workspaces','工作区',workspaceRows.filter(matches),all?5:20);
  if(state.category==='text'&&body.length)groups.push({id:'text',label:'聊天内容',items:body.slice(0,20)});
  rows=new Map(groups.flatMap(group=>group.items).map(row=>[row.id,row]));
  snapshot={...state,hasMore:truncated||(['all','sessions','text'].includes(state.category)&&state.hasMore),categories:categories.filter(c=>!textUnavailable||c.id!=='text'),groups};
  for(const listener of [...listeners])listener();
 }
 function cancelSearch(){queryEpoch++;clearTimeout(timer);timer=undefined;request?.abort();request=undefined;}
 function scheduleSearch(){
  cancelSearch();remoteItems=[];state.hasMore=false;state.error='';state.notice='';state.loading=false;
  const query=state.query.trim();
  if(!state.open||!query||!supportsText)return;
  if(textUnavailable){state.notice=INDEX_DISABLED;return;}
  state.loading=true;
  const epoch=queryEpoch;
  timer=setTimeout(async()=>{
   timer=undefined;const controller=new AbortController();request=controller;
   try{
    const result=await ctx.sessions.search(query,controller.signal);
    if(disposed||epoch!==queryEpoch||controller.signal.aborted)return;
    if(!result?.ok)throw new Error(result?.error?.message||'聊天内容搜索失败');
    remoteItems=Array.isArray(result.value?.items)?result.value.items:[];
    state.hasMore=result.value?.hasMore===true;
   }catch(error){
    if(disposed||epoch!==queryEpoch||controller.signal.aborted)return;
    // An installed API does not imply an enabled query index. Remember this
    // deployment capability until reload instead of retrying every keystroke.
    if(/session search is disabled/i.test(error?.message||'')){
     textUnavailable=true;if(state.category==='text')state.category='sessions';state.notice=INDEX_DISABLED;
    }else state.error='聊天内容搜索暂不可用，请稍后重试；仍可搜索会话标题。';
   }finally{
    if(!disposed&&epoch===queryEpoch&&!controller.signal.aborted){request=undefined;state.loading=false;publish();}
   }
  },debounceMs);
 }
 function stopSources(){for(const stop of stops.splice(0))stop();}
 function close(){
  if(!state.open)return;
  cancelSearch();actionEpoch++;stopSources();remoteItems=[];
  state={...state,open:false,loading:false,busyId:null,error:'',notice:'',hasMore:false};publish();
 }
 publish();
 return {
  getSnapshot:()=>snapshot,
  subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  open(){
   if(disposed||state.open)return;
   state={...state,open:true,query:'',category:'all',loading:false,error:'',notice:'',busyId:null,hasMore:false};
   try{
    for(const source of [ctx.sessions.list,ctx.workspaces.list])if(source?.subscribe)stops.push(source.subscribe(publish));
    if(ctx.slots?.subscribe)stops.push(ctx.slots.subscribe('main',publish));
   }catch(error){stopSources();state.open=false;publish();throw error;}
   publish();
  },
  close,
  setQuery(query){
   if(disposed||!state.open||state.busyId)return;
   const next=sanitizeQuery(query);if(next===state.query)return;
   state.query=next;scheduleSearch();publish();
  },
  setCategory(id){
   if(disposed||!state.open||state.busyId||!snapshot.categories.some(c=>c.id===id))return;
   state.category=id;publish();
  },
  async select(id){
   if(disposed||!state.open||state.busyId)return false;
   // Recompute immediately so a removed/archived result cannot be opened.
   publish();const row=rows.get(id);if(!row)return false;
   const epoch=++actionEpoch;state.busyId=id;state.error='';publish();
   try{
    if(row.kind==='session'||row.kind==='text')await ctx.uiWorkspace.openSession(row.sessionId);
    else if(row.kind==='workspace'){
     if(!openWorkspace)throw new Error('当前版本不支持从搜索打开工作区');
     await openWorkspace(row.workspaceId);
    }else if(row.panel==='home'&&openHome)await openHome();
    else await ctx.layout.selectPanel(row.panel);
    if(!disposed&&epoch===actionEpoch)close();
    return true;
   }catch(error){
    if(!disposed&&epoch===actionEpoch){state.error=error?.message||'无法打开，请重试';state.busyId=null;publish();}
    return false;
   }
  },
  dispose(){if(disposed)return;close();disposed=true;cancelSearch();stopSources();listeners.clear();},
 };
}
