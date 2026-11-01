import test from 'node:test';
import assert from 'node:assert/strict';
import {createRailNavigationModel} from './rail-navigation-model.js';

const PANELS='sidebar.panellist',MORE='sidebar.panellist.actions',SETTINGS='sidebar.settings';
const panel=(id,order=0,label=id)=>({options:{id,order,label}});
function fixture({extra=[],capacity=6,getLabels,preferences,nativePins}={}){
 const calls=[],slotListeners=new Map();
 let activePanelId='home',language='zh',faceReads=0;
 const panelListeners=new Set(),localeListeners=new Set();
 const provider={options:{id:'entry-customization',priority:0},registrant:'Gb',locale:'entryCustomization',inject:()=>{
  faceReads++;return {browsePlugins:()=>calls.push('browse'),createPlugin:()=>calls.push('create')};
 }};
 const settings={registrant:'Gb',locale:'settings',store:{create:()=>{calls.push('settings:create');return {actions:{open:()=>calls.push('settings:open')}};}}};
 const state={
  [PANELS]:[panel('plugins',0,'插件'),...extra,panel('schedules',10,'任务'),panel('home',-10,()=>language==='zh'?'首页':'Home')],
  [MORE]:[provider],[SETTINGS]:[settings],
 };
 const winners=name=>{
  const seen=new Set();
  return [...state[name]].sort((a,b)=>(a.options?.priority||0)-(b.options?.priority||0)).filter(entry=>{
   const id=entry.options?.id;
   if(seen.has(id))return false;seen.add(id);return true;
  });
 };
 const slots={
  entries:name=>state[name],entriesOfSlot:winners,
  subscribe(name,listener){let listeners=slotListeners.get(name);if(!listeners){listeners=new Set();slotListeners.set(name,listeners);}listeners.add(listener);return()=>listeners.delete(listener);},
 };
 const layout={panelInfo:{getSnapshot:()=>({activePanelId}),subscribe(listener){panelListeners.add(listener);return()=>panelListeners.delete(listener);}},selectPanel:id=>calls.push(['panel',id])};
 const dict={zh:{install:'浏览更多插件',create:'创建你的插件',trigger:'设置'},en:{install:'Browse plugins',create:'Create plugin',trigger:'Settings'}};
 const locale={bind:()=>key=>dict[language][key]||key,subscribe(listener){localeListeners.add(listener);return()=>localeListeners.delete(listener);}};
 const model=createRailNavigationModel({slots,layout,locale},{capacity,getLabels,preferences,nativePins});
 return {model,calls,state,provider,settings,slots,faceReads:()=>faceReads,slotListeners,panelListeners,localeListeners,
  emit(name){for(const listener of [...(slotListeners.get(name)||[])])listener();},
  select(id){activePanelId=id;for(const listener of [...panelListeners])listener();},
  language(value){language=value;for(const listener of [...localeListeners])listener();},
 };
}

test('defaults to native panels without filler action icons or More and does not invoke any action during discovery',()=>{
 const f=fixture();const snapshot=f.model.getSnapshot();
 assert.deepEqual(snapshot.visible.map(row=>row.id),['home','schedules','plugins']);
 assert.deepEqual(snapshot.all.map(row=>row.id),['home','schedules','plugins','action:browse-plugins','action:create-plugin','action:settings']);
 assert.deepEqual(snapshot.dockIds,['home','schedules','plugins']);
 assert.equal(snapshot.customized,false);assert.equal(snapshot.capacity,6);
 assert.deepEqual(snapshot.visible.map(row=>row.kind),['panel','panel','panel']);
 assert.deepEqual(snapshot.all.map(row=>row.icon),['home','schedules','plugins','browse','create','settings']);
 assert.equal(snapshot.showMore,false);assert.deepEqual(snapshot.overflow,[]);
 assert.deepEqual(f.calls,[]);assert.equal(f.faceReads(),1);
 assert.equal(f.model.getSnapshot(),snapshot);assert.equal(f.faceReads(),1);
 assert.throws(()=>snapshot.visible[0].label='changed',TypeError);
});

for(const count of [7,8])test(`${count} real entries leave only the first six visible`,()=>{
 const extras=Array.from({length:count-3},(_,index)=>panel('native-'+index,-100-index));
 const f=fixture({extra:extras});const snapshot=f.model.getSnapshot();
 assert.equal(snapshot.visible.length,6);assert.equal(snapshot.overflow.length,count-6);assert.equal(snapshot.showMore,true);
 assert.deepEqual(snapshot.visible.slice(0,3).map(row=>row.id),['home','schedules','plugins']);
 assert.deepEqual([...snapshot.visible,...snapshot.overflow].filter(row=>row.kind==='panel').slice(3).map(row=>row.id),extras.slice().sort((a,b)=>a.options.order-b.options.order).map(entry=>entry.options.id));
});

