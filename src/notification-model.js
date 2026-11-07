const text=value=>typeof value==='string'?value.trim():'';
const time=value=>typeof value==='number'&&Number.isFinite(value)?value:Date.parse(value)||0;
const isSource=value=>typeof value?.getSnapshot==='function'&&typeof value?.subscribe==='function';
const DETAILS={approval:'等待审批',question:'等待回答','plan-review':'等待确认计划',completed:'任务已完成',error:'任务出错',aborted:'任务已取消',blocked:'任务被阻止','max-tokens':'已达到长度限制',interrupted:'任务已中断'};
const PENDING=new Set(['approval','question','plan-review']);
const STORAGE_KEY='dsh-dock:notification-inbox:v1';
const MAX_RECORDS=200;
const sameItems=(a,b)=>a.length===b.length&&a.every((item,i)=>Object.keys(item).every(key=>item[key]===b[i][key]));
function preview(content){
 if(!Array.isArray(content))return '';
 return content.filter(block=>block?.type==='text').slice(0,8).map(block=>text(block.text).slice(0,400)).join(' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[`*_#]/g,'').replace(/\s+/g,' ').slice(0,180);
}

/** Only committed turn/end events establish a result; running=false is not success. */
export function latestCompletion(records){
 let excerpt='',latest=null;
 const events=(Array.isArray(records)?records:[]).filter(row=>row?.type==='event').map(row=>row.event).filter(Boolean).sort((a,b)=>a.seq-b.seq);
 for(const event of events){
  if(event.type==='turn/start')excerpt='';
  if(event.type==='assistant/message')excerpt=preview(event.data?.message?.content)||excerpt;
  const kind=event.data?.reason?.kind;
  if(event.type!=='turn/end'||!Object.hasOwn(DETAILS,kind)||PENDING.has(kind)||!Number.isSafeInteger(event.seq)||event.seq<0||!time(event.time))continue;
  latest={seq:event.seq,occurredAt:time(event.time),kind,excerpt};
 }
 return latest;
}

/** Passive, durable history + local acknowledgement, independent of the main view. */
export function createNotificationModel(ctx,options={}){
 const listeners=new Set(),records=new Map(),fingerprints=new Map(),requests=new Map(),queue=new Set(),failures=new Set(),unsupported=new Set(),running=new Map(),awaitingEnd=new Map();
 const now=options.now||Date.now;
 let storage=options.storage;
 if(storage===undefined)try{storage=globalThis.localStorage;}catch{}
 let storageError='',since=now(),state={open:false,busyId:null,error:''},snapshot,publishedSnapshot,stops=[],timer,actionEpoch=0,disposed=false,started=false;
 try{
  const saved=JSON.parse(storage?.getItem(STORAGE_KEY)||'null');
  if(saved?.version===1){
   if(Number.isFinite(saved.since)&&saved.since>0)since=saved.since;
   for(const item of (Array.isArray(saved.records)?saved.records:[]).slice(0,MAX_RECORDS)){
    if(text(item.id)&&Number.isSafeInteger(item.seq)&&item.seq>=0&&time(item.occurredAt)>0&&Object.hasOwn(DETAILS,item.kind)&&!PENDING.has(item.kind))
     records.set(item.id,{seq:item.seq,occurredAt:time(item.occurredAt),kind:item.kind,excerpt:text(item.excerpt).slice(0,180),unread:item.unread===true});
   }
  }
 }catch{}
 function persist(){
  const entries=[...records].sort((a,b)=>b[1].occurredAt-a[1].occurredAt).slice(0,MAX_RECORDS);
  records.clear();for(const [id,record]of entries)records.set(id,record);
  try{storage?.setItem(STORAGE_KEY,JSON.stringify({version:1,since,records:entries.map(([id,record])=>({id,...record}))}));}catch{storageError='通知已读取，但本机存储不可用，刷新后已读状态可能丢失。';}
 }
 function sources(){return [(ctx.uiSession||ctx.get?.('uiSession'))?.sessionStatus,ctx.sessions?.list,ctx.workspaces?.list];}
 function roster(){
  const [statusSource,sessionSource,workspaceSource]=sources();
  if(!isSource(sessionSource)||!isSource(workspaceSource))return {available:false,rows:[],statuses:new Map(),phase:'pending'};
  const list=sessionSource.getSnapshot(),workspaces=workspaceSource.getSnapshot(),statuses=isSource(statusSource)?statusSource.getSnapshot():new Map();
  const archived=new Set(workspaces?.archivedSessionIds||[]),titles=new Map();
  for(const workspace of workspaces?.items||[])for(const id of workspace.sessionIds||[])titles.set(id,text(workspace.title));
  const rows=[...new Set(list?.ids||[])].map(id=>list.byId?.[id]).filter(row=>row?.id&&!row.blank&&row.origin!=='subagent'&&!archived.has(row.id));
  return {available:typeof ctx.uiWorkspace?.openSession==='function',rows,statuses:statuses instanceof Map?statuses:new Map(),phase:list?.phase,titles};
 }
 function refresh(){
  if(disposed)return;
  let items=[],available=false,error=state.error;
  try{
   const data=roster();available=data.available;
   if(available)items=data.rows.map(row=>{
    const status=data.statuses.get(row.id),pending=status?.pendingInteraction?.kind,record=records.get(row.id);
    if(!PENDING.has(pending)&&!record)return null;
    const kind=PENDING.has(pending)?pending:record.kind;
    return {id:row.id,title:text(row.title)||text(row.projectionValues?.title)||'未命名聊天',workspaceTitle:data.titles.get(row.id)||'',kind,detail:DETAILS[kind],excerpt:PENDING.has(pending)?DETAILS[kind]:record.excerpt,unread:PENDING.has(pending)||record?.unread===true,occurredAt:PENDING.has(pending)?time(row.updatedAt):record.occurredAt};
   }).filter(Boolean).sort((a,b)=>Number(b.unread)-Number(a.unread)||b.occurredAt-a.occurredAt||a.id.localeCompare(b.id));
  }catch{available=false;error='通知暂时无法读取，请稍后重试。';}
  if(!error&&storageError)error=storageError;
  if(!error&&failures.size)error='部分完成记录暂时无法读取，稍后会自动重试。';
  const loading=requests.size>0||queue.size>0;
  const notice=unsupported.size?`${unsupported.size} 个旧版会话无法读取历史记录，其余通知正常。`:'';
  if(snapshot&&snapshot.open===state.open&&snapshot.busyId===state.busyId&&snapshot.error===error&&snapshot.available===available&&snapshot.loading===loading&&snapshot.notice===notice&&sameItems(snapshot.items,items))return;
  snapshot=Object.freeze({...state,error,available,loading,notice,count:items.filter(item=>item.unread).length,items:Object.freeze(items.map(item=>Object.freeze(item)))});
 }
 function publish(){
  if(disposed)return;
  refresh();if(snapshot===publishedSnapshot)return;
  publishedSnapshot=snapshot;for(const listener of [...listeners])listener();
 }
 function enqueue(id){if(!disposed){queue.add(id);}}
 function readMethod(){return ctx.remote?.session?.events||ctx.remote?.session?.page;}
 function pump(){
  if(disposed||!started||typeof readMethod()!=='function')return;
  for(const id of [...queue]){
   if(requests.size>=3)break;
   if(requests.has(id))continue;
   queue.delete(id);const controller=new AbortController();requests.set(id,controller);
   Promise.resolve().then(()=>readMethod().call(ctx.remote.session,{address:{kind:'session',sessionId:id},maxMessages:50,turnWindow:{minMessages:1,minTurns:2}},controller.signal)).then(result=>{
    if(disposed||controller.signal.aborted)return;
    if(result?.ok===false)throw result.error||new Error('history unavailable');
    const page=result?.ok===true?result.value:result;
    if(!Array.isArray(page?.records))throw new Error('invalid history');
    failures.delete(id);unsupported.delete(id);
    const latest=latestCompletion(page.records),previous=records.get(id);
    if(latest&&awaitingEnd.has(id)&&latest.seq>awaitingEnd.get(id))awaitingEnd.delete(id);
    if(latest&&(!previous||latest.seq>previous.seq)){
     const hostUnread=roster().statuses.get(id)?.completionUnread===true;
     records.set(id,{...latest,unread:hostUnread||latest.occurredAt>=since});persist();
    }
   }).catch(error=>{
    if(disposed||controller.signal.aborted)return;
    if(error?.code==='gateway/internal'&&/Session migration from v\d+ to v\d+ refuses/.test(error.message||'')){unsupported.add(id);failures.delete(id);}
    else failures.add(id);
   }).finally(()=>{
    if(requests.get(id)===controller)requests.delete(id);
    if(!disposed){pump();publish();}
   });
  }
  publish();
 }
 function synchronize(force=false){
  if(disposed)return;
  try{
   const data=roster();
   if(typeof readMethod()==='function'){
    const sorted=[...data.rows].sort((a,b)=>time(b.updatedAt)-time(a.updatedAt));
    const initial=new Set(sorted.map(row=>row.id));
    for(const row of sorted){
     const status=data.statuses.get(row.id),fingerprint=`${time(row.updatedAt)}:${status?.running??row.running??false}:${status?.completionUnread===true}`;
     const previous=fingerprints.get(row.id),isRunning=(status?.running??row.running)===true;
     if(running.get(row.id)===true&&!isRunning)awaitingEnd.set(row.id,records.get(row.id)?.seq??-1);
     running.set(row.id,isRunning);
     if((previous===undefined&&initial.has(row.id))||(previous!==undefined&&previous!==fingerprint)||(force&&initial.has(row.id)))enqueue(row.id);
     fingerprints.set(row.id,fingerprint);
    }
    if(data.phase==='ready'){
     const visible=new Set(data.rows.map(row=>row.id));
     for(const id of fingerprints.keys())if(!visible.has(id)){fingerprints.delete(id);running.delete(id);awaitingEnd.delete(id);queue.delete(id);failures.delete(id);unsupported.delete(id);requests.get(id)?.abort();}
    }
   }
  }catch{}
  pump();publish();
 }
 function start(){
  if(started||disposed)return;started=true;persist();
  try{for(const source of sources())if(isSource(source))stops.push(source.subscribe(()=>synchronize()));}catch{state.error='通知暂时无法读取，请稍后重试。';}
  synchronize();
  // Covers reconnects and the small gap between a running-state update and the
  // durable turn/end write. Reads are passive; no Session/Agent is activated.
  timer=setInterval(()=>{
   try{for(const row of [...roster().rows].sort((a,b)=>time(b.updatedAt)-time(a.updatedAt)).slice(0,6))enqueue(row.id);for(const id of failures)enqueue(id);for(const id of awaitingEnd.keys())enqueue(id);}catch{}
   pump();
  },options.pollMs||30000);timer?.unref?.();
 }
 function close(){if(disposed||!state.open)return;actionEpoch++;state={...state,open:false,busyId:null,error:''};publish();}
 refresh();publishedSnapshot=snapshot;
 return {
  getSnapshot(){refresh();return snapshot;},
  subscribe(listener){if(disposed)return()=>{};const registered=()=>listener();listeners.add(registered);start();return()=>listeners.delete(registered);},
  open(){if(disposed||state.open)return;actionEpoch++;state={...state,open:true,busyId:null,error:''};start();synchronize(true);},
  close,
  markAllRead(){if(disposed)return;for(const record of records.values())record.unread=false;persist();publish();},
  async select(sessionId){
   if(disposed||!state.open||state.busyId!==null)return false;
   publish();if(!snapshot.available||!snapshot.items.some(item=>item.id===sessionId))return false;
   const selectedSeq=records.get(sessionId)?.seq,epoch=++actionEpoch;state.busyId=sessionId;state.error='';publish();
   try{
    await ctx.uiWorkspace.openSession(sessionId);
    if(!disposed&&epoch===actionEpoch){
     const record=records.get(sessionId);
     // A newer completion arriving while navigation awaits stays unread.
     if(record&&record.seq===selectedSeq){record.unread=false;persist();}
     state.busyId=null;publish();
    }
    return true;
   }catch(error){if(!disposed&&epoch===actionEpoch){state.busyId=null;state.error=text(error?.message)||'无法打开会话，请重试。';publish();}return false;}
  },
  dispose(){
   if(disposed)return;actionEpoch++;disposed=true;clearInterval(timer);for(const stop of stops.splice(0))stop();
   for(const request of requests.values())request.abort();requests.clear();queue.clear();listeners.clear();
   snapshot=Object.freeze({...snapshot,open:false,busyId:null,loading:false});
  },
 };
}
