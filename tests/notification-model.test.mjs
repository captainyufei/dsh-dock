import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationModel,latestCompletion} from '../src/notification-model.js';

function source(value){
 const listeners=new Set();
 return {getSnapshot:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},set(next){value=next;for(const fn of [...listeners])fn();},get count(){return listeners.size;}};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
const event=(type,seq,time,data)=>({type:'event',event:{type,seq,time,data}});
const history=(seq=4,at=900,kind='completed',excerpt='已经完成真实工作')=>[
 event('turn/start',seq-2,at-20,{turn:1}),event('assistant/message',seq-1,at-1,{message:{content:[{type:'text',text:excerpt}]}}),event('turn/end',seq,at,{turn:1,reason:{kind}}),
];
function fixture(t,{saved,now=1000,pages={a:history()},storage,pollMs}={}){
 const sessions=source({phase:'ready',ids:['a','b','c','d','running','blank','archived','child'],byId:{
  a:{id:'a',title:'完成聊天',updatedAt:50,retainedBy:{mainView:1}},b:{id:'b',title:'审批聊天',updatedAt:20},c:{id:'c',projectionValues:{title:'问题聊天'},updatedAt:30},d:{id:'d',updatedAt:40},
  running:{id:'running',running:true},blank:{id:'blank',blank:true},archived:{id:'archived'},child:{id:'child',origin:'subagent'},hidden:{id:'hidden'},
 }});
 const workspaces=source({items:[{title:'项目',sessionIds:['a']}],archivedSessionIds:['archived']});
 const statuses=source(new Map([['a',{completionUnread:false}],['b',{pendingInteraction:{kind:'approval'},running:true}],['c',{pendingInteraction:{kind:'question'}}],['d',{pendingInteraction:{kind:'plan-review'}}]]));
 const calls=[],reads=[],data=new Map(saved?[['dsh-dock:notification-inbox:v1',JSON.stringify(saved)]]:[]);
 storage??={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
 const ctx={uiSession:{sessionStatus:statuses},sessions:{list:sessions},workspaces:{list:workspaces},uiWorkspace:{openSession(id){calls.push(id);}},remote:{session:{events:async(request,signal)=>{reads.push({request,signal});return {ok:true,value:{records:pages[request.address.sessionId]||[],hasMore:false,cursor:1}};}}}};
 const model=createNotificationModel(ctx,{storage,now:()=>now,pollMs});t.after(()=>model.dispose());return {model,ctx,sessions,workspaces,statuses,calls,reads,pages,storage,data};
}

test('durable results use end seq/time, same-turn answer and accurate outcome, never list activity',()=>{
 const rows=[...history(4,900),event('turn/start',5,1000,{turn:2}),event('turn/end',6,1001,{turn:2,reason:{kind:'aborted'}})];
 assert.deepEqual(latestCompletion(rows),{seq:6,occurredAt:1001,kind:'aborted',excerpt:''});
 for(const kind of ['completed','aborted','error','blocked','max-tokens','interrupted'])assert.equal(latestCompletion(history(8,1200,kind)).kind,kind);
 for(const kind of ['forked','unknown','approval'])assert.equal(latestCompletion(history(8,1200,kind)),null);
 assert.equal(latestCompletion(history().slice(0,-1)),null);
 assert.equal(latestCompletion([event('turn/end',3,0,{reason:{kind:'completed'}})]),null);
});

test('loads recent real history, preserves read entries and filters blank/archived/subagents',async t=>{
 const f=fixture(t);f.model.subscribe(()=>{});await flush();const snapshot=f.model.getSnapshot();
 assert.equal(snapshot.available,true);assert.equal(snapshot.count,3);assert.equal(snapshot.loading,false);
 assert.deepEqual(snapshot.items.map(item=>item.id),['d','c','b','a']);
 assert.deepEqual(snapshot.items.at(-1),{id:'a',title:'完成聊天',workspaceTitle:'项目',kind:'completed',detail:'任务已完成',excerpt:'已经完成真实工作',unread:false,occurredAt:900});
 assert.equal(f.reads.some(({request})=>['blank','archived','child','hidden'].includes(request.address.sessionId)),false);
});

test('a current main-view completion becomes unread even when native unread always remains false',async t=>{
 const f=fixture(t);f.model.subscribe(()=>{});await flush();
 f.statuses.set(new Map([['a',{running:true,completionUnread:false}]]));await flush();
 f.pages.a=history(10,1200);f.statuses.set(new Map([['a',{running:false,completionUnread:false}]]));await flush();
 assert.equal(f.model.getSnapshot().count,1);assert.equal(f.model.getSnapshot().items[0].id,'a');
 assert.equal(f.model.getSnapshot().items[0].unread,true);assert.equal(f.model.getSnapshot().items[0].occurredAt,1200);
 // Reconciliation removes native unread repeatedly; Dock acknowledgement remains independent.
 f.statuses.set(new Map([['a',{completionUnread:false}]]));assert.equal(f.model.getSnapshot().count,1);
});

test('stopping without turn/end never fabricates completion, and aborted/error keep their meaning',async t=>{
 const f=fixture(t,{pages:{a:[]}});f.model.subscribe(()=>{});await flush();
 f.statuses.set(new Map([['a',{running:true}]]));await flush();f.statuses.set(new Map([['a',{running:false,completionUnread:true}]]));await flush();
 assert.equal(f.model.getSnapshot().items.some(item=>item.id==='a'),false);
 for(const [seq,kind]of [[10,'aborted'],[20,'error']]){
  f.pages.a=history(seq,1200+seq,kind);f.model.open();await flush();f.model.close();
  assert.equal(f.model.getSnapshot().items[0].kind,kind);assert.equal(f.model.getSnapshot().items[0].unread,true);
 }
});

test('opening inbox never acknowledges; selecting keeps the inbox open and history visible',async t=>{
 const f=fixture(t,{pages:{a:history(10,1200)}});f.model.open();await flush();
 const original=f.statuses.getSnapshot();assert.equal(f.model.getSnapshot().count,4);
 f.model.close();f.model.open();await flush();assert.equal(f.model.getSnapshot().count,4);
 assert.equal(await f.model.select('a'),true);assert.deepEqual(f.calls,['a']);assert.equal(f.model.getSnapshot().open,true);
 assert.equal(f.model.getSnapshot().items.find(item=>item.id==='a').unread,false);assert.equal(f.model.getSnapshot().count,3);
 assert.equal(f.statuses.getSnapshot(),original);
});

test('unread and acknowledgement survive reload; old native unread cannot resurrect an ack',async t=>{
 const f=fixture(t,{pages:{a:history(10,1200)}});f.model.open();await flush();f.model.dispose();
 const next=fixture(t,{storage:f.storage,now:2000,pages:f.pages});next.model.open();await flush();
 assert.equal(next.model.getSnapshot().items.find(item=>item.id==='a').unread,true);
 await next.model.select('a');next.model.dispose();
 const last=fixture(t,{storage:f.storage,now:3000,pages:f.pages});last.statuses.set(new Map([['a',{completionUnread:true}]]));last.model.open();await flush();
 assert.equal(last.model.getSnapshot().items.find(item=>item.id==='a').unread,false);
});

test('mark all read acknowledges results but pending questions still require action',async t=>{
 const f=fixture(t,{pages:{a:history(10,1200)}});f.model.open();await flush();f.model.markAllRead();
 assert.equal(f.model.getSnapshot().count,3);assert.equal(f.model.getSnapshot().items.length,4);
});

test('cannot select archived, hidden or deleted sessions after rendering',async t=>{
 const f=fixture(t);f.model.open();await flush();const list=f.sessions.getSnapshot();
 f.sessions.set({...list,ids:list.ids.filter(id=>id!=='a'),byId:{...list.byId,b:undefined}});
 f.workspaces.set({items:[],archivedSessionIds:['c','archived']});
 for(const id of ['a','b','c','hidden'])assert.equal(await f.model.select(id),false);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.model.getSnapshot().items.map(item=>item.id),['d']);
});