test('keeps unknown winning More providers reachable without treating them as fake panels',()=>{
 const f=fixture();f.state[MORE].push({options:{id:'third-party-tools'}});
 assert.equal(f.model.getSnapshot().showMore,true);
 assert.equal(f.model.getSnapshot().overflow.length,0);
 assert.throws(()=>f.model.run('third-party-tools'),/不可用/);
 assert.deepEqual(f.calls,[]);
});

test('runs panels through selectPanel and actions through original callbacks with lazy Settings creation',()=>{
 const f=fixture();
 f.model.run('schedules');f.model.run('action:browse-plugins');f.model.run('action:create-plugin');f.model.run('action:settings');
 assert.deepEqual(f.calls,[['panel','schedules'],'browse','create','settings:create','settings:open']);
 assert.throws(()=>f.model.run('invented-panel'),/不可用/);
 assert.equal(f.calls.some(call=>Array.isArray(call)&&String(call[1]).startsWith('action:')),false);
});

test('raw entries retain the real provider behind our shadow and provider HMR never executes a stale closure',()=>{
 const f=fixture();const before=f.model.getSnapshot();let notifications=0;
 const stop=f.model.subscribe(()=>notifications++);
 f.state[MORE].unshift({options:{id:'entry-customization',priority:-20},registrant:'Gb',inject:()=>{throw new Error('Must not call our own shadow');}});
 f.emit(MORE);
 assert.equal(f.model.getSnapshot(),before);assert.equal(notifications,0);
 const replacement={...f.provider,inject:()=>({browsePlugins:()=>f.calls.push('new:browse'),createPlugin:()=>f.calls.push('new:create')})};
 f.state[MORE]=[f.state[MORE][0],replacement];f.emit(MORE);
 assert.equal(f.model.getSnapshot(),before);
 f.model.run('action:browse-plugins');f.model.run('action:create-plugin');
 assert.deepEqual(f.calls,['new:browse','new:create']);
 f.state[MORE]=[f.state[MORE][0]];f.emit(MORE);
 assert.deepEqual(f.model.getSnapshot().visible.map(row=>row.id),['home','schedules','plugins']);
 assert.deepEqual(f.model.getSnapshot().all.map(row=>row.id),['home','schedules','plugins','action:settings']);
 assert.throws(()=>f.model.run('action:create-plugin'),/不可用/);
 stop();
});

test('rejects incompatible action shapes and stale panels or Settings entries without opening another target',()=>{
 const f=fixture();
 f.state[MORE]=[{...f.provider,locale:'other-locale'},{...f.provider,inject:()=>({browsePlugins:()=>f.calls.push('partial')})}];
 assert.equal(f.model.getSnapshot().all.some(row=>row.id==='action:browse-plugins'),false);
 assert.throws(()=>f.model.run('action:browse-plugins'),/不可用/);
 f.state[PANELS]=f.state[PANELS].filter(entry=>entry.options.id!=='schedules');
 assert.throws(()=>f.model.run('schedules'),/不可用/);
 f.state[SETTINGS]=[{...f.settings,locale:'other-locale'}];
 assert.throws(()=>f.model.run('action:settings'),/不可用/);
 assert.deepEqual(f.calls,[]);
});

test('Settings HMR reads the current shared store only when the user runs its action',()=>{
 const f=fixture();
 f.state[SETTINGS]=[{registrant:'Gb',locale:'settings',store:{create:()=>{f.calls.push('new:settings:create');return {actions:{open:()=>f.calls.push('new:settings:open')}};}}}];
 f.model.getSnapshot();assert.deepEqual(f.calls,[]);
 f.model.run('action:settings');
 assert.deepEqual(f.calls,['new:settings:create','new:settings:open']);
});

test('updates locale and active panels while preferring supplied action labels',()=>{
 let customSettings='偏好设置';
 const f=fixture({getLabels:()=>({settings:customSettings})});let notifications=0;
 const stop=f.model.subscribe(()=>notifications++);
 assert.equal(f.model.getSnapshot().all.at(-1).label,'偏好设置');
 f.select('schedules');
 assert.equal(f.model.getSnapshot().visible.find(row=>row.id==='home').active,false);
 assert.equal(f.model.getSnapshot().visible.find(row=>row.id==='schedules').active,true);
 f.language('en');
 assert.equal(f.model.getSnapshot().visible[0].label,'Home');
 assert.equal(f.model.getSnapshot().all.find(row=>row.id==='action:browse-plugins').label,'Browse plugins');
 customSettings='Preferences';f.language('en');
 assert.equal(f.model.getSnapshot().all.at(-1).label,'Preferences');
 assert.equal(notifications,3);
 stop();
});

