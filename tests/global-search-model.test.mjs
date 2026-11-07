import test from 'node:test';
import assert from 'node:assert/strict';
import {createGlobalSearchModel} from '../src/global-search-model.js';

function source(value){const listeners=new Set();return {getSnapshot:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},set(next){value=next;for(const fn of listeners)fn();},get count(){return listeners.size;}};}
const delay=()=>new Promise(resolve=>setTimeout(resolve,5));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(t,{search}={}){
 const sessions=source({ids:['a','b','blank','archived','child'],byId:{a:{id:'a',title:'Alpha',updatedAt:10},b:{id:'b',title:'Beta',updatedAt:20},blank:{id:'blank',blank:true},archived:{id:'archived',title:'Archived'},child:{id:'child',origin:'subagent'},projected:{id:'projected',displayTitle:'Virtual child'}}});
 const workspaces=source({items:[{workspaceId:'w',title:'工作区',path:'/work',sessionIds:['a','b']}],archivedSessionIds:['archived']});
 const panels=source(['home','plugins','schedules']),calls=[],requests=[];
 const ctx={sessions:{list:sessions,create(){throw new Error('must not create');},search(query,signal){requests.push({query,signal});return search?search(query,signal):Promise.resolve({ok:true,value:{items:[],hasMore:false}});}},
  workspaces:{list:workspaces},uiWorkspace:{openSession(id){calls.push(['session',id]);}},layout:{selectPanel(id){calls.push(['panel',id]);}},
  slots:{entries:()=>panels.getSnapshot().map(key=>({options:{key}})),subscribe:(_,fn)=>panels.subscribe(fn)}};
 const model=createGlobalSearchModel(ctx,{debounceMs:0,openHome:()=>calls.push(['home']),openWorkspace:id=>calls.push(['draft-workspace',id])});
 t.after(()=>model.dispose());return {model,ctx,sessions,workspaces,panels,calls,requests};
}
const rows=model=>model.getSnapshot().groups.flatMap(group=>group.items);

test('opens recent chats and real actions without a request or Session creation',t=>{
 const f=fixture(t);assert.equal(f.sessions.count,0);f.model.open();
 assert.deepEqual(rows(f.model).filter(r=>r.kind==='session').map(r=>r.sessionId),['b','a']);
 assert.equal(f.requests.length,0);assert.equal(f.sessions.count,1);
 f.model.close();assert.equal(f.sessions.count,0);assert.equal(f.workspaces.count,0);
});

test('local results appear immediately and body hits merge once with snippets',async t=>{
 const pending=deferred();const f=fixture(t,{search:()=>pending.promise});f.model.open();f.model.setQuery('Alpha');
 assert.deepEqual(rows(f.model).map(r=>r.id),['session:a']);assert.equal(f.model.getSnapshot().loading,true);
 await delay();assert.equal(f.requests[0].query,'Alpha');
 pending.resolve({ok:true,value:{items:[{sessionId:'a',snippet:'Alpha snippet'},{sessionId:'b',snippet:'body Alpha'},{sessionId:'missing'},{sessionId:'archived'},{sessionId:'blank'}],hasMore:true}});await delay();
 assert.deepEqual(rows(f.model).map(r=>r.id),['session:a','session:b']);assert.equal(rows(f.model)[1].snippet,'body Alpha');
 f.model.setCategory('text');assert.deepEqual(rows(f.model).map(r=>r.id),['text:a','text:b']);
 assert.equal(f.model.getSnapshot().hasMore,true);
});

test('changed queries abort requests and ignore stale success or failure',async t=>{
 const requests=[];const f=fixture(t,{search:()=>{const p=deferred();requests.push(p);return p.promise;}});
 f.model.open();f.model.setQuery('first');await delay();f.model.setQuery('second');assert.equal(f.requests[0].signal.aborted,true);await delay();
 requests[1].resolve({ok:true,value:{items:[{sessionId:'b',snippet:'second'}]}});await delay();
 requests[0].reject(new Error('old error'));await delay();
 assert.equal(f.model.getSnapshot().error,'');assert.equal(rows(f.model)[0].snippet,'second');
 f.model.setQuery('third');await delay();f.model.close();assert.equal(f.requests[2].signal.aborted,true);
 requests[2].resolve({ok:true,value:{items:[{sessionId:'a'}]}});await delay();f.model.open();assert.equal(f.model.getSnapshot().query,'');
});

test('reports business failures while keeping useful title results',async t=>{
 const f=fixture(t,{search:()=>Promise.resolve({ok:false,error:{message:'unavailable'}})});f.model.open();f.model.setQuery('Alpha');await delay();
 assert.match(f.model.getSnapshot().error,/聊天内容搜索暂不可用/);assert.equal(f.model.getSnapshot().loading,false);
 assert.equal(rows(f.model)[0].id,'session:a');assert.equal(await f.model.select('session:a'),true);assert.deepEqual(f.calls,[['session','a']]);
});

