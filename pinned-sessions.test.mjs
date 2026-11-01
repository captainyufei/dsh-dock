import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {transform} from 'esbuild';
import {PinnedSessions,mountPinnedSessionsSeat,pinnedWorkspaceRules} from './pinned-sessions.js';
import {createPinnedSessionsModel} from './pinned-sessions-model.js';

function fixture(rows=[{id:'one',title:'Pinned chat',workspaceTitle:'Project A'}]){
 let snapshot={rows,activeId:null};const listeners=new Set(),calls=[];
 const model={
  getSnapshot:()=>snapshot,
  subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
  open:id=>{calls.push(['open',id]);return true;},
  unpin:async id=>{calls.push(['unpin',id]);},
 };
 return {model,calls,update(value){snapshot=value;for(const listener of listeners)listener();},count:()=>listeners.size};
}

test('the global pin list follows Host updates, opens existing chats and keeps portal events out of Home navigation',()=>{
 const f=fixture();let view;
 act(()=>{view=TestRenderer.create(React.createElement(PinnedSessions,{model:f.model}));});
 const open=()=>view.root.findByProps({className:'cgpt-pinned-open'});
 assert.deepEqual(open().children,['Pinned chat']);
 assert.equal(open().props.title,'Pinned chat\nProject A');
 act(()=>open().props.onClick());
 assert.deepEqual(f.calls,[['open','one']]);
 let stopped=0;
 view.root.findByType('section').props.onClick({stopPropagation(){stopped++;}});
 assert.equal(stopped,1);
 act(()=>f.update({rows:[{id:'two',title:'Renamed chat',workspaceTitle:'Project B'}],activeId:'two'}));
 assert.deepEqual(open().children,['Renamed chat']);
 assert.equal(open().props['aria-current'],'page');
 act(()=>view.unmount());
 assert.equal(f.count(),0);
});

test('unpin waits for the Host and presents a failure without hiding the original row',async()=>{
 const f=fixture();let reject;
 f.model.unpin=id=>{f.calls.push(['unpin',id]);return new Promise((_resolve,no)=>{reject=no;});};
 let view;
 await act(async()=>{view=TestRenderer.create(React.createElement(PinnedSessions,{model:f.model}));});
 const unpin=()=>view.root.findByProps({className:'cgpt-pinned-unpin'});
 let request;
 await act(async()=>{request=unpin().props.onClick();await Promise.resolve();});
 assert.equal(unpin().props.disabled,true);
 assert.equal(view.root.findByProps({className:'cgpt-pinned-open'}).children[0],'Pinned chat');
 await act(async()=>{reject(new Error('Host refused'));await request;});
 assert.equal(unpin().props.disabled,false);
 assert.equal(view.root.findByProps({role:'alert'}).children[0],'Host refused');
 assert.deepEqual(f.calls,[['unpin','one']]);
 await act(async()=>view.unmount());
});

test('an empty Host pin set leaves no empty section or placeholder',()=>{
 const f=fixture([]);let view;
 act(()=>{view=TestRenderer.create(React.createElement(PinnedSessions,{model:f.model}));});
 assert.equal(view.toJSON(),null);
 act(()=>view.unmount());
});

test('the portal seat is a disposable sibling and never reparents the native workspace browser',()=>{
 const calls=[];const seat={setAttribute:(...args)=>calls.push(['attribute',...args]),remove:()=>calls.push(['remove'])};
 const region={insertBefore:(...args)=>calls.push(['insert',...args])};
 const browser={parentElement:region,ownerDocument:{createElement:tag=>{assert.equal(tag,'div');return seat;}}};
 const root={querySelector:selector=>{assert.equal(selector,'[data-slot="sidebar.workspaces"]');return browser;}};
 const anchor={closest:()=>({parentElement:root})};
 const mount=mountPinnedSessionsSeat(anchor);
 assert.equal(mount.node,seat);
 assert.equal(browser.parentElement,region);
 assert.deepEqual(calls.find(call=>call[0]==='insert'),['insert',seat,browser]);
 mount.dispose();
 assert.equal(calls.at(-1)[0],'remove');
 assert.equal(browser.parentElement,region);
});

const filters=view=>view.root.findAllByType('style').filter(node=>Object.hasOwn(node.props,'data-cgpt-pinned-workspace-filter'));
const filterText=view=>filters(view).map(node=>node.children.join('')).join('');
function hostSource(initial){
 let current=initial;const listeners=new Set();
 return {getSnapshot:()=>current,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
  set:value=>{current=value;for(const listener of [...listeners])listener();},count:()=>listeners.size};
}