test('stable presentation ignores equivalent shadow updates and cleanup releases every subscription',()=>{
 const f=fixture();let notifications=0;
 const stopOne=f.model.subscribe(()=>notifications++),stopTwo=f.model.subscribe(()=>notifications++);
 for(const name of [PANELS,MORE,SETTINGS])assert.equal(f.slotListeners.get(name).size,1);
 assert.equal(f.panelListeners.size,1);assert.equal(f.localeListeners.size,1);
 const before=f.model.getSnapshot();
 f.emit(MORE);f.emit(PANELS);f.select('home');
 assert.equal(f.model.getSnapshot(),before);assert.equal(notifications,0);
 stopOne();stopOne();
 assert.equal(f.panelListeners.size,1);
 stopTwo();
 for(const name of [PANELS,MORE,SETTINGS])assert.equal(f.slotListeners.get(name).size,0);
 assert.equal(f.panelListeners.size,0);assert.equal(f.localeListeners.size,0);
 f.language('en');f.emit(MORE);assert.equal(notifications,0);
});

function preferenceStore(initial=null){
 let current=initial;
 const listeners=new Set(),writes=[];
 return {getSnapshot:()=>current,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  set(value){writes.push(value);current=value;for(const listener of [...listeners])listener();},
  external(value){current=value;for(const listener of [...listeners])listener();},listeners,writes};
}

test('users add, reorder and remove optional icons without changing the native panel registry or invoking callbacks',()=>{
 const preferences=preferenceStore(),f=fixture({preferences});
 const panelsBefore=[...f.state[PANELS]];
 const stop=f.model.subscribe(()=>{});
 f.model.toggleDock('action:settings',true);
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','schedules','plugins','action:settings']);
 assert.deepEqual(preferences.getSnapshot(),['home','schedules','plugins','action:settings']);
 f.model.move('action:settings',-2);
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','action:settings','schedules','plugins']);
 f.model.move('action:settings',-50);
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','action:settings','schedules','plugins']);
 f.model.toggleDock('action:settings',false);
 assert.deepEqual(f.model.getSnapshot().visible.map(row=>row.id),['home','schedules','plugins']);
 assert.equal(f.model.getSnapshot().showMore,false);
 assert.equal(f.model.getSnapshot().customized,true);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.state[PANELS],panelsBefore);
 stop();assert.equal(preferences.listeners.size,0);
});

test('Home remains first and cannot be removed while unselected native panels move to More',()=>{
 const f=fixture();
 f.model.setDockIds(['plugins','home','plugins','action:settings']);
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','plugins','action:settings']);
 assert.deepEqual(f.model.getSnapshot().overflow.map(row=>row.id),['schedules']);
 assert.equal(f.model.getSnapshot().showMore,true);
 assert.throws(()=>f.model.toggleDock('home',false),/首页/);
 f.model.move('home',2);
 assert.equal(f.model.getSnapshot().visible[0].id,'home');
 f.model.toggleDock('schedules',true);
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','plugins','action:settings','schedules']);
 assert.equal(f.model.getSnapshot().showMore,false);
 assert.throws(()=>f.model.toggleDock('invented',true),/不可用/);
 assert.throws(()=>f.model.move('action:create-plugin',1),/尚未/);
 assert.throws(()=>f.model.setDockIds(null),TypeError);
});

test('selected entries respect the six-icon limit and unselected native panels stay reachable once in More',()=>{
 const f=fixture({extra:[panel('native-a'),panel('native-b')]});
 f.model.setDockIds(['plugins','action:settings','native-b','schedules','action:browse-plugins','action:create-plugin']);
 const snapshot=f.model.getSnapshot();
 assert.deepEqual(snapshot.visible.map(row=>row.id),['home','plugins','action:settings','native-b','schedules','action:browse-plugins']);
 assert.deepEqual(snapshot.overflow.map(row=>row.id),['action:create-plugin','native-a']);
 assert.equal(snapshot.showMore,true);
 assert.equal(new Set([...snapshot.visible,...snapshot.overflow].map(row=>row.id)).size,8);
});

