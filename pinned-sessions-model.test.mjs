import test from 'node:test';
import assert from 'node:assert/strict';
import {createPinnedSessionsModel} from './pinned-sessions-model.js';

function source(initial){
 let snapshot=initial;
 const listeners=new Set();
 return {
  getSnapshot:()=>snapshot,
  subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  set(value){snapshot=value;for(const listener of [...listeners])listener();},
  listenerCount:()=>listeners.size,
 };
}
const summary=(id,title,extra={})=>({id,title,blank:false,retainedBy:{},...extra});
function fixture({byId={a:summary('a','Alpha'),b:summary('b','Beta'),c:summary('c','Gamma')},pins=['b','a'],archived=[],items=[{workspaceId:'one',title:'Project One',sessionIds:['a']},{workspaceId:'two',title:'Project Two',sessionIds:['b']}],unpin=async()=>undefined}={}){
 const sessions=source({ids:Object.keys(byId),byId});
 const workspaces=source({items,pinnedSessionIds:pins,archivedSessionIds:archived});
 const panel=source({activePanelId:null});
 const calls=[];
 const model=createPinnedSessionsModel({sessions:{list:sessions},workspaces:{list:workspaces},layout:{panelInfo:panel},uiWorkspace:{
  openSession:id=>calls.push(['open',id]),
  unpinSession:id=>{calls.push(['unpin',id]);return unpin(id);},
 }});
 return {model,sessions,workspaces,panel,calls};
}
function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}

test('aggregates multiple workspaces in Host pin order without changing membership or saved data',()=>{
 const f=fixture({pins:['b','c','a','b']});
 const originalWorkspaces=structuredClone(f.workspaces.getSnapshot());
 const originalSessions=structuredClone(f.sessions.getSnapshot());
 assert.deepEqual(f.model.getSnapshot(),{rows:[
  {id:'b',title:'Beta',workspaceTitle:'Project Two'},
  {id:'c',title:'Gamma',workspaceTitle:''},
  {id:'a',title:'Alpha',workspaceTitle:'Project One'},
 ],activeId:null});
 assert.equal(f.model.open('b'),true);
 assert.deepEqual(f.calls,[['open','b']]);
 assert.deepEqual(f.workspaces.getSnapshot(),originalWorkspaces);
 assert.deepEqual(f.sessions.getSnapshot(),originalSessions);
 assert.equal(f.model.getSnapshot(),f.model.getSnapshot());
 assert.throws(()=>f.model.getSnapshot().rows[0].title='changed',TypeError);
});

test('publishes renamed titles, projection titles, workspace names and Host-confirmed pin updates',()=>{
 const f=fixture();const updates=[];
 const stop=f.model.subscribe(()=>updates.push(f.model.getSnapshot()));
 const before=f.model.getSnapshot();
 f.sessions.set({...f.sessions.getSnapshot(),byId:{...f.sessions.getSnapshot().byId,b:summary('b','  Renamed  '),a:summary('a','',{projectionValues:{title:'Projected'}})}});
 assert.deepEqual(f.model.getSnapshot().rows.map(row=>row.title),['Renamed','Projected']);
 assert.equal(before.rows[0].title,'Beta');
 f.workspaces.set({...f.workspaces.getSnapshot(),items:[{workspaceId:'one',title:'Renamed Project',sessionIds:['a']}],pinnedSessionIds:['a']});
 assert.deepEqual(f.model.getSnapshot().rows,[{id:'a',title:'Projected',workspaceTitle:'Renamed Project'}]);
 assert.equal(updates.length,2);
 stop();
});

test('excludes archived, blank and missing summaries without deleting any Host pins',()=>{
 const f=fixture({pins:['missing','archived','blank','a'],archived:['archived'],byId:{a:summary('a',''),archived:summary('archived','Archived'),blank:summary('blank','Draft',{blank:true})}});
 assert.deepEqual(f.model.getSnapshot().rows,[{id:'a',title:'未命名',workspaceTitle:'Project One'}]);
 for(const id of ['missing','archived','blank'])assert.equal(f.model.open(id),false);
 assert.deepEqual(f.calls,[]);
 assert.deepEqual(f.workspaces.getSnapshot().pinnedSessionIds,['missing','archived','blank','a']);
 f.workspaces.set({...f.workspaces.getSnapshot(),archivedSessionIds:['archived','a']});
 assert.equal(f.model.open('a'),false);
 assert.deepEqual(f.model.getSnapshot().rows,[]);
});

