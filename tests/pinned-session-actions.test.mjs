import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {NATIVE_SESSION_ROW_ACTIONS,PINNED_SESSION_ROW_ACTIONS,mirrorNativePinnedActions} from '../src/pinned-session-actions.js';
import {PinnedSessions} from '../src/pinned-sessions.js';
import {createPinnedSessionsModel} from '../src/pinned-sessions-model.js';

function source(initial){
 let current=initial;const listeners=new Set();
 return {getSnapshot:()=>current,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
  set(value){current=value;for(const listener of [...listeners])listener();},count:()=>listeners.size};
}

function registry(initial=[]){
 let entries=initial,changed;
 const registrations=[],removed=[];
 return {registrations,removed,
  slots:{
   entriesOfSlot(name){assert.equal(name,NATIVE_SESSION_ROW_ACTIONS);return entries;},
   subscribe(name,listener){assert.equal(name,NATIVE_SESSION_ROW_ACTIONS);changed=listener;return()=>removed.push('subscription');},
   register(options,component){registrations.push({options,component});return()=>removed.push(options.id);},
  },
  update(next){entries=next;changed();},
 };
}

function nativeEntry(id='archive'){
 return {options:{id,order:100,priority:3,children:{nativeOwner:{}},registrant:'host'},
  component:()=>null,inject:()=>{throw new Error('Registration must not execute a Host action');},locale:'workspace',store:{native:true}};
}

test('pinned actions preserve the native archive component and injection without copying pin or Host ownership',()=>{
 const archive=nativeEntry(),f=registry([nativeEntry('pin'),archive,nativeEntry('other')]);
 const stop=mirrorNativePinnedActions(f.slots);
 assert.equal(f.registrations.length,1);
 const {options,component}=f.registrations[0];
 assert.equal(options.name,PINNED_SESSION_ROW_ACTIONS);
 assert.equal(options.id,'archive');assert.equal(options.order,100);assert.equal(options.priority,3);
 assert.equal(options.inject,archive.inject);assert.equal(component,archive.component);
 assert.equal(options.locale,archive.locale);assert.equal(options.store,archive.store);
 assert.equal(options.children,undefined);assert.equal(options.registrant,undefined);
 stop();assert.deepEqual(f.removed,['subscription','archive']);
});

test('a late native archive contribution is mirrored, replaced and disposed without stale registrations',()=>{
 const f=registry(),stop=mirrorNativePinnedActions(f.slots);
 assert.equal(f.registrations.length,0);
 const first=nativeEntry();f.update([first]);
 assert.equal(f.registrations.length,1);assert.equal(f.registrations[0].component,first.component);
 const second=nativeEntry();f.update([nativeEntry('pin'),second]);
 assert.equal(f.registrations.length,2);assert.equal(f.registrations[1].options.inject,second.inject);
 assert.deepEqual(f.removed,['archive']);
 stop();assert.deepEqual(f.removed,['archive','subscription','archive']);
});

test('a refused archive registration propagates its failure without a stale subscription',()=>{
 const f=registry([nativeEntry()]);let subscribed=false;
 f.slots.register=()=>{throw new Error('Host registry refused');};
 f.slots.subscribe=()=>{subscribed=true;return()=>{};};
 assert.throws(()=>mirrorNativePinnedActions(f.slots),/Host registry refused/);
 assert.equal(subscribed,false);assert.deepEqual(f.removed,[]);
});

test('the pinned row renders native archive before unpin with exact owner props and keeps portal clicks out of navigation',async()=>{
 const id='session" /💡',title='Original pinned title',calls=[],owners=[];
 const model={getSnapshot:()=>snapshot,subscribe:()=>()=>{},open:value=>calls.push(['open',value]),unpin:async value=>calls.push(['unpin',value])};
 const snapshot={rows:[{id,title,workspaceTitle:'Project A'}],activeId:id};
 function renderSlot(...args){
  assert.equal(args.length,2,'Native row actions have no Menu hook context');
  const [name,owner]=args;assert.equal(name,PINNED_SESSION_ROW_ACTIONS);owners.push(owner);
  return React.createElement('button',{'data-native-archive':id,onClick:()=>calls.push(['archive',owner.sessionId])},'Archive');
 }
 let view;await act(async()=>{view=TestRenderer.create(React.createElement(PinnedSessions,{model,renderSlot}));});
 try{
  assert.deepEqual(owners,[{sessionId:id,displayTitle:title}]);
  const actions=view.root.findByProps({className:'cgpt-pinned-actions'});
  const buttons=actions.findAllByType('button');
  assert.equal(buttons.length,2);assert.equal(buttons[0].props['data-native-archive'],id);
  assert.equal(buttons[1].props.className,'cgpt-pinned-unpin');
  await act(async()=>buttons[0].props.onClick());
  let stopped=0;
  for(const event of ['onClick','onPointerDown','onContextMenu'])view.root.findByType('section').props[event]({stopPropagation(){stopped++;}});
  assert.equal(stopped,3);assert.deepEqual(calls,[['archive',id]]);
 }finally{await act(async()=>view.unmount());}
});

test('native archive completion alone does not hide a pin; only a confirmed Host archived snapshot removes it',async()=>{
 const sessions=source({ids:['one'],byId:{one:{id:'one',title:'Pinned chat',blank:false}}});
 const workspaces=source({items:[],pinnedSessionIds:['one'],archivedSessionIds:[]});
 const panel=source({activePanelId:null});const calls=[];
 const model=createPinnedSessionsModel({sessions:{list:sessions},workspaces:{list:workspaces},layout:{panelInfo:panel},uiWorkspace:{
  openSession:id=>calls.push(['open',id]),unpinSession:id=>calls.push(['unpin',id]),
 }});
 let complete;
 function renderSlot(_name,owner){return React.createElement('button',{'data-native-archive':owner.sessionId,onClick:()=>{
  calls.push(['archive',owner.sessionId]);return new Promise(resolve=>{complete=resolve;});
 }},'Archive');}
 let view;await act(async()=>{view=TestRenderer.create(React.createElement(PinnedSessions,{model,renderSlot}));});
 try{
  const filter=()=>view.root.findByProps({'data-cgpt-pinned-workspace-filter':''}).children.join('');
  const before=filter();let pending;
  await act(async()=>{pending=view.root.findByProps({'data-native-archive':'one'}).props.onClick();});
  assert.equal(filter(),before);assert.equal(view.root.findByProps({className:'cgpt-pinned-title'}).children[0],'Pinned chat');
  await act(async()=>{complete();await pending;});
  assert.equal(filter(),before);assert.deepEqual(workspaces.getSnapshot().pinnedSessionIds,['one']);
  await act(async()=>workspaces.set({...workspaces.getSnapshot(),archivedSessionIds:['one'],pinnedSessionIds:[]}));
  assert.equal(view.toJSON(),null);assert.deepEqual(calls,[['archive','one']]);
 }finally{await act(async()=>view.unmount());}
 for(const boundary of [sessions,workspaces,panel])assert.equal(boundary.count(),0);
});