test('customized orders retain missing plugin IDs across edits and restore the same Dock position when the plugin returns',()=>{
 const extra=panel('native-extra');const preferences=preferenceStore(['home','native-extra','plugins','action:settings']);
 const f=fixture({extra:[extra],preferences});const stop=f.model.subscribe(()=>{});
 f.state[PANELS]=f.state[PANELS].filter(entry=>entry.options.id!=='native-extra');f.emit(PANELS);
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','plugins','action:settings']);
 assert.deepEqual(preferences.writes,[]);
 f.model.toggleDock('schedules',true);
 assert.deepEqual(preferences.getSnapshot(),['home','native-extra','plugins','action:settings','schedules']);
 f.model.move('action:settings',-1);
 assert.deepEqual(preferences.getSnapshot(),['home','native-extra','action:settings','plugins','schedules']);
 f.state[PANELS].push(extra);f.emit(PANELS);
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','native-extra','action:settings','plugins','schedules']);
 f.state[PANELS]=f.state[PANELS].filter(entry=>entry.options.id!=='native-extra');f.emit(PANELS);
 f.model.setDockIds(['home','plugins','schedules']);
 assert.ok(preferences.getSnapshot().includes('native-extra'));
 stop();
});

test('an explicit custom Dock leaves newly installed panels in More until chosen, while default Dock follows native additions',()=>{
 const preferences=preferenceStore(['home','plugins']),f=fixture({preferences});const stop=f.model.subscribe(()=>{});
 f.state[PANELS].push(panel('new-panel'));f.emit(PANELS);
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','plugins']);
 assert.deepEqual(f.model.getSnapshot().overflow.map(row=>row.id),['schedules','new-panel']);
 f.model.resetDock();
 assert.equal(preferences.getSnapshot(),null);
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','schedules','plugins','new-panel']);
 assert.equal(f.model.getSnapshot().customized,false);
 assert.equal(f.model.getSnapshot().showMore,false);
 stop();
});

test('persisted user choices survive a new model and external preference updates share one subscription',()=>{
 const preferences=preferenceStore(['plugins','action:settings']);
 const f=fixture({preferences});let notifications=0;
 const stopA=f.model.subscribe(()=>notifications++),stopB=f.model.subscribe(()=>notifications++);
 assert.equal(preferences.listeners.size,1);
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','plugins','action:settings']);
 const reloaded=fixture({preferences});
 assert.deepEqual(reloaded.model.getSnapshot().dockIds,f.model.getSnapshot().dockIds);
 preferences.external(['home','schedules']);
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','schedules']);
 assert.equal(notifications,2);
 stopA();assert.equal(preferences.listeners.size,1);
 stopB();assert.equal(preferences.listeners.size,0);
});

test('failed preference persistence leaves presentation and subscription notifications unchanged',()=>{
 const preferences=preferenceStore(),f=fixture({preferences});let notifications=0;
 const stop=f.model.subscribe(()=>notifications++),before=f.model.getSnapshot();
 preferences.set=()=>{throw new Error('Storage is unavailable');};
 assert.throws(()=>f.model.toggleDock('action:settings',true),/Storage is unavailable/);
 assert.equal(f.model.getSnapshot(),before);assert.equal(notifications,0);
 assert.deepEqual(f.calls,[]);
 stop();
});

test('missing optional action providers remain saved and reappear only if selected, without triggering their callbacks',()=>{
 const preferences=preferenceStore(['home','action:browse-plugins','plugins','action:settings']),f=fixture({preferences});
 const stop=f.model.subscribe(()=>{});
 f.state[MORE]=[];f.state[SETTINGS]=[];f.emit(MORE);f.emit(SETTINGS);
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','plugins']);
 assert.deepEqual(preferences.writes,[]);
 f.state[MORE]=[f.provider];f.state[SETTINGS]=[f.settings];f.emit(MORE);f.emit(SETTINGS);
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','action:browse-plugins','plugins','action:settings']);
 assert.deepEqual(f.calls,[]);
 stop();
});

test('native-unpinned panels use More without changing Dock preferences and return when the Host renders them again',()=>{
 let unpinned=['schedules','plugins'];const listeners=new Set();
 const nativePins={getSnapshot:()=>unpinned,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);}};
 const preferences=preferenceStore(['home','schedules','plugins','action:settings']);
 const f=fixture({preferences,nativePins});const stop=f.model.subscribe(()=>{});
 assert.deepEqual(f.model.getSnapshot().dockIds,['home','schedules','plugins','action:settings']);
 assert.deepEqual(f.model.getSnapshot().visible.map(row=>row.id),['home','plugins','action:settings']);
 assert.deepEqual(f.model.getSnapshot().overflow.map(row=>row.id),['schedules']);
 assert.equal(f.model.getSnapshot().showMore,true);
 assert.deepEqual(preferences.writes,[]);assert.deepEqual(f.calls,[]);
 unpinned=[];for(const listener of [...listeners])listener();
 assert.deepEqual(f.model.getSnapshot().visible.map(row=>row.id),['home','schedules','plugins','action:settings']);
 assert.equal(f.model.getSnapshot().showMore,false);
 stop();assert.equal(listeners.size,0);
});