test('native duplicate filtering follows confirmed Host pin snapshots, never the pin or unpin promise alone',async()=>{
 const sessions=hostSource({ids:['one'],byId:{one:{id:'one',title:'Pinned chat',blank:false}}});
 const workspace=hostSource({items:[{title:'Project A',sessionIds:['one']}],pinnedSessionIds:[],archivedSessionIds:[]});
 const panel=hostSource({activePanelId:null});let confirmPin,confirmUnpin;
 const uiWorkspace={
  pinSession:()=>new Promise(resolve=>{confirmPin=resolve;}),
  unpinSession:()=>new Promise(resolve=>{confirmUnpin=resolve;}),
 };
 const model=createPinnedSessionsModel({sessions:{list:sessions},workspaces:{list:workspace},layout:{panelInfo:panel},uiWorkspace});
 let view;await act(async()=>{view=TestRenderer.create(React.createElement(PinnedSessions,{model}));});
 const pinRequest=uiWorkspace.pinSession('one');
 assert.equal(filters(view).length,0);
 await act(async()=>{confirmPin();await pinRequest;});
 assert.equal(filters(view).length,0);
 await act(async()=>workspace.set({...workspace.getSnapshot(),pinnedSessionIds:['one']}));
 const confirmedFilter=filterText(view);
 assert.equal(confirmedFilter,pinnedWorkspaceRules([{id:'one'}]));
 assert.equal(view.root.findByProps({className:'cgpt-pinned-open'}).children[0],'Pinned chat');
 let unpinRequest;
 await act(async()=>{unpinRequest=view.root.findByProps({className:'cgpt-pinned-unpin'}).props.onClick();await Promise.resolve();});
 assert.equal(filterText(view),confirmedFilter);
 await act(async()=>{confirmUnpin();await unpinRequest;});
 assert.equal(filterText(view),confirmedFilter);
 await act(async()=>workspace.set({...workspace.getSnapshot(),pinnedSessionIds:[]}));
 assert.equal(filters(view).length,0);assert.equal(view.toJSON(),null);
 await act(async()=>view.unmount());
 for(const source of [sessions,workspace,panel])assert.equal(source.count(),0);
});

test('a refused unpin keeps the native duplicate hidden while preserving the global shortcut and error',async()=>{
 const f=fixture();let reject;
 f.model.unpin=()=>new Promise((_resolve,no)=>{reject=no;});
 let view;await act(async()=>{view=TestRenderer.create(React.createElement(PinnedSessions,{model:f.model}));});
 const before=filterText(view);assert.ok(before);
 let request;await act(async()=>{request=view.root.findByProps({className:'cgpt-pinned-unpin'}).props.onClick();});
 assert.equal(filterText(view),before);
 await act(async()=>{reject(new Error('Host pin update refused'));await request;});
 assert.equal(filterText(view),before);
 assert.equal(view.root.findByProps({className:'cgpt-pinned-open'}).children[0],'Pinned chat');
 assert.equal(view.root.findByProps({role:'alert'}).children[0],'Host pin update refused');
 await act(async()=>view.unmount());assert.equal(f.count(),0);
});

test('empty snapshots and unmount remove their filter, and a later pin does not retain stale selectors',async()=>{
 const f=fixture([{id:'one',title:'First'},{id:'two',title:'Second'}]);let view;
 await act(async()=>{view=TestRenderer.create(React.createElement(PinnedSessions,{model:f.model}));});
 assert.equal(filters(view).length,1);
 assert.equal(filterText(view),pinnedWorkspaceRules([{id:'one'},{id:'two'}]));
 await act(async()=>f.update({rows:[],activeId:null}));
 assert.equal(filters(view).length,0);assert.equal(view.toJSON(),null);
 await act(async()=>f.update({rows:[{id:'three',title:'Third'}],activeId:null}));
 assert.equal(filterText(view),pinnedWorkspaceRules([{id:'three'}]));
 assert.equal(view.root.findAllByProps({className:'cgpt-pinned-open'}).length,1);
 await act(async()=>view.unmount());assert.equal(view.toJSON(),null);assert.equal(f.count(),0);
});

test('hostile and Unicode Session IDs remain exact CSS strings scoped only to native workspace browsing trees',async()=>{
 const ids=['ordinary','a\"] , body { display:block } /*</style>\\\n💡','0 spaced:slash/id'];
 const rules=pinnedWorkspaceRules(ids.map(id=>({id})));
 const parsed=await transform(rules,{loader:'css'});
 assert.deepEqual(parsed.warnings,[]);
 assert.equal((rules.match(/\{display:none!important\}/g)||[]).length,1);
 assert.equal((rules.match(/,/g)||[]).length,ids.length-1);
 assert.equal(rules.includes('</style>'),false);assert.equal(rules.includes('\n'),false);
 const selectors=rules.slice(0,-'{display:none!important}'.length).split(',');
 assert.equal(selectors.length,ids.length);
 for(const [index,selector] of selectors.entries()){
  const scope='[data-slot="sidebar.workspaces"] [role="tree"] [data-row-key=';
  assert.ok(selector.startsWith(scope));
  const quoted=selector.slice(scope.length,-1);
  assert.match(quoted,/^"(?:[a-zA-Z0-9_-]|\\[0-9a-f]+ )*"$/u);
  const decoded=quoted.slice(1,-1).replace(/\\([0-9a-f]+) /gu,(_match,hex)=>String.fromCodePoint(Number.parseInt(hex,16)));
  assert.equal(decoded,'session:'+ids[index]);
 }
 // Native search results can also use a tree, but have no data-row-key.
 // Global shortcuts use a different attribute, outside the workspace tree;
 // folder rows likewise cannot match the exact session: identity above.
 assert.equal(rules.includes('role="listbox"'),false);
 assert.equal(rules.includes('data-cgpt-pinned-session'),false);
 assert.equal(rules.includes('data-row-key="workspace'),false);
 assert.equal(pinnedWorkspaceRules([]),'');
 const f=fixture(ids.map((id,index)=>({id,title:'Global pin '+index})));let view;
 await act(async()=>{view=TestRenderer.create(React.createElement(PinnedSessions,{model:f.model}));});
 const globalRows=view.root.findAllByProps({className:'cgpt-pinned-row'});
 assert.deepEqual(globalRows.map(row=>row.props['data-cgpt-pinned-session']),ids);
 for(const row of globalRows)assert.equal(row.props['data-row-key'],undefined);
 await act(async()=>view.unmount());assert.equal(f.count(),0);
});
