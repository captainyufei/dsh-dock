const text=value=>typeof value==='string'?value.trim():'';
const isSource=value=>typeof value?.getSnapshot==='function'&&typeof value?.subscribe==='function';
const failure=(code,message,cause)=>Object.assign(new Error(message,cause===undefined?undefined:{cause}),{name:'WindowChromeActionError',code});

/** Global chrome actions over real, already-existing Host Sessions and tabs. */
export function createWindowChromeModel(ctx,{presentation,motion,timeoutMs=6000}={}){
 const {sessions,workspaces,layout,uiWorkspace,sidebarRight:sidebar,sidebarRightTabs:types}=ctx;
 const registrySource=typeof types?.subscribe==='function'?{subscribe:listener=>types.subscribe(listener)}:null;
 const sources=[...new Set([sessions?.list,workspaces?.list,layout?.panelInfo,sidebar?.mounted,sidebar?.openTabs,presentation,registrySource].filter(source=>typeof source?.subscribe==='function'))];
 const listeners=new Set();
 const duration=Number.isFinite(timeoutMs)&&timeoutMs>=0?timeoutMs:6000;
 let subscriptions=[],snapshot,publishedSnapshot,pending=null,disposed=false;
 const read=(source,fallback)=>{try{return source?.getSnapshot?.()??fallback;}catch{return fallback;}};
 const panel=()=>read(layout?.panelInfo,{activePanelId:undefined}).activePanelId;
 function catalog(){
  const list=read(sessions?.list,{ids:[],byId:{}}),workspace=read(workspaces?.list,{items:[],archivedSessionIds:[]});
  return {list,workspace,archived:new Set(workspace.archivedSessionIds||[])};
 }
 function contextOf({list,archived}){
  const candidates=Object.values(list.byId||{}).filter(summary=>summary&&typeof summary.id==='string'&&(summary.retainedBy?.mainView||0)>0&&!archived.has(summary.id)&&(!summary.blank||panel()===null));
  const mounted=read(sidebar?.mounted,null);
  return candidates.find(summary=>summary.id===mounted)||candidates[0]||null;
 }
 function capable(){
  if(disposed||typeof sidebar?.openTab!=='function'||typeof sidebar?.commandTarget!=='function'||typeof sidebar?.toggleFullscreen!=='function'||!isSource(sidebar?.mounted)||!isSource(presentation)||typeof layout?.selectPanel!=='function')return false;
  try{return Boolean(typeof types?.get==='function'?types.get('guide'):types?.entries?.().find(entry=>entry.kind==='guide'));}catch{return false;}
 }
 function visibleExpanded(){
  const mounted=read(sidebar?.mounted,null),shown=read(presentation,null);
  return !disposed&&panel()===null&&typeof mounted==='string'&&mounted.length>0&&shown?.sessionId===mounted&&shown.expanded===true;
 }
 function currentTabSession(data=catalog()){
  const mounted=read(sidebar?.mounted,null);
  return panel()===null&&typeof mounted==='string'&&mounted?mounted:contextOf(data)?.id??null;
 }
 function hasTabsFor(id){const tabs=read(sidebar?.openTabs,null);return typeof id==='string'&&Array.isArray(tabs)&&tabs.some(tab=>tab?.sessionId===id);}
 function visibleExistingSession(id,data=catalog()){
  const summary=data.list.byId?.[id];
  return panel()===null&&typeof id==='string'&&read(sidebar?.mounted,null)===id&&summary?.id===id&&!summary.blank&&!data.archived.has(id);
 }
 function expandable(){return isSource(sidebar?.mounted)&&isSource(sidebar?.openTabs)&&isSource(presentation)&&typeof sidebar?.commandTarget==='function'&&typeof sidebar?.toggleExpanded==='function'&&typeof sidebar?.isExpanded==='function';}
 function refresh(){
  const data=catalog(),contextSummary=contextOf(data),workspaceTitles=new Map();
  for(const workspace of data.workspace.items||[])for(const id of workspace.sessionIds||[])if(!workspaceTitles.has(id))workspaceTitles.set(id,text(workspace.title)||text(workspace.name));
  const seen=new Set(),rows=[];
  for(const id of [...(data.list.ids||[]),...Object.keys(data.list.byId||{})]){
   if(seen.has(id))continue;seen.add(id);
   const summary=data.list.byId?.[id];
   if(!summary||summary.id!==id||summary.blank||data.archived.has(id))continue;
   rows.push({id,title:text(summary.title)||text(summary.projectionValues?.title)||'未命名会话',workspaceTitle:workspaceTitles.get(id)||''});
  }
  const context=contextSummary?{id:contextSummary.id,title:text(contextSummary.title)||text(contextSummary.projectionValues?.title)||'未命名会话'}:null;
  const currentId=currentTabSession(data),available=capable(),busy=Boolean(pending&&!disposed),expanded=visibleExpanded(),hasTabs=!disposed&&hasTabsFor(currentId),canExpand=!disposed&&(hasTabs||visibleExistingSession(currentId,data));
  const sameContext=snapshot&&(snapshot.context===null||context===null?snapshot.context===context:snapshot.context.id===context.id&&snapshot.context.title===context.title);
  const sameRows=snapshot&&snapshot.sessions.length===rows.length&&rows.every((row,index)=>{const previous=snapshot.sessions[index];return row.id===previous.id&&row.title===previous.title&&row.workspaceTitle===previous.workspaceTitle;});
  if(snapshot&&snapshot.available===available&&snapshot.busy===busy&&snapshot.expanded===expanded&&snapshot.hasTabs===hasTabs&&snapshot.canExpand===canExpand&&sameContext&&sameRows)return;
  snapshot=Object.freeze({context:context&&Object.freeze(context),sessions:Object.freeze(rows.map(row=>Object.freeze(row))),available,busy,expanded,hasTabs,canExpand});
 }
 function changed(){
  refresh();if(snapshot===publishedSnapshot)return;publishedSnapshot=snapshot;
  // A consumer must not turn an already-issued Host action into a sync failure.
  for(const listener of [...listeners])try{listener();}catch{}
 }
 function mutate(action){
  let finish;
  try{if(typeof motion?.prepare==='function')finish=motion.prepare();}
  catch(reason){throw failure('motion-failed','窗口过渡准备失败，未执行右侧栏操作。',reason);}
  try{return action();}
  finally{try{if(typeof finish==='function')finish();}catch{}}
 }
 function abortReason(operation){return operation.controller.signal.reason||failure('cancelled','已取消窗口操作。');}
 function collapseGuard(operation){
  if(disposed||operation.controller.signal.aborted)throw abortReason(operation);
  if(!isSource(sidebar?.mounted)||!isSource(presentation)||typeof sidebar?.commandTarget!=='function'||typeof sidebar?.toggleExpanded!=='function'||typeof sidebar?.isExpanded!=='function')throw failure('unavailable','原生右侧栏暂时无法收起。');
  if(panel()!==null)throw failure('cancelled','页面已切换，已停止收起右侧栏。');
  const mounted=read(sidebar.mounted,null),shown=read(presentation,null);
  if(mounted!==operation.id&&!(operation.issued&&mounted==null&&(!shown?.expanded||shown.sessionId===operation.id)))throw failure('cancelled','会话面板已切换，已停止收起右侧栏。');
  if(shown?.expanded&&shown.sessionId!==operation.id)throw failure('cancelled','右侧栏已切换，已停止收起操作。');
 }
 function expandGuard(operation){
  if(disposed||operation.controller.signal.aborted)throw abortReason(operation);
  if(!expandable())throw failure('unavailable','原生右侧栏暂时无法展开。');
  const data=catalog(),retained=contextOf(data)?.id??null,mounted=read(sidebar.mounted,null);
  if(operation.catalogBound){
   const summary=data.list.byId?.[operation.id];
   if(!summary||data.archived.has(operation.id)||summary.blank&&!operation.allowBlank)throw failure('session-unavailable','原会话已不可用，未展开右侧栏。');
   if(retained!==operation.id)throw failure('cancelled','会话已切换，已停止展开右侧栏。');
  }
  if(operation.hadTabs&&!hasTabsFor(operation.id))throw failure('cancelled','原标签页已关闭，未展开右侧栏。');
  if(!operation.hadTabs&&!visibleExistingSession(operation.id,data))throw failure('cancelled','原会话已切换或不可用，未展开右侧栏。');
  if(!operation.navigationIssued){
   if(panel()!==operation.initialPanel||mounted!==operation.initialMounted)throw failure('cancelled','页面或会话已切换，已停止展开右侧栏。');
   return;
  }
  if(panel()!==null)throw failure('cancelled','页面已切换，已停止展开右侧栏。');
  if(mounted===operation.id)operation.surfaceReady=true;
  else if(operation.surfaceReady||mounted!=null)throw failure('cancelled','会话面板已切换，已停止展开右侧栏。');
 }
 function guard(operation){
  if(operation.kind==='collapse'){collapseGuard(operation);return;}
  if(operation.kind==='expand'){expandGuard(operation);return;}
  if(disposed||operation.controller.signal.aborted)throw abortReason(operation);
  if(!capable())throw failure('unavailable','原生标签页功能暂时不可用，请检查右侧栏插件。');
  if(operation.id===undefined)return;
  const data=catalog(),summary=data.list.byId?.[operation.id];
  if(!summary||summary.id!==operation.id||data.archived.has(operation.id)||summary.blank&&!operation.allowBlank)throw failure('session-unavailable','所选会话已不可用，请重新选择已有会话。');
  if(!operation.navigationIssued)return;
  if(panel()!==null)throw failure('cancelled','页面已切换，已取消新建标签页。');
  const retained=contextOf(data)?.id??null;
  if(retained===operation.id)operation.retainedReady=true;
  else if(operation.retainedReady||retained!==null&&retained!==operation.initialContext)throw failure('cancelled','会话已切换，已取消新建标签页。');
  const mounted=read(sidebar.mounted,null);
  if(mounted===operation.id)operation.surfaceReady=true;
  else if(operation.surfaceReady||mounted!=null&&mounted!==operation.initialMounted&&mounted!==operation.initialContext)throw failure('cancelled','会话面板已切换，已取消新建标签页。');
 }
 function waitFor(operation,condition,message){
  return new Promise((resolve,reject)=>{
   let settled=false,timer=null;const stops=[];
   const cleanup=()=>{if(timer!==null)clearTimeout(timer);operation.controller.signal.removeEventListener('abort',abort);for(const stop of stops.splice(0))stop();};
   const finish=(ok,value)=>{if(settled)return;settled=true;cleanup();(ok?resolve:reject)(value);};
   const abort=()=>finish(false,abortReason(operation));
   const check=()=>{if(settled)return;try{guard(operation);const result=condition();if(result)finish(true,result);}catch(reason){finish(false,reason);}};
   operation.controller.signal.addEventListener('abort',abort,{once:true});
   const remaining=Math.max(0,operation.deadline-Date.now());
   timer=setTimeout(()=>finish(false,failure('timeout',message)),remaining);
   try{
    for(const source of sources){
     if(settled)break;
     const stop=source.subscribe(check);
     if(settled)stop();else stops.push(stop);
    }
    check();
   }catch(reason){finish(false,reason);}
  });
 }
 function awaitAction(operation,value,message){
  if(typeof value?.then!=='function')return Promise.resolve();
  let reason,rejected=false;
  // Attach both branches even after a timeout so a late failure is observed.
  const result=Promise.resolve(value).then(()=>{},error=>{rejected=true;reason=error;});
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(ok,value)=>{if(settled)return;settled=true;clearTimeout(timer);operation.controller.signal.removeEventListener('abort',abort);(ok?resolve:reject)(value);};
   const abort=()=>finish(false,abortReason(operation));
   const timer=setTimeout(()=>finish(false,failure('timeout',message)),Math.max(0,operation.deadline-Date.now()));
   operation.controller.signal.addEventListener('abort',abort,{once:true});
   if(operation.controller.signal.aborted)abort();
   result.then(()=>{if(rejected)finish(false,reason??failure('action-failed','原生标签页操作失败，请重试。'));else finish(true);});
  });
 }
 async function run(operation,{fullscreen=false,sessionId}={}){
  guard(operation);
  const initial=getSnapshot(),explicit=sessionId!==undefined;
  const id=explicit?sessionId:initial.context?.id;
  if(typeof id!=='string'||!id)throw failure('choose-session','请先选择一个已有会话，再新建标签页。');
  const data=catalog(),summary=data.list.byId?.[id];
  const allowBlank=Boolean(summary?.blank&&initial.context?.id===id&&panel()===null);
  if(!summary||summary.id!==id||data.archived.has(id)||summary.blank&&!allowBlank)throw failure('session-unavailable','请选择一个可用的已有会话。');
  Object.assign(operation,{id,allowBlank,initialContext:initial.context?.id??null,initialMounted:read(sidebar.mounted,null),retainedReady:initial.context?.id===id,surfaceReady:false,navigationIssued:false});
  if(id!==initial.context?.id){
   if(typeof uiWorkspace?.openSession!=='function')throw failure('unavailable','当前无法打开所选会话。');
   await awaitAction(operation,uiWorkspace.openSession(id),'打开所选会话超时，请重试。');
  }else if(panel()!==null)layout.selectPanel(null);
  operation.navigationIssued=true;
  await waitFor(operation,()=>{
   const target=sidebar.commandTarget(null);
   return operation.retainedReady&&read(sidebar.mounted,null)===id&&target?.sessionId===id;
  },'会话面板准备超时，尚未新建标签页，请重试。');
  guard(operation);
  await awaitAction(operation,mutate(()=>sidebar.openTab('guide',{revealIfOpened:false})),'新建标签页结果尚未确认，请检查右侧栏。');
  operation.opened=true;
  await waitFor(operation,()=>{const shown=read(presentation,null);return shown?.sessionId===id&&shown.expanded;},'标签页入口尚未显示，请检查右侧栏。');
  guard(operation);
  if(fullscreen){
   if(!read(presentation,null)?.fullscreen){
    const target=sidebar.commandTarget(null);
    if(target?.sessionId!==id)throw failure('cancelled','会话面板已切换，完整视图未切换。');
    await awaitAction(operation,sidebar.toggleFullscreen(target),'完整视图切换超时，请检查右侧栏。');
   }
   await waitFor(operation,()=>{const shown=read(presentation,null);return shown?.sessionId===id&&shown.expanded&&shown.fullscreen;},'完整视图切换超时，请检查右侧栏。');
   guard(operation);
  }
  return Object.freeze({sessionId:id,fullscreen:Boolean(fullscreen)});
 }
 async function collapse(operation){
  // The identity was captured on activation, before the scheduled action. A
  // newer Session must never inherit an older button press's toggle.
  collapseGuard(operation);
  if(!visibleExpanded()||!sidebar.isExpanded())return Object.freeze({collapsed:false});
  const target=sidebar.commandTarget(null);
  if(target?.sessionId!==operation.id)throw failure('cancelled','右侧栏目标已变化，未执行收起操作。');
  // Recheck after the native target lookup in case a provider synchronously
  // invalidated presentation while resolving its current target.
  collapseGuard(operation);
  if(!visibleExpanded()||!sidebar.isExpanded())return Object.freeze({collapsed:false});
  collapseGuard(operation);
  const result=mutate(()=>sidebar.toggleExpanded());
  operation.issued=true;
  await awaitAction(operation,result,'已请求收起，但右侧栏状态尚未确认，请检查。');
  await waitFor(operation,()=>{
   const shown=read(presentation,null);
   return read(sidebar.mounted,null)==null||!shown?.expanded||shown.sessionId!==operation.id;
  },'已请求收起，但右侧栏状态尚未确认，请检查。');
  collapseGuard(operation);
  return Object.freeze({sessionId:operation.id,collapsed:true});
 }
 async function expand(operation){
  // Reopen the native dock layout itself. Existing pages keep their pane and
  // mode; an empty visible Session lets the Host seed its own default page.
  expandGuard(operation);
  if(operation.initialPanel!==null){
   if(typeof layout?.selectPanel!=='function')throw failure('unavailable','当前无法返回原会话以展开右侧栏。');
   layout.selectPanel(null);
  }
  operation.navigationIssued=true;
  await waitFor(operation,()=>{
   const target=sidebar.commandTarget(null);
   return read(sidebar.mounted,null)===operation.id&&target?.sessionId===operation.id;
  },'原会话面板准备超时，尚未展开右侧栏，请重试。');
  expandGuard(operation);
  const target=sidebar.commandTarget(null);
  if(target?.sessionId!==operation.id)throw failure('cancelled','右侧栏目标已变化，未执行展开操作。');
  expandGuard(operation);
  const expanded=sidebar.isExpanded();
  // A stale DOM snapshot can still describe a closed panel after the native
  // store already opened it. Never turn that delayed confirmation into a close.
  expandGuard(operation);
  if(!expanded){
   const result=mutate(()=>sidebar.toggleExpanded());operation.issued=true;
   await awaitAction(operation,result,'已请求展开，但右侧栏状态尚未确认，请检查。');
  }
  await waitFor(operation,()=>{
   const shown=read(presentation,null);
   return shown?.sessionId===operation.id&&shown.expanded===true&&sidebar.isExpanded()===true;
  },'已请求展开，但右侧栏状态尚未确认，请检查。');
  expandGuard(operation);
  return Object.freeze({sessionId:operation.id,expanded:true});
 }
 function getSnapshot(){refresh();return snapshot;}
 refresh();publishedSnapshot=snapshot;
 return {
  getSnapshot,
  subscribe(listener){
   if(disposed)return()=>{};
   const registered=()=>listener();listeners.add(registered);
   if(listeners.size===1){
    try{
     for(const source of sources){
      if(disposed||!listeners.size)break;
      const stop=source.subscribe(changed);
      if(disposed||!listeners.size)stop();else subscriptions.push(stop);
     }
     if(!disposed&&listeners.size)changed();
    }
    catch(reason){for(const stop of subscriptions.splice(0))stop();listeners.delete(registered);throw reason;}
   }
   return()=>{listeners.delete(registered);if(!listeners.size)for(const stop of subscriptions.splice(0))stop();};
  },
  openTab(options={}){
   if(disposed)return Promise.reject(failure('closed','窗口工具已关闭。'));
   if(pending)return pending.kind==='open'?pending.promise:Promise.reject(failure('busy','窗口操作正在进行，请稍后再新建标签页。'));
   const request={fullscreen:Boolean(options.fullscreen),...(options.sessionId===undefined?{}:{sessionId:options.sessionId})};
   const operation={kind:'open',controller:new AbortController(),deadline:Date.now()+duration,id:undefined,navigationIssued:false,opened:false};
   operation.promise=Promise.resolve().then(()=>run(operation,request)).catch(reason=>{
    if(operation.opened){
     const prefix=request.fullscreen?'标签页已打开，但完整视图未切换。':'标签页已打开，但入口显示尚未确认。';
     throw failure(request.fullscreen?'partial-fullscreen':'partial-open',prefix+(reason?.message||'请检查右侧栏。'),reason);
    }
    throw reason;
   }).finally(()=>{if(pending===operation)pending=null;changed();});
   pending=operation;changed();return operation.promise;
  },
  collapsePanel(){
   if(disposed)return Promise.reject(failure('closed','窗口工具已关闭。'));
   if(pending)return pending.kind==='collapse'?pending.promise:Promise.reject(failure('busy','窗口操作正在进行，请稍后再收起右侧栏。'));
   if(!visibleExpanded())return Promise.resolve(Object.freeze({collapsed:false}));
   const operation={kind:'collapse',id:read(sidebar.mounted,null),controller:new AbortController(),deadline:Date.now()+duration,issued:false};
   operation.promise=Promise.resolve().then(()=>collapse(operation)).finally(()=>{if(pending===operation)pending=null;changed();});
   pending=operation;changed();return operation.promise;
  },
  expandPanel(){
   if(disposed)return Promise.reject(failure('closed','窗口工具已关闭。'));
   if(pending)return pending.kind==='expand'?pending.promise:Promise.reject(failure('busy','窗口操作正在进行，请稍后再展开右侧栏。'));
   const data=catalog(),id=currentTabSession(data),hadTabs=hasTabsFor(id);
   if(!hadTabs&&!visibleExistingSession(id,data))return Promise.resolve(Object.freeze({expanded:false}));
   const context=contextOf(data),summary=data.list.byId?.[id];
   const operation={kind:'expand',id,hadTabs,initialPanel:panel(),initialMounted:read(sidebar?.mounted,null),catalogBound:context?.id===id,allowBlank:Boolean(summary?.blank&&panel()===null),controller:new AbortController(),deadline:Date.now()+duration,navigationIssued:false,surfaceReady:false,issued:false};
   operation.promise=Promise.resolve().then(()=>expand(operation)).finally(()=>{if(pending===operation)pending=null;changed();});
   pending=operation;changed();return operation.promise;
  },
  dispose(){
   if(disposed)return;disposed=true;
   pending?.controller.abort(failure('closed','窗口工具已关闭，已取消等待。'));
   for(const stop of subscriptions.splice(0))stop();listeners.clear();refresh();publishedSnapshot=snapshot;
  },
 };
}
