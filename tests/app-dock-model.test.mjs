import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDockModel} from '../src/app-dock-model.js';

function source(value){const listeners=new Set();return {getSnapshot:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},set(next){value=next;for(const fn of [...listeners])fn();},get count(){return listeners.size;}};}
function fixture(t,{count=10}={}){
 const all=['home','plugins',...Array.from({length:count-2},(_,i)=>'app'+i)].map(id=>({id,label:id,kind:'panel'}));
 const roster=source(all.map(row=>row.id)),panel=source({activePanelId:'home'}),nav=source({all,dockIds:all.map(row=>row.id),visible:all.slice(0,6),overflow:all.slice(6),showMore:true});
 const calls=[];let fail=false;
 const navigationModel={...nav,run(id){calls.push(['open',id]);if(fail)throw new Error('open failed');panel.set({activePanelId:id});},toggleDock(id,enabled){
  if(id==='home'&&!enabled)throw new Error('首页始终保留');
  calls.push(['pin',id,enabled]);const s=nav.getSnapshot();nav.set({...s,dockIds:enabled?[...s.dockIds,id]:s.dockIds.filter(x=>x!==id)});
 },move(id,delta){calls.push(['move',id,delta]);},setDockIds(ids){calls.push(['order',ids]);nav.set({...nav.getSnapshot(),dockIds:ids});}};
 const slots={entries:()=>roster.getSnapshot().map(key=>({options:{key}})),entriesOfSlot:()=>[{options:{id:'entry-customization'}}],subscribe:(_,fn)=>roster.subscribe(fn)};
 const model=createAppDockModel({navigationModel,slots,layout:{panelInfo:panel}});const stop=model.subscribe(()=>{});
 t.after(()=>{stop();model.dispose();});return {model,nav,roster,panel,calls,fail(){fail=true;},navigationModel,stop};
}

test('all real pinned applications appear beyond the legacy six-icon limit',t=>{
 const f=fixture(t);assert.equal(f.model.getSnapshot().apps.length,10);assert.equal(f.model.getSnapshot().dock.length,10);
 assert.equal(f.model.getSnapshot().canShowNativeMore,false);assert.deepEqual(f.calls,[]);
 const before=f.model.getSnapshot();assert.equal(f.model.getSnapshot(),before);
});
test('only entries with real main pages become applications; actions stay outside the app roster',t=>{
 const f=fixture(t);f.nav.set({...f.nav.getSnapshot(),all:[...f.nav.getSnapshot().all,{id:'no-page',kind:'panel',label:'none'},{id:'action:settings',kind:'action',label:'settings'}]});
 assert.equal(f.model.getSnapshot().apps.length,10);f.roster.set(['home']);assert.deepEqual(f.model.getSnapshot().apps.map(r=>r.id),['home']);
});
test('unpinning does not uninstall or immediately re-add the icon as recent',async t=>{
 const f=fixture(t);await f.model.open('app1');f.model.pin('app1',false);
 assert.equal(f.model.getSnapshot().dock.some(r=>r.id==='app1'),false);assert.ok(f.model.getSnapshot().apps.find(r=>r.id==='app1'));
 await f.model.open('app2');await f.model.open('app1');
 const recent=f.model.getSnapshot().dock.at(-1);assert.equal(recent.id,'app1');assert.equal(recent.pinned,false);assert.equal(recent.active,true);
 f.model.dismissRecent('app1');assert.equal(f.model.getSnapshot().dock.some(r=>r.id==='app1'),false);
 assert.deepEqual(f.calls.filter(c=>c[0]!=='open'),[['pin','app1',false]]);
});
test('all launch origins update current/recent without claiming background processes',t=>{
 const f=fixture(t);f.panel.set({activePanelId:'app3'});
 assert.equal(f.model.getSnapshot().apps.find(r=>r.id==='app3').active,true);f.panel.set({activePanelId:null});
 assert.deepEqual(f.model.getSnapshot().apps.filter(r=>r.active).map(r=>r.id),['home']);assert.equal(f.model.getSnapshot().apps.find(r=>r.id==='app3').recent,true);
 f.panel.set({activePanelId:'plugins'});assert.deepEqual(f.model.getSnapshot().apps.filter(r=>r.active).map(r=>r.id),['plugins']);
 f.panel.set({activePanelId:undefined});assert.ok(f.model.getSnapshot().apps.every(r=>!r.active));
 assert.deepEqual(f.calls,[]);
});
test('drag placement preserves Home and unrelated saved action positions',t=>{
 const f=fixture(t);f.model.place('app1','home',false);
 assert.deepEqual(f.model.getSnapshot().dock.slice(0,2).map(r=>r.id),['home','app1']);
 f.model.place('home','app2',true);assert.equal(f.model.getSnapshot().dock[0].id,'home');
 f.model.pin('app3',false);const before=f.calls.length;f.model.place('app3','app1',true);assert.equal(f.calls.length,before);
});
test('opening is validated again and failures retain the application overview',async t=>{
 const f=fixture(t);f.model.openLibrary();f.roster.set(['home','plugins']);
 assert.equal(await f.model.open('app1'),false);assert.equal(f.calls.length,0);assert.equal(f.model.getSnapshot().libraryOpen,true);
 f.fail();assert.equal(await f.model.openPluginManager(),false);assert.match(f.model.getSnapshot().error,/open failed/);assert.equal(f.model.getSnapshot().loadingId,null);
});
test('late launch resolution does not close a reopened overview',async t=>{
 const f=fixture(t);let resolve;f.navigationModel.run=()=>new Promise(done=>{resolve=done;});
 f.model.openLibrary();const pending=f.model.open('plugins');assert.equal(await f.model.open('app1'),false);
 f.model.closeLibrary();f.model.openLibrary();f.model.setQuery('new');resolve();await pending;
 assert.equal(f.model.getSnapshot().libraryOpen,true);assert.equal(f.model.getSnapshot().query,'new');
});
test('native artwork changes notify once and plugin removal drops stale icons from the UI',t=>{
 const f=fixture(t);let updates=0;const stop=f.model.subscribe(()=>updates++);
 f.model.setIcons(new Map([['app1','data:image/svg+xml,safe']]));assert.equal(updates,1);f.model.setIcons(new Map([['app1','data:image/svg+xml,safe']]));assert.equal(updates,1);
 assert.equal(f.model.getSnapshot().apps.find(r=>r.id==='app1').iconUrl,'data:image/svg+xml,safe');f.roster.set(['home']);assert.equal(f.model.getSnapshot().apps.length,1);stop();
});
test('close/reset and disposal release subscriptions without changing Host state',t=>{
 const f=fixture(t);f.model.openLibrary();f.model.setQuery('app');f.model.setFilter('pinned');f.model.closeLibrary();f.model.openLibrary();
 assert.equal(f.model.getSnapshot().query,'');assert.equal(f.model.getSnapshot().filter,'all');f.model.dispose();assert.equal(f.nav.count,0);assert.equal(f.panel.count,0);assert.equal(f.roster.count,0);assert.deepEqual(f.calls,[]);
});