test('failed navigation stays retryable and does not acknowledge the unread result',async t=>{
 const f=fixture(t,{pages:{a:history(10,1200)}}),pending=deferred();f.ctx.uiWorkspace.openSession=()=>pending.promise;f.model.open();await flush();
 const selecting=f.model.select('a');assert.equal(await f.model.select('b'),false);pending.reject(new Error('offline'));assert.equal(await selecting,false);
 assert.equal(f.model.getSnapshot().error,'offline');assert.equal(f.model.getSnapshot().items[0].unread,true);
 f.ctx.uiWorkspace.openSession=id=>f.calls.push(id);assert.equal(await f.model.select('a'),true);
});

test('newer completion during navigation is not marked read by the older selection',async t=>{
 const f=fixture(t,{pages:{a:history(10,1200)}}),pending=deferred();f.ctx.uiWorkspace.openSession=()=>pending.promise;f.model.open();await flush();
 const selecting=f.model.select('a');f.pages.a=history(20,1300);f.statuses.set(new Map([['a',{running:true}]]));await flush();pending.resolve();await selecting;
 assert.equal(f.model.getSnapshot().items[0].occurredAt,1300);assert.equal(f.model.getSnapshot().items[0].unread,true);
});

for(const settle of ['resolve','reject'])test(`late navigation ${settle} cannot alter a reopened panel`,async t=>{
 const f=fixture(t),pending=deferred();f.ctx.uiWorkspace.openSession=()=>pending.promise;f.model.open();await flush();
 const selecting=f.model.select('a');f.model.close();f.model.open();await flush();const reopened=f.model.getSnapshot();pending[settle](new Error('old failure'));await selecting;
 assert.equal(f.model.getSnapshot(),reopened);
});

