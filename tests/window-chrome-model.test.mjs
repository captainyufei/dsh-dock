import test from 'node:test';
import assert from 'node:assert/strict';
import {createWindowChromeModel} from '../src/window-chrome-model.js';

function source(initial){
 let value=initial;const listeners=new Set();
 return {getSnapshot:()=>value,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},set(next){value=next;for(const listener of [...listeners])listener();},count:()=>listeners.size};
}
const summary=(id,title,extra={})=>({id,title,blank:false,retainedBy:{},...extra});
async function flush(){for(let index=0;index<8;index++)await Promise.resolve();}
function fixture({panelId='home',retained='a',autoMount=true,autoPresent=true,autoFullscreen=true,autoCollapse=true,timeoutMs=1000,initialFullscreen=false,initialExpanded=initialFullscreen,byId,archived=[],tabs=[],motion}={}){
 const calls=[];
 const sessions=source({ids:['a','b'],byId:byId||{a:summary('a','Alpha',{retainedBy:{mainView:retained==='a'?1:0}}),b:summary('b','Beta',{retainedBy:{mainView:retained==='b'?1:0}})}});
 const workspaces=source({items:[{workspaceId:'one',title:'Workspace One',sessionIds:['a']},{workspaceId:'two',title:'Workspace Two',sessionIds:['b']}],archivedSessionIds:archived});
 const panel=source({activePanelId:panelId});
 const mounted=source(panelId===null?retained:undefined),openTabs=source(tabs);
 const presentation=source({sessionId:panelId===null?retained:null,expanded:initialExpanded,fullscreen:initialFullscreen});
 const registry=source([{kind:'guide',title:'开始'}]);
 let commandReady=true,nativeExpanded=initialExpanded;
 const retainedId=()=>Object.values(sessions.getSnapshot().byId).find(item=>(item.retainedBy?.mainView||0)>0)?.id;
 function select(id){
  const state=sessions.getSnapshot();
  sessions.set({...state,byId:Object.fromEntries(Object.entries(state.byId).map(([key,item])=>[key,{...item,retainedBy:{...item.retainedBy,mainView:key===id?1:0}}]))});
 }
 function maybeMount(){if(autoMount)mounted.set(retainedId());}
 const ctx={sessions:{list:sessions,create(){throw new Error('Session creation is forbidden');}},workspaces:{list:workspaces},layout:{panelInfo:panel,selectPanel(id){calls.push(['panel',id]);panel.set({activePanelId:id});if(id===null)maybeMount();}},uiWorkspace:{openSession(id){calls.push(['session',id]);select(id);panel.set({activePanelId:null});maybeMount();},startSession(){throw new Error('startSession is forbidden');}},sidebarRight:{
  mounted,openTabs,
  commandTarget(){return commandReady&&mounted.getSnapshot()?{sessionId:mounted.getSnapshot(),paneId:'pane',host:'dock'}:undefined;},
  openTab(kind,options){
   calls.push(['tab',kind,options]);
   nativeExpanded=true;
   openTabs.set([...openTabs.getSnapshot(),{sessionId:mounted.getSnapshot(),kind}]);
   if(autoPresent)presentation.set({sessionId:mounted.getSnapshot(),expanded:true,fullscreen:presentation.getSnapshot().fullscreen});
  },
  toggleFullscreen(target){calls.push(['fullscreen',target.sessionId]);if(autoFullscreen)presentation.set({sessionId:target.sessionId,expanded:true,fullscreen:true});},
  isExpanded:()=>nativeExpanded,
  toggleExpanded(){calls.push(['collapse',mounted.getSnapshot()]);nativeExpanded=!nativeExpanded;if(autoCollapse)presentation.set({sessionId:mounted.getSnapshot(),expanded:nativeExpanded,fullscreen:presentation.getSnapshot().fullscreen});},
 },sidebarRightTabs:{get:kind=>registry.getSnapshot().find(item=>item.kind===kind),entries:registry.getSnapshot,subscribe:registry.subscribe}};
 const model=createWindowChromeModel(ctx,{presentation,motion,timeoutMs});
 return {model,ctx,calls,sessions,workspaces,panel,mounted,openTabs,presentation,registry,select,nativeExpanded:value=>{nativeExpanded=value;},commandReady:value=>{commandReady=value;openTabs.set([...openTabs.getSnapshot()]);},sources:[sessions,workspaces,panel,mounted,openTabs,presentation,registry]};
}

test('startup only reads real catalogs, freezes stable presentation and never performs navigation or creation',()=>{
 const f=fixture(),snapshot=f.model.getSnapshot();
 assert.deepEqual(snapshot,{context:{id:'a',title:'Alpha'},sessions:[{id:'a',title:'Alpha',workspaceTitle:'Workspace One'},{id:'b',title:'Beta',workspaceTitle:'Workspace Two'}],available:true,busy:false,expanded:false,hasTabs:false,canExpand:false});
 assert.equal(f.model.getSnapshot(),snapshot);assert.deepEqual(f.calls,[]);
 assert.throws(()=>snapshot.context.title='changed',TypeError);assert.throws(()=>snapshot.sessions.push({}),TypeError);
 f.model.dispose();
});