test('highlights the retained main Session only while the Conversation panel is selected',()=>{
 const f=fixture({byId:{a:summary('a','Alpha',{retainedBy:{mainView:1}}),b:summary('b','Beta')}});
 const stop=f.model.subscribe(()=>{});
 assert.equal(f.model.getSnapshot().activeId,'a');
 f.panel.set({activePanelId:'home'});
 assert.equal(f.model.getSnapshot().activeId,null);
 f.panel.set({activePanelId:null});
 f.sessions.set({ids:['a','b'],byId:{a:summary('a','Alpha'),b:summary('b','Beta',{retainedBy:{mainView:1}})}});
 assert.equal(f.model.getSnapshot().activeId,'b');
 stop();
});

test('unchanged presentation keeps snapshot identity and does not notify consumers',()=>{
 const f=fixture();let notifications=0;
 const first=f.model.getSnapshot();
 const stop=f.model.subscribe(()=>{notifications++;});
 f.sessions.set({...f.sessions.getSnapshot(),byId:{...f.sessions.getSnapshot().byId,c:summary('c','Changed unpinned title')}});
 f.panel.set({activePanelId:null,unrelated:'change'});
 f.workspaces.set(structuredClone(f.workspaces.getSnapshot()));
 assert.equal(f.model.getSnapshot(),first);
 assert.equal(notifications,0);
 stop();
});

test('a source consumer reading early cannot swallow a later model subscription notification',()=>{
 const f=fixture();let notifications=0;
 const stopReader=f.workspaces.subscribe(()=>f.model.getSnapshot());
 const stop=f.model.subscribe(()=>{notifications++;});
 f.workspaces.set({...f.workspaces.getSnapshot(),pinnedSessionIds:['a']});
 assert.equal(notifications,1);
 assert.deepEqual(f.model.getSnapshot().rows.map(row=>row.id),['a']);
 stop();stopReader();
});

test('unpin coalesces concurrent clicks and waits for the Host pin snapshot before changing rows',async()=>{
 const pending=deferred();const f=fixture({unpin:()=>pending.promise});
 const before=f.model.getSnapshot();
 const first=f.model.unpin('b'),second=f.model.unpin('b');
 assert.equal(first,second);
 await Promise.resolve();
 assert.deepEqual(f.calls,[['unpin','b']]);
 assert.equal(f.model.getSnapshot(),before);
 pending.resolve();await first;
 assert.equal(f.model.getSnapshot(),before);
 f.workspaces.set({...f.workspaces.getSnapshot(),pinnedSessionIds:['a']});
 assert.deepEqual(f.model.getSnapshot().rows.map(row=>row.id),['a']);
});

test('failed unpin preserves Host pins and rethrows the original error, allowing an explicit retry',async()=>{
 const failure=new Error('Host unavailable');let attempts=0;
 const f=fixture({unpin:async()=>{attempts++;if(attempts===1)throw failure;}});
 const before=f.model.getSnapshot();
 await assert.rejects(f.model.unpin('b'),error=>error===failure);
 assert.equal(f.model.getSnapshot(),before);
 assert.deepEqual(f.workspaces.getSnapshot().pinnedSessionIds,['b','a']);
 await f.model.unpin('b');
 assert.equal(attempts,2);
 assert.deepEqual(f.calls,[['unpin','b'],['unpin','b']]);
 assert.equal(f.model.getSnapshot(),before);
});

test('shares source subscriptions and releases every source after the final consumer leaves',()=>{
 const f=fixture();let notifications=0;
 const listener=()=>{notifications++;};
 const stopOne=f.model.subscribe(listener),stopTwo=f.model.subscribe(listener);
 for(const source of [f.sessions,f.workspaces,f.panel])assert.equal(source.listenerCount(),1);
 stopOne();stopOne();
 for(const source of [f.sessions,f.workspaces,f.panel])assert.equal(source.listenerCount(),1);
 f.workspaces.set({...f.workspaces.getSnapshot(),pinnedSessionIds:['a']});
 assert.equal(notifications,1);
 stopTwo();
 for(const source of [f.sessions,f.workspaces,f.panel])assert.equal(source.listenerCount(),0);
 f.workspaces.set({...f.workspaces.getSnapshot(),pinnedSessionIds:['b']});
 assert.equal(notifications,1);
 assert.deepEqual(f.model.getSnapshot().rows.map(row=>row.id),['b']);
 const stopAgain=f.model.subscribe(listener);
 for(const source of [f.sessions,f.workspaces,f.panel])assert.equal(source.listenerCount(),1);
 stopAgain();
 for(const source of [f.sessions,f.workspaces,f.panel])assert.equal(source.listenerCount(),0);
});