test('history read error is visible and a subsequent open retries successfully',async t=>{
 const f=fixture(t),read=f.ctx.remote.session.events;f.ctx.remote.session.events=async()=>({ok:false,error:'offline'});f.model.open();await flush();
 assert.match(f.model.getSnapshot().error,/部分完成记录/);assert.equal(f.model.getSnapshot().items.some(item=>item.id==='a'),false);
 f.ctx.remote.session.events=read;f.model.close();f.model.open();await flush();assert.equal(f.model.getSnapshot().error,'');assert.equal(f.model.getSnapshot().items.length,4);
});

test('stable snapshots and early reads do not swallow source publications',async t=>{
 const f=fixture(t);const pre=f.statuses.subscribe(()=>f.model.getSnapshot());let updates=0;
 const stop=f.model.subscribe(()=>updates++);await flush();updates=0;const snapshot=f.model.getSnapshot();assert.equal(f.model.getSnapshot(),snapshot);
 f.statuses.set(new Map(f.statuses.getSnapshot()));assert.equal(updates,0);
 f.statuses.set(new Map());assert.equal(updates,1);assert.equal(f.model.getSnapshot().count,0);stop();pre();
});

test('missing optional APIs, corrupt/blocked storage and read failure degrade safely',async t=>{
 const model=createNotificationModel({},{storage:{getItem(){throw new Error();},setItem(){throw new Error();}}});t.after(()=>model.dispose());model.open();assert.equal(model.getSnapshot().available,false);
 const f=fixture(t,{storage:{getItem:()=>'{bad',setItem(){throw new Error();}}});f.model.open();await flush();assert.equal(f.model.getSnapshot().items.length,4);
 const read=f.sessions.getSnapshot;f.sessions.getSnapshot=()=>{throw new Error();};assert.equal(f.model.getSnapshot().available,false);
 f.sessions.getSnapshot=read;assert.equal(f.model.getSnapshot().available,true);
});

test('disposal aborts history and releases lifecycle observers without late updates',async t=>{
 const f=fixture(t),pending=deferred();f.ctx.remote.session.events=async(request,signal)=>{f.reads.push({request,signal});return pending.promise;};f.model.subscribe(()=>{});await flush();
 assert.equal(f.reads.length,3);assert.equal(f.sessions.count,1);f.model.dispose();const disposed=f.model.getSnapshot();
 assert.equal(f.sessions.count,0);assert.equal(f.statuses.count,0);assert.ok(f.reads.every(read=>read.signal.aborted));
 pending.resolve({ok:true,value:{records:history(10,1200)}});await flush();assert.equal(f.model.getSnapshot(),disposed);
});


test('backfills older visible conversations beyond the recent 20 without activating sessions',async t=>{
 const f=fixture(t);const byId={};for(let i=0;i<45;i++){const id='old-'+i;byId[id]={id,title:id,updatedAt:100-i};f.pages[id]=history(10,800-i);}
 f.sessions.set({phase:'ready',ids:Object.keys(byId),byId});f.statuses.set(new Map());f.model.subscribe(()=>{});await flush();
 assert.equal(f.model.getSnapshot().items.length,45);assert.equal(f.model.getSnapshot().count,0);assert.equal(f.calls.length,0);
});

test('an older long task is re-read after the running/end persistence race',async t=>{
 const f=fixture(t,{pollMs:10});const list=f.sessions.getSnapshot(),byId={...list.byId},ids=[...list.ids];
 for(let i=0;i<8;i++){const id='recent-'+i;ids.push(id);byId[id]={id,title:id,updatedAt:1000+i};}
 f.sessions.set({...list,ids,byId});f.model.subscribe(()=>{});await flush();
 f.statuses.set(new Map([['a',{running:true}]]));await flush();
 f.statuses.set(new Map([['a',{running:false}]]));await flush(); // durable tail still old
 f.pages.a=history(20,1400);
 await new Promise(resolve=>setTimeout(resolve,35));await flush();
 assert.equal(f.model.getSnapshot().items.find(item=>item.id==='a').occurredAt,1400);
 assert.equal(f.model.getSnapshot().items.find(item=>item.id==='a').unread,true);
});


test('known legacy migration refusal does not fabricate results or keep retrying as a transient failure',async t=>{
 const f=fixture(t),read=f.ctx.remote.session.events;f.ctx.remote.session.events=async request=>request.address.sessionId==='a'?{ok:false,error:{code:'gateway/internal',message:'failed to observe session: Session migration from v0 to v4 refuses the transformed artifact: unresolved tool call'}}:read(request);
 f.model.open();await flush();assert.equal(f.model.getSnapshot().error,'');assert.match(f.model.getSnapshot().notice,/1 个旧版会话/);assert.equal(f.model.getSnapshot().count,3);
 f.ctx.remote.session.events=read;f.model.close();f.model.open();await flush();assert.equal(f.model.getSnapshot().notice,'');assert.equal(f.model.getSnapshot().items.length,4);
});