for(const panelId of ['home','plugins','schedules',null])test(`opens the real guide from ${panelId??'conversation'} without creating or reopening the retained Session`,async()=>{
 const f=fixture({panelId});
 const result=await f.model.openTab();
 assert.deepEqual(result,{sessionId:'a',fullscreen:false});
 assert.deepEqual(f.calls,[...(panelId===null?[]:[['panel',null]]),['tab','guide',{revealIfOpened:false}]]);
 assert.equal(f.model.getSnapshot().busy,false);for(const item of f.sources)assert.equal(item.count(),0);
 f.model.dispose();
});

test('missing optional sidebar services do not break startup and give an explicit unavailable action error',async()=>{
 const f=fixture();
 const model=createWindowChromeModel({...f.ctx,sidebarRight:undefined,sidebarRightTabs:undefined},{presentation:f.presentation});
 assert.equal(model.getSnapshot().available,false);
 await assert.rejects(model.openTab(),error=>error.code==='unavailable'&&/原生标签页/.test(error.message));
 assert.deepEqual(f.calls,[]);model.dispose();f.model.dispose();
});

test('an absent retained context requests an existing Session instead of silently starting one',async()=>{
 const f=fixture({retained:null});
 assert.equal(f.model.getSnapshot().context,null);
 await assert.rejects(f.model.openTab(),error=>error.code==='choose-session'&&/选择一个已有会话/.test(error.message));
 assert.deepEqual(f.calls,[]);
 await f.model.openTab({sessionId:'b'});
 assert.deepEqual(f.calls,[['session','b'],['tab','guide',{revealIfOpened:false}]]);
 f.model.dispose();
});

test('picker excludes archived, blank and missing Sessions, and rechecks explicit selections before acting',async()=>{
 const f=fixture({retained:null,byId:{a:summary('a','Archived'),b:summary('b','Blank',{blank:true}),c:summary('c','',{projectionValues:{title:'Projected'}})},archived:['a']});
 assert.deepEqual(f.model.getSnapshot().sessions,[{id:'c',title:'Projected',workspaceTitle:''}]);
 for(const id of ['a','b','missing'])await assert.rejects(f.model.openTab({sessionId:id}),error=>error.code==='session-unavailable');
 assert.deepEqual(f.calls,[]);f.model.dispose();
});

test('a visible retained blank may open tools, while a hidden blank never becomes a picker context',async()=>{
 const byId={a:summary('a','Draft',{blank:true,retainedBy:{mainView:1}}),b:summary('b','Saved')};
 const visible=fixture({panelId:null,byId});
 assert.equal(visible.model.getSnapshot().context.id,'a');assert.deepEqual(visible.model.getSnapshot().sessions.map(item=>item.id),['b']);
 await visible.model.openTab();assert.deepEqual(visible.calls,[['tab','guide',{revealIfOpened:false}]]);visible.model.dispose();
 const hidden=fixture({panelId:'plugins',byId});
 assert.equal(hidden.model.getSnapshot().context,null);
 await assert.rejects(hidden.model.openTab(),/选择一个已有会话/);
 await assert.rejects(hidden.model.openTab({sessionId:'a'}),/可用的已有会话/);
 assert.deepEqual(hidden.calls,[]);hidden.model.dispose();
});