test('revalidates removed or archived results and panel actions',async t=>{
 const f=fixture(t);f.model.open();f.workspaces.set({...f.workspaces.getSnapshot(),archivedSessionIds:['a','b','archived']});
 assert.equal(await f.model.select('session:a'),false);assert.equal(rows(f.model).some(r=>r.kind==='session'),false);
 f.panels.set(['home']);assert.equal(await f.model.select('action:plugins'),false);assert.deepEqual(f.calls,[]);
});

test('workspace selection opens the draft and Home uses the provided draft-first entry',async t=>{
 const f=fixture(t);f.model.open();assert.equal(await f.model.select('workspace:w'),true);
 f.model.open();assert.equal(await f.model.select('action:home'),true);
 assert.deepEqual(f.calls,[['draft-workspace','w'],['home']]);
});

test('late action completion cannot close a reopened palette or replace its error',async t=>{
 const f=fixture(t),pending=deferred();f.ctx.uiWorkspace.openSession=()=>pending.promise;
 f.model.open();const selecting=f.model.select('session:a');assert.equal(f.model.getSnapshot().busyId,'session:a');
 assert.equal(await f.model.select('session:b'),false);f.model.close();f.model.open();f.model.setQuery('new');
 pending.reject(new Error('old action'));await selecting;
 assert.equal(f.model.getSnapshot().open,true);assert.equal(f.model.getSnapshot().query,'new');assert.equal(f.model.getSnapshot().error,'');
});

test('failed navigation leaves the palette open and allows retry',async t=>{
 const f=fixture(t);f.ctx.uiWorkspace.openSession=()=>{throw new Error('offline');};f.model.open();
 assert.equal(await f.model.select('session:a'),false);assert.equal(f.model.getSnapshot().open,true);assert.equal(f.model.getSnapshot().busyId,null);assert.equal(f.model.getSnapshot().error,'offline');
});

test('query length respects Host limit; categories do not restart the request',async t=>{
 const f=fixture(t);f.model.open();f.model.setQuery('x'.repeat(600));f.model.setCategory('text');await delay();
 assert.equal(f.requests[0].query.length,500);assert.equal(f.requests.length,1);f.model.setCategory('files');assert.equal(f.model.getSnapshot().category,'text');
});

test('query sanitation removes NUL and never cuts an emoji surrogate pair',async t=>{
 const f=fixture(t);f.model.open();f.model.setQuery('a\0b'+'x'.repeat(497)+'😀');await delay();
 assert.equal(f.requests[0].query,'ab'+'x'.repeat(497));
});

test('body results cannot promote projected children or removed visible ids',async t=>{
 const f=fixture(t,{search:()=>Promise.resolve({ok:true,value:{items:[{sessionId:'child'},{sessionId:'projected'},{sessionId:'a',snippet:'body hit'}]}})});
 f.model.open();f.model.setQuery('body hit');await delay();assert.deepEqual(rows(f.model).map(r=>r.id),['session:a']);
 f.sessions.set({...f.sessions.getSnapshot(),ids:['b']});assert.deepEqual(rows(f.model),[]);assert.equal(await f.model.select('session:a'),false);
});

test('local truncation also advertises more results in the current category',t=>{
 const f=fixture(t),entries=Array.from({length:25},(_,i)=>({id:'s'+i,title:'Local '+i}));
 f.sessions.set({ids:entries.map(r=>r.id),byId:Object.fromEntries(entries.map(r=>[r.id,r]))});
 f.model.open();f.model.setCategory('sessions');assert.equal(rows(f.model).length,20);assert.equal(f.model.getSnapshot().hasMore,true);
 f.model.setCategory('actions');assert.equal(f.model.getSnapshot().hasMore,false);
});

test('a disabled Host index removes the unavailable category and stops repeated failing requests',async t=>{
 const f=fixture(t,{search:()=>Promise.resolve({ok:false,error:{message:'session search is disabled: openAt never'}})});
 f.model.open();f.model.setCategory('text');f.model.setQuery('Alpha');await delay();
 assert.equal(f.model.getSnapshot().category,'sessions');assert.equal(f.model.getSnapshot().categories.some(c=>c.id==='text'),false);
 assert.match(f.model.getSnapshot().notice,/当前 DSH 未启用/);assert.equal(f.model.getSnapshot().error,'');assert.equal(rows(f.model)[0].id,'session:a');
 f.model.setQuery('Beta');await delay();assert.equal(f.requests.length,1);assert.equal(rows(f.model)[0].id,'session:b');
 f.model.close();f.model.open();f.model.setQuery('Alpha');await delay();assert.equal(f.requests.length,1);
});