test('a late surface must match both mounted Session and the native command target before opening',async()=>{
 const f=fixture({autoMount:false});f.commandReady(false);
 const pending=f.model.openTab();await flush();
 assert.deepEqual(f.calls,[['panel',null]]);assert.equal(f.model.getSnapshot().busy,true);
 f.mounted.set('a');await flush();assert.equal(f.calls.length,1);
 f.commandReady(true);await pending;
 assert.deepEqual(f.calls.at(-1),['tab','guide',{revealIfOpened:false}]);
 for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

test('an explicitly selected different Session waits for its own surface rather than using the previous one',async()=>{
 const f=fixture({panelId:null,autoMount:false});
 const pending=f.model.openTab({sessionId:'b'});await flush();
 assert.deepEqual(f.calls,[['session','b']]);
 f.mounted.set('b');await pending;
 assert.deepEqual(f.calls,[['session','b'],['tab','guide',{revealIfOpened:false}]]);f.model.dispose();
});

test('double clicks share one pending Promise and one native tab admission',async()=>{
 const f=fixture({autoMount:false});
 const one=f.model.openTab(),two=f.model.openTab();assert.equal(one,two);
 await flush();f.mounted.set('a');await Promise.all([one,two]);
 assert.equal(f.calls.filter(call=>call[0]==='tab').length,1);assert.equal(f.model.getSnapshot().busy,false);f.model.dispose();
});

test('full view waits for real expanded presentation and acknowledges fullscreen only after the native mode changes',async()=>{
 const f=fixture({autoPresent:false,autoFullscreen:false});
 const pending=f.model.openTab({fullscreen:true});await flush();
 assert.equal(f.calls.filter(call=>call[0]==='tab').length,1);assert.equal(f.calls.some(call=>call[0]==='fullscreen'),false);
 f.presentation.set({sessionId:'a',expanded:true,fullscreen:false});await flush();
 assert.deepEqual(f.calls.at(-1),['fullscreen','a']);assert.equal(f.model.getSnapshot().busy,true);
 f.presentation.set({sessionId:'a',expanded:true,fullscreen:true});
 assert.deepEqual(await pending,{sessionId:'a',fullscreen:true});
 assert.equal(f.calls.filter(call=>call[0]==='fullscreen').length,1);f.model.dispose();
});

test('an already-fullscreen panel remains fullscreen without being toggled back',async()=>{
 const f=fixture({panelId:null,initialFullscreen:true});
 await f.model.openTab({fullscreen:true});
 assert.equal(f.calls.some(call=>call[0]==='fullscreen'),false);assert.equal(f.presentation.getSnapshot().fullscreen,true);f.model.dispose();
});

for(const kind of ['page','session','archive','provider'])test(`a user ${kind} change while waiting cancels before tab creation`,async()=>{
 const f=fixture({autoMount:false});const pending=f.model.openTab();await flush();
 if(kind==='page')f.panel.set({activePanelId:'plugins'});
 if(kind==='session')f.select('b');
 if(kind==='archive')f.workspaces.set({...f.workspaces.getSnapshot(),archivedSessionIds:['a']});
 if(kind==='provider')f.registry.set([]);
 await assert.rejects(pending);assert.equal(f.calls.some(call=>call[0]==='tab'),false);
 for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

test('navigation after opening reports the partial result and never performs a later fullscreen action',async()=>{
 const f=fixture({autoPresent:false});const pending=f.model.openTab({fullscreen:true});await flush();
 assert.equal(f.calls.filter(call=>call[0]==='tab').length,1);
 f.panel.set({activePanelId:'schedules'});
 await assert.rejects(pending,error=>error.code==='partial-fullscreen'&&/标签页已打开，但完整视图未切换/.test(error.message));
 assert.equal(f.calls.some(call=>call[0]==='fullscreen'),false);for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

test('surface timeout creates nothing, while fullscreen timeout explains that the tab already opened',async()=>{
 const notReady=fixture({autoMount:false,timeoutMs:5});
 await assert.rejects(notReady.model.openTab(),error=>error.code==='timeout'&&/尚未新建/.test(error.message));
 assert.equal(notReady.calls.some(call=>call[0]==='tab'),false);for(const item of notReady.sources)assert.equal(item.count(),0);notReady.model.dispose();
 const fullscreen=fixture({autoFullscreen:false,timeoutMs:5});
 await assert.rejects(fullscreen.model.openTab({fullscreen:true}),error=>error.code==='partial-fullscreen'&&/标签页已打开，但完整视图未切换/.test(error.message));
 assert.equal(fullscreen.calls.filter(call=>call[0]==='tab').length,1);for(const item of fullscreen.sources)assert.equal(item.count(),0);fullscreen.model.dispose();
});

test('disposal aborts readiness and frees temporary and consumer subscriptions without issuing a tab action',async()=>{
 const f=fixture({autoMount:false});const stop=f.model.subscribe(()=>{}),pending=f.model.openTab();await flush();
 assert.ok(f.sources.every(item=>item.count()>=1));
 f.model.dispose();f.model.dispose();
 await assert.rejects(pending,error=>error.code==='closed');
 assert.equal(f.calls.some(call=>call[0]==='tab'),false);for(const item of f.sources)assert.equal(item.count(),0);
 assert.equal(f.model.getSnapshot().busy,false);assert.equal(f.model.getSnapshot().available,false);stop();
 await assert.rejects(f.model.openTab(),error=>error.code==='closed');
});

test('disposal before the scheduled action leaves even the current page unchanged',async()=>{
 const f=fixture();const pending=f.model.openTab();f.model.dispose();
 await assert.rejects(pending,error=>error.code==='closed');assert.deepEqual(f.calls,[]);
});

test('an asynchronous native refusal is not mistaken for successful tab admission',async()=>{
 const f=fixture({panelId:null});
 f.ctx.sidebarRight.openTab=()=>Promise.reject(undefined);
 await assert.rejects(f.model.openTab(),error=>error.code==='action-failed');
 assert.equal(f.model.getSnapshot().busy,false);for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

test('an asynchronously pending native action is bounded and can be disposed without leaking waiters',async()=>{
 const f=fixture({panelId:null});let resolve;
 f.ctx.sidebarRight.openTab=()=>new Promise(yes=>{resolve=yes;});
 const pending=f.model.openTab();await flush();f.model.dispose();
 await assert.rejects(pending,error=>error.code==='closed');
 resolve();await flush();for(const item of f.sources)assert.equal(item.count(),0);
});

test('snapshots follow titles, workspaces and availability, share subscriptions, and an early reader cannot swallow updates',()=>{
 const f=fixture();let updates=0;
 const readEarly=f.sessions.subscribe(()=>f.model.getSnapshot());
 const one=f.model.subscribe(()=>updates++),two=f.model.subscribe(()=>{}),before=f.model.getSnapshot();
 f.sessions.set({...f.sessions.getSnapshot(),byId:{...f.sessions.getSnapshot().byId,a:{...f.sessions.getSnapshot().byId.a,title:'Renamed'}}});
 assert.equal(updates,1);assert.equal(f.model.getSnapshot().context.title,'Renamed');assert.notEqual(f.model.getSnapshot(),before);
 const current=f.model.getSnapshot();f.registry.set([...f.registry.getSnapshot()]);assert.equal(f.model.getSnapshot(),current);
 f.workspaces.set({...f.workspaces.getSnapshot(),items:[{workspaceId:'one',title:'Renamed Workspace',sessionIds:['a']}]});
 assert.equal(f.model.getSnapshot().sessions[0].workspaceTitle,'Renamed Workspace');
 f.registry.set([]);assert.equal(f.model.getSnapshot().available,false);
 one();two();readEarly();for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

test('expanded follows the actual mounted presentation even when the Session catalog or guide capability is unavailable',()=>{
 const f=fixture({panelId:null,initialExpanded:true});
 assert.equal(f.model.getSnapshot().expanded,true);
 f.panel.set({activePanelId:'home'});assert.equal(f.model.getSnapshot().expanded,false);
 f.panel.set({activePanelId:null});assert.equal(f.model.getSnapshot().expanded,true);
 f.presentation.set({sessionId:'b',expanded:true,fullscreen:false});assert.equal(f.model.getSnapshot().expanded,false);
 f.mounted.set('b');assert.equal(f.model.getSnapshot().expanded,true);
 f.sessions.set({ids:[],byId:{}});f.registry.set([]);
 assert.equal(f.model.getSnapshot().context,null);assert.equal(f.model.getSnapshot().available,false);assert.equal(f.model.getSnapshot().expanded,true);
 f.model.dispose();assert.equal(f.model.getSnapshot().expanded,false);
});

test('collapse toggles only the visible native panel and leaves tabs, Session data and navigation untouched',async()=>{
 const f=fixture({panelId:null,initialExpanded:true});
 const tabs=[{sessionId:'a',tabId:'browser',kind:'browser'},{sessionId:'a',tabId:'terminal',kind:'terminal'}];f.openTabs.set(tabs);
 const sessionsBefore=structuredClone(f.sessions.getSnapshot()),workspacesBefore=structuredClone(f.workspaces.getSnapshot());
 assert.deepEqual(await f.model.collapsePanel(),{sessionId:'a',collapsed:true});
 assert.deepEqual(f.calls,[['collapse','a']]);assert.equal(f.openTabs.getSnapshot(),tabs);
 assert.deepEqual(f.sessions.getSnapshot(),sessionsBefore);assert.deepEqual(f.workspaces.getSnapshot(),workspacesBefore);
 assert.equal(f.model.getSnapshot().expanded,false);assert.equal(f.model.getSnapshot().busy,false);
 for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

test('an already-hidden panel is a no-op and stale DOM presentation never reopens a natively closed panel',async()=>{
 const hidden=fixture({panelId:null});
 assert.deepEqual(await hidden.model.collapsePanel(),{collapsed:false});assert.deepEqual(hidden.calls,[]);hidden.model.dispose();
 const stale=fixture({panelId:null,initialExpanded:true});stale.nativeExpanded(false);
 assert.equal(stale.model.getSnapshot().expanded,true);
 assert.deepEqual(await stale.model.collapsePanel(),{collapsed:false});assert.deepEqual(stale.calls,[]);stale.model.dispose();
});

test('collapse does not require directory context or the guide provider to remain available',async()=>{
 const f=fixture({panelId:null,initialExpanded:true,byId:{}});f.registry.set([]);
 assert.equal(f.model.getSnapshot().context,null);assert.equal(f.model.getSnapshot().available,false);
 assert.deepEqual(await f.model.collapsePanel(),{sessionId:'a',collapsed:true});assert.deepEqual(f.calls,[['collapse','a']]);f.model.dispose();
});

test('repeated collapse clicks share one toggle and await actual presentation closure',async()=>{
 const f=fixture({panelId:null,initialExpanded:true,autoCollapse:false});
 const one=f.model.collapsePanel(),two=f.model.collapsePanel();assert.equal(one,two);await flush();
 assert.deepEqual(f.calls,[['collapse','a']]);assert.equal(f.model.getSnapshot().busy,true);
 await assert.rejects(f.model.openTab(),error=>error.code==='busy');
 f.presentation.set({sessionId:'a',expanded:false,fullscreen:false});
 assert.deepEqual(await one,{sessionId:'a',collapsed:true});await two;
 for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
 const opening=fixture({autoMount:false});const pending=opening.model.openTab();
 await assert.rejects(opening.model.collapsePanel(),error=>error.code==='busy');
 opening.model.dispose();await assert.rejects(pending,error=>error.code==='closed');
});

test('a disappeared original native surface confirms collapse without toggling another surface',async()=>{
 const f=fixture({panelId:null,initialExpanded:true,autoCollapse:false});const pending=f.model.collapsePanel();await flush();
 f.mounted.set(undefined);
 assert.deepEqual(await pending,{sessionId:'a',collapsed:true});assert.deepEqual(f.calls,[['collapse','a']]);
 for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

for(const changed of ['page','mounted','target','lookup-reentrancy'])test(`a ${changed} change before collapse admission never toggles the new panel`,async()=>{
 const f=fixture({panelId:null,initialExpanded:true});
 if(changed==='target')f.commandReady(false);
 if(changed==='lookup-reentrancy')f.ctx.sidebarRight.commandTarget=()=>{f.mounted.set('b');f.presentation.set({sessionId:'b',expanded:true,fullscreen:false});return {sessionId:'a'};};
 const pending=f.model.collapsePanel();
 if(changed==='page')f.panel.set({activePanelId:'plugins'});
 if(changed==='mounted'){f.mounted.set('b');f.presentation.set({sessionId:'b',expanded:true,fullscreen:false});}
 await assert.rejects(pending,error=>error.code==='cancelled');assert.deepEqual(f.calls,[]);f.model.dispose();
});

for(const changed of ['page','session'])test(`a ${changed} change during collapse confirmation cancels without chasing the new panel`,async()=>{
 const f=fixture({panelId:null,initialExpanded:true,autoCollapse:false});const pending=f.model.collapsePanel();await flush();
 if(changed==='page')f.panel.set({activePanelId:'schedules'});
 else {f.mounted.set('b');f.presentation.set({sessionId:'b',expanded:true,fullscreen:false});}
 await assert.rejects(pending,error=>error.code==='cancelled');assert.deepEqual(f.calls,[['collapse','a']]);
 for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

test('collapse timeout is explicit and a retry cannot toggle a closed native panel back open',async()=>{
 const f=fixture({panelId:null,initialExpanded:true,autoCollapse:false,timeoutMs:5});
 await assert.rejects(f.model.collapsePanel(),error=>error.code==='timeout'&&/已请求收起/.test(error.message));
 assert.equal(f.model.getSnapshot().busy,false);assert.equal(f.model.getSnapshot().expanded,true);
 assert.deepEqual(await f.model.collapsePanel(),{collapsed:false});assert.deepEqual(f.calls,[['collapse','a']]);
 for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

test('missing native collapse capability and disposal fail clearly and release every waiter',async()=>{
 for(const method of ['toggleExpanded','isExpanded']){
  const f=fixture({panelId:null,initialExpanded:true});delete f.ctx.sidebarRight[method];
  await assert.rejects(f.model.collapsePanel(),error=>error.code==='unavailable');assert.deepEqual(f.calls,[]);f.model.dispose();
 }
 const f=fixture({panelId:null,initialExpanded:true,autoCollapse:false});const stop=f.model.subscribe(()=>{}),pending=f.model.collapsePanel();await flush();
 f.model.dispose();await assert.rejects(pending,error=>error.code==='closed');
 await assert.rejects(f.model.collapsePanel(),error=>error.code==='closed');
 assert.deepEqual(f.calls,[['collapse','a']]);for(const item of f.sources)assert.equal(item.count(),0);stop();
});

const savedTabs=[{sessionId:'a',tabId:'browser-a',kind:'browser',contentId:'https://example.com'},{sessionId:'a',tabId:'terminal-a',kind:'terminal',contentId:'terminal-a'}];

test('hasTabs uses the native saved membership of the current or retained Session and counts a retained guide',()=>{
 const f=fixture(),stop=f.model.subscribe(()=>{});let changes=0;
 const unsubscribe=f.model.subscribe(()=>changes++),initial=f.model.getSnapshot();
 f.openTabs.set([{sessionId:'b',tabId:'other',kind:'files'}]);
 assert.equal(f.model.getSnapshot(),initial);assert.equal(changes,0);
 f.openTabs.set([{sessionId:'a',tabId:'start',kind:'guide'}]);
 assert.equal(f.model.getSnapshot().hasTabs,true);assert.equal(changes,1);assert.deepEqual(f.calls,[]);
 f.select('b');assert.equal(f.model.getSnapshot().hasTabs,false);
 f.panel.set({activePanelId:null});f.mounted.set('a');
 f.sessions.set({ids:[],byId:{}});f.registry.set([]);
 assert.equal(f.model.getSnapshot().context,null);assert.equal(f.model.getSnapshot().hasTabs,true);
 f.model.dispose();assert.equal(f.model.getSnapshot().hasTabs,false);unsubscribe();stop();
 for(const item of f.sources)assert.equal(item.count(),0);
});

for(const panelId of ['home','plugins','schedules',null])test(`restoring saved tabs from ${panelId??'conversation'} reopens the native layout without admitting or focusing any tab`,async()=>{
 const f=fixture({panelId,tabs:savedTabs,initialExpanded:false,initialFullscreen:true});
 const before=structuredClone(f.sessions.getSnapshot());
 const active={id:'terminal-a',paneId:'secondary',kind:'terminal'};f.ctx.sidebarRight.active=()=>active;
 assert.equal(f.model.getSnapshot().hasTabs,true);
 assert.deepEqual(await f.model.expandPanel(),{sessionId:'a',expanded:true});
 assert.deepEqual(f.calls,[...(panelId===null?[]:[['panel',null]]),['collapse','a']]);
 assert.equal(f.openTabs.getSnapshot(),savedTabs);assert.equal(f.ctx.sidebarRight.active(),active);
 assert.equal(f.presentation.getSnapshot().fullscreen,true);assert.deepEqual(f.sessions.getSnapshot(),before);
 assert.equal(f.model.getSnapshot().expanded,true);assert.equal(f.model.getSnapshot().busy,false);
 for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

test('empty retained layouts do not expand or seed a new guide, including other-session-only and absent-context inventories',async()=>{
 for(const options of [{},{tabs:[{sessionId:'b',tabId:'other',kind:'files'}]},{retained:null,tabs:savedTabs},{archived:['a'],tabs:savedTabs}]){
  const f=fixture(options);assert.equal(f.model.getSnapshot().hasTabs,false);
  assert.deepEqual(await f.model.expandPanel(),{expanded:false});assert.deepEqual(f.calls,[]);f.model.dispose();
 }
 const guide=fixture({panelId:null,tabs:[{sessionId:'a',tabId:'start',kind:'guide'}]});
 assert.deepEqual(await guide.model.expandPanel(),{sessionId:'a',expanded:true});assert.deepEqual(guide.calls,[['collapse','a']]);guide.model.dispose();
});

test('restoring a visible saved layout does not depend on the guide provider or Session directory',async()=>{
 const f=fixture({panelId:null,tabs:savedTabs,byId:{}});f.registry.set([]);
 delete f.ctx.sidebarRight.openTab;delete f.ctx.sidebarRight.toggleFullscreen;
 assert.equal(f.model.getSnapshot().available,false);assert.equal(f.model.getSnapshot().hasTabs,true);
 assert.deepEqual(await f.model.expandPanel(),{sessionId:'a',expanded:true});assert.deepEqual(f.calls,[['collapse','a']]);f.model.dispose();
});

test('restoring waits for both the mounted Session and native command target before its sole toggle',async()=>{
 const f=fixture({tabs:savedTabs,autoMount:false});f.commandReady(false);
 const pending=f.model.expandPanel();await flush();assert.deepEqual(f.calls,[['panel',null]]);
 f.mounted.set('a');await flush();assert.deepEqual(f.calls,[['panel',null]]);
 f.commandReady(true);assert.deepEqual(await pending,{sessionId:'a',expanded:true});
 assert.deepEqual(f.calls,[['panel',null],['collapse','a']]);for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

test('an already-open native layout waits for delayed DOM confirmation without toggling closed',async()=>{
 const f=fixture({panelId:null,tabs:savedTabs});f.nativeExpanded(true);
 const pending=f.model.expandPanel();await flush();assert.deepEqual(f.calls,[]);assert.equal(f.model.getSnapshot().busy,true);
 f.presentation.set({sessionId:'a',expanded:true,fullscreen:false});
 assert.deepEqual(await pending,{sessionId:'a',expanded:true});assert.deepEqual(f.calls,[]);
 assert.deepEqual(await f.model.expandPanel(),{sessionId:'a',expanded:true});assert.deepEqual(f.calls,[]);f.model.dispose();
});

test('native closed state wins over stale expanded DOM when explicitly restoring a saved layout',async()=>{
 const f=fixture({panelId:null,tabs:savedTabs,initialExpanded:true});f.nativeExpanded(false);
 assert.deepEqual(await f.model.expandPanel(),{sessionId:'a',expanded:true});assert.deepEqual(f.calls,[['collapse','a']]);f.model.dispose();
});

test('repeated restore clicks coalesce and reject competing tab or collapse actions',async()=>{
 const f=fixture({panelId:null,tabs:savedTabs,autoCollapse:false});
 const one=f.model.expandPanel(),two=f.model.expandPanel();assert.equal(one,two);await flush();
 assert.deepEqual(f.calls,[['collapse','a']]);assert.equal(f.model.getSnapshot().busy,true);
 await assert.rejects(f.model.openTab(),error=>error.code==='busy');await assert.rejects(f.model.collapsePanel(),error=>error.code==='busy');
 f.presentation.set({sessionId:'a',expanded:true,fullscreen:false});await Promise.all([one,two]);
 assert.deepEqual(f.calls,[['collapse','a']]);for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
 for(const kind of ['open','collapse']){
  const busy=fixture({panelId:null,tabs:savedTabs,initialExpanded:kind==='collapse',autoPresent:false,autoCollapse:false});
  const pending=kind==='open'?busy.model.openTab():busy.model.collapsePanel();
  await assert.rejects(busy.model.expandPanel(),error=>error.code==='busy');
  busy.model.dispose();await assert.rejects(pending,error=>error.code==='closed'||error.code==='partial-open');
 }
});

for(const changed of ['page','session','mounted','archive','tabs'])test(`a ${changed} change before restore admission cannot reopen another Session`,async()=>{
 const f=fixture({tabs:savedTabs}),pending=f.model.expandPanel();
 if(changed==='page')f.panel.set({activePanelId:'plugins'});
 if(changed==='session')f.select('b');
 if(changed==='mounted')f.mounted.set('b');
 if(changed==='archive')f.workspaces.set({...f.workspaces.getSnapshot(),archivedSessionIds:['a']});
 if(changed==='tabs')f.openTabs.set([]);
 await assert.rejects(pending,error=>['cancelled','session-unavailable'].includes(error.code));assert.deepEqual(f.calls,[]);f.model.dispose();
});

for(const changed of ['target','native-state-lookup'])test(`a ${changed} identity change immediately before restore never toggles the replacement panel`,async()=>{
 const f=fixture({panelId:null,tabs:savedTabs});
 if(changed==='target'){
  let lookups=0;f.ctx.sidebarRight.commandTarget=()=>{if(++lookups===2){f.mounted.set('b');return {sessionId:'a'};}return {sessionId:'a'};};
 }else f.ctx.sidebarRight.isExpanded=()=>{f.mounted.set('b');return false;};
 await assert.rejects(f.model.expandPanel(),error=>error.code==='cancelled');assert.deepEqual(f.calls,[]);f.model.dispose();
});

for(const changed of ['page','session','surface','tabs'])test(`a ${changed} change during restore confirmation cancels without another toggle`,async()=>{
 const f=fixture({panelId:null,tabs:savedTabs,autoCollapse:false});const pending=f.model.expandPanel();await flush();
 assert.deepEqual(f.calls,[['collapse','a']]);
 if(changed==='page')f.panel.set({activePanelId:'schedules'});
 if(changed==='session')f.select('b');
 if(changed==='surface')f.mounted.set(undefined);
 if(changed==='tabs')f.openTabs.set([]);
 await assert.rejects(pending,error=>error.code==='cancelled');assert.deepEqual(f.calls,[['collapse','a']]);
 for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

test('restore timeouts distinguish unready surfaces from unconfirmed opening and retry never closes the already-open store',async()=>{
 const unready=fixture({tabs:savedTabs,autoMount:false,timeoutMs:5});
 await assert.rejects(unready.model.expandPanel(),error=>error.code==='timeout'&&/尚未展开/.test(error.message));
 assert.deepEqual(unready.calls,[['panel',null]]);for(const item of unready.sources)assert.equal(item.count(),0);unready.model.dispose();
 const unconfirmed=fixture({panelId:null,tabs:savedTabs,autoCollapse:false,timeoutMs:5});
 await assert.rejects(unconfirmed.model.expandPanel(),error=>error.code==='timeout'&&/已请求展开/.test(error.message));
 const retry=unconfirmed.model.expandPanel();await flush();assert.deepEqual(unconfirmed.calls,[['collapse','a']]);
 unconfirmed.presentation.set({sessionId:'a',expanded:true,fullscreen:false});await retry;
 assert.deepEqual(unconfirmed.calls,[['collapse','a']]);for(const item of unconfirmed.sources)assert.equal(item.count(),0);unconfirmed.model.dispose();
});

test('missing native restore capability and disposal fail clearly while all restore subscriptions are released',async()=>{
 for(const method of ['toggleExpanded','isExpanded','commandTarget']){
  const f=fixture({panelId:null,tabs:savedTabs});delete f.ctx.sidebarRight[method];
  await assert.rejects(f.model.expandPanel(),error=>error.code==='unavailable');assert.deepEqual(f.calls,[]);f.model.dispose();
 }
 const before=fixture({tabs:savedTabs}),cancelled=before.model.expandPanel();before.model.dispose();
 await assert.rejects(cancelled,error=>error.code==='closed');assert.deepEqual(before.calls,[]);
 const f=fixture({panelId:null,tabs:savedTabs,autoCollapse:false});const stop=f.model.subscribe(()=>{}),pending=f.model.expandPanel();await flush();
 f.model.dispose();await assert.rejects(pending,error=>error.code==='closed');await assert.rejects(f.model.expandPanel(),error=>error.code==='closed');
 assert.deepEqual(f.calls,[['collapse','a']]);for(const item of f.sources)assert.equal(item.count(),0);stop();
});

test('a visible saved Session with no retained tabs opens its native tools once without admitting a guide',async()=>{
 const f=fixture({panelId:null});
 assert.equal(f.model.getSnapshot().hasTabs,false);assert.equal(f.model.getSnapshot().canExpand,true);
 const one=f.model.expandPanel(),two=f.model.expandPanel();assert.equal(one,two);
 assert.deepEqual(await one,{sessionId:'a',expanded:true});await two;
 assert.deepEqual(f.calls,[['collapse','a']]);assert.deepEqual(f.openTabs.getSnapshot(),[]);
 assert.equal(f.model.getSnapshot().hasTabs,false);assert.equal(f.model.getSnapshot().expanded,true);f.model.dispose();
});

test('a visible empty Session need not have a retained directory marker to use native tools',async()=>{
 const f=fixture({panelId:null,byId:{a:summary('a','Existing')}});f.registry.set([]);
 assert.equal(f.model.getSnapshot().context,null);assert.equal(f.model.getSnapshot().available,false);
 assert.equal(f.model.getSnapshot().canExpand,true);
 assert.deepEqual(await f.model.expandPanel(),{sessionId:'a',expanded:true});assert.deepEqual(f.calls,[['collapse','a']]);f.model.dispose();
});

test('empty global pages, blank drafts, unknown and archived visible Sessions never navigate or seed tools',async()=>{
 for(const options of [{panelId:'home'},{panelId:'plugins'},{panelId:'schedules'},{panelId:null,byId:{a:summary('a','Draft',{blank:true,retainedBy:{mainView:1}})}},{panelId:null,byId:{}},{panelId:null,archived:['a']}]){
  const f=fixture(options);assert.equal(f.model.getSnapshot().hasTabs,false);assert.equal(f.model.getSnapshot().canExpand,false);
  assert.deepEqual(await f.model.expandPanel(),{expanded:false});assert.deepEqual(f.calls,[]);f.model.dispose();
 }
});

test('native default seeding during the first empty-surface expansion is allowed without explicit tab admission',async()=>{
 const f=fixture({panelId:null,autoCollapse:false}),toggle=f.ctx.sidebarRight.toggleExpanded;
 f.ctx.sidebarRight.toggleExpanded=()=>{toggle();f.openTabs.set([{sessionId:'a',tabId:'native-default',kind:'guide'}]);f.presentation.set({sessionId:'a',expanded:true,fullscreen:false});};
 assert.deepEqual(await f.model.expandPanel(),{sessionId:'a',expanded:true});
 assert.deepEqual(f.calls,[['collapse','a']]);assert.equal(f.model.getSnapshot().hasTabs,true);f.model.dispose();
});

test('a first empty surface waits for its native target before expanding and cancels when its Session becomes blank',async()=>{
 const f=fixture({panelId:null});f.commandReady(false);
 const pending=f.model.expandPanel();await flush();assert.deepEqual(f.calls,[]);
 f.commandReady(true);await pending;assert.deepEqual(f.calls,[['collapse','a']]);f.model.dispose();
 const changed=fixture({panelId:null});const cancelled=changed.model.expandPanel();
 changed.sessions.set({...changed.sessions.getSnapshot(),byId:{...changed.sessions.getSnapshot().byId,a:summary('a','Now blank',{blank:true,retainedBy:{mainView:1}})}});
 await assert.rejects(cancelled,error=>error.code==='session-unavailable');assert.deepEqual(changed.calls,[]);changed.model.dispose();
});

for(const kind of ['open','expand','collapse'])test(`motion prepares only immediately around the native ${kind} mutation and finishes synchronously`,async()=>{
 const events=[],motion={prepare(){events.push('prepare');return()=>events.push('finish');}};
 const f=fixture({panelId:null,tabs:savedTabs,initialExpanded:kind==='collapse',motion});
 const method=kind==='open'?'openTab':'toggleExpanded',native=f.ctx.sidebarRight[method];
 f.ctx.sidebarRight[method]=function(...args){events.push('native');return native.apply(this,args);};
 assert.deepEqual(events,[]);
 await (kind==='open'?f.model.openTab():kind==='expand'?f.model.expandPanel():f.model.collapsePanel());
 assert.deepEqual(events,['prepare','native','finish']);f.model.dispose();
});

test('navigation and surface readiness do not prepare motion before an actual mutation is admitted',async()=>{
 const events=[],f=fixture({autoMount:false,motion:{prepare(){events.push('prepare');return()=>events.push('finish');}}});
 const native=f.ctx.sidebarRight.openTab;f.ctx.sidebarRight.openTab=(...args)=>{events.push('native');return native(...args);};
 const pending=f.model.openTab();await flush();assert.deepEqual(f.calls,[['panel',null]]);assert.deepEqual(events,[]);
 f.mounted.set('a');await pending;assert.deepEqual(events,['prepare','native','finish']);f.model.dispose();
});

test('no-op, unavailable and already-expanded paths never prepare motion',async()=>{
 const events=[],motion={prepare(){events.push('prepare');return()=>events.push('finish');}};
 const empty=fixture({motion});await empty.model.expandPanel();await empty.model.collapsePanel();assert.deepEqual(events,[]);empty.model.dispose();
 const opened=fixture({panelId:null,tabs:savedTabs,initialExpanded:true,motion});await opened.model.expandPanel();assert.deepEqual(events,[]);opened.model.dispose();
 const absent=fixture({panelId:null,tabs:savedTabs,motion});delete absent.ctx.sidebarRight.toggleExpanded;
 await assert.rejects(absent.model.expandPanel(),error=>error.code==='unavailable');assert.deepEqual(events,[]);absent.model.dispose();
});

for(const kind of ['open','expand','collapse'])test(`motion preparation failure prevents the native ${kind} mutation and reports an explicit error`,async()=>{
 const cause=new Error('old style unavailable'),f=fixture({panelId:null,tabs:savedTabs,initialExpanded:kind==='collapse',motion:{prepare(){throw cause;}}});
 await assert.rejects(kind==='open'?f.model.openTab():kind==='expand'?f.model.expandPanel():f.model.collapsePanel(),error=>error.code==='motion-failed'&&error.cause===cause&&/过渡准备失败/.test(error.message));
 assert.deepEqual(f.calls,[]);assert.equal(f.model.getSnapshot().busy,false);for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

for(const kind of ['open','expand','collapse'])test(`a synchronous native ${kind} failure still finishes motion without replacing the original error`,async()=>{
 const events=[],cause=new Error('native refused'),f=fixture({panelId:null,tabs:savedTabs,initialExpanded:kind==='collapse',motion:{prepare(){events.push('prepare');return()=>{events.push('finish');throw new Error('cleanup refused');};}}});
 const method=kind==='open'?'openTab':'toggleExpanded';f.ctx.sidebarRight[method]=()=>{events.push('native');throw cause;};
 await assert.rejects(kind==='open'?f.model.openTab():kind==='expand'?f.model.expandPanel():f.model.collapsePanel(),error=>error===cause);
 assert.deepEqual(events,['prepare','native','finish']);assert.equal(f.model.getSnapshot().busy,false);for(const item of f.sources)assert.equal(item.count(),0);f.model.dispose();
});

test('motion cleanup errors cannot turn a committed native mutation into a failed action and fullscreen is not double-wrapped',async()=>{
 const events=[],f=fixture({panelId:null,motion:{prepare(){events.push('prepare');return()=>{events.push('finish');throw new Error('cleanup refused');};}}});
 const native=f.ctx.sidebarRight.openTab;f.ctx.sidebarRight.openTab=(...args)=>{events.push('native');return native(...args);};
 const fullscreen=f.ctx.sidebarRight.toggleFullscreen;f.ctx.sidebarRight.toggleFullscreen=(...args)=>{events.push('fullscreen');return fullscreen(...args);};
 assert.deepEqual(await f.model.openTab({fullscreen:true}),{sessionId:'a',fullscreen:true});
 assert.deepEqual(events,['prepare','native','finish','fullscreen']);f.model.dispose();
});

test('an optional motion object with no prepare hook leaves native open and restore behavior unchanged',async()=>{
 const f=fixture({panelId:null,tabs:savedTabs,motion:{}});
 await f.model.expandPanel();await f.model.collapsePanel();await f.model.openTab();
 assert.deepEqual(f.calls,[['collapse','a'],['collapse','a'],['tab','guide',{revealIfOpened:false}]]);f.model.dispose();
});
