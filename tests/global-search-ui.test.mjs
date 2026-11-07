import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {GlobalSearchPalette} from '../src/global-search-ui.js';

const h=React.createElement;
const Modal=props=>props.open?h('section',{role:'dialog','aria-label':props.title},props.children):null;
const categories=[{id:'all',label:'全部'},{id:'actions',label:'操作'},{id:'sessions',label:'会话'},{id:'workspaces',label:'工作区'},{id:'text',label:'聊天内容'}];
const initialGroups=[
 {id:'actions',label:'操作',items:[{id:'new',kind:'action',title:'新聊天',shortcut:'⌘N'}]},
 {id:'sessions',label:'最近会话',items:[{id:'chat:1',kind:'session',title:'产品设计',detail:'DeepSeek'},{id:'chat:2',kind:'session',title:'物流查询',detail:'amz'}]},
];
function fixture(patch={}){
 let snapshot={open:true,query:'',category:'all',categories,groups:initialGroups,loading:false,error:null,busyId:null,hasMore:false,...patch};
 const listeners=new Set(),calls=[];
 const change=patch=>{snapshot={...snapshot,...patch};for(const listener of [...listeners])listener();};
 const model={
  getSnapshot:()=>snapshot,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  open(){calls.push(['open']);change({open:true});},close(){calls.push(['close']);change({open:false});},
  setQuery(query){calls.push(['query',query]);change({query});},setCategory(category){calls.push(['category',category]);change({category});},
  async select(id){calls.push(['select',id]);return true;},
 };
 return {model,change,calls,listeners};
}
async function mount(f){
 let view;const scrolls=[];let focuses=0;
 await act(async()=>{view=TestRenderer.create(h(GlobalSearchPalette,{model:f.model,Modal}),{
  createNodeMock:element=>element.type==='input'?{focus(){focuses++;}}:element.props.role==='option'?{scrollIntoView(options){scrolls.push([element.props['data-search-item'],options]);}}:null,
 });});
 return {view,scrolls,focuses:()=>focuses};
}
const input=view=>view.root.findByProps({role:'combobox'});
const options=view=>view.root.findAllByProps({role:'option'});
const active=view=>options(view).find(row=>row.props['aria-selected'])?.props['data-search-item'];
const text=node=>typeof node==='string'?node:(node.children||[]).map(text).join('');
function key(view,name,extra={}){let prevented=false;input(view).props.onKeyDown({key:name,preventDefault(){prevented=true;},...extra});return prevented;}

test('native modal owns dialog lifecycle and the combobox identifies its selected result',async()=>{
 const f=fixture({open:false}),{view}=await mount(f);
 assert.equal(view.root.findAllByProps({role:'combobox'}).length,0);
 await act(async()=>f.model.open());
 const modal=view.root.findByType(Modal),field=input(view),list=view.root.findByProps({role:'listbox'});
 assert.equal(modal.props.headless,true);assert.equal(modal.props.shortcutModal,'dsh-dock.search');
 assert.equal(field.props['data-modal-autofocus'],true);
 assert.equal(field.props['aria-controls'],list.props.id);
 assert.equal(field.props['aria-activedescendant'],options(view)[0].props.id);
 assert.equal(field.props['aria-expanded'],true);
 let consumed;await act(async()=>{consumed=key(view,'Escape');});
 assert.equal(consumed,false);assert.equal(f.model.getSnapshot().open,true);
 await act(async()=>modal.props.onClose());assert.equal(f.model.getSnapshot().open,false);
 await act(async()=>view.unmount());assert.equal(f.listeners.size,0);
});

test('arrow keys traverse groups, wrap, scroll the active option and Enter selects without moving input focus',async()=>{
 const f=fixture(),{view,scrolls,focuses}=await mount(f);
 assert.equal(active(view),'new');
 await act(async()=>key(view,'ArrowDown'));assert.equal(active(view),'chat:1');
 await act(async()=>key(view,'ArrowDown'));assert.equal(active(view),'chat:2');
 await act(async()=>key(view,'ArrowDown'));assert.equal(active(view),'new');
 await act(async()=>key(view,'ArrowUp'));assert.equal(active(view),'chat:2');
 assert.equal(input(view).props['aria-activedescendant'],options(view)[2].props.id);
 assert.deepEqual(scrolls.at(-1),['chat:2',{block:'nearest'}]);
 assert.equal(focuses(),0);
 await act(async()=>key(view,'Enter'));assert.deepEqual(f.calls,[['select','chat:2']]);
 await act(async()=>view.unmount());
});

test('result updates preserve a surviving active ID and otherwise choose the first current result',async()=>{
 const f=fixture(),{view}=await mount(f);
 await act(async()=>key(view,'ArrowDown'));
 await act(async()=>f.change({groups:[{id:'sessions',label:'会话',items:[initialGroups[1].items[1],initialGroups[1].items[0]]}]}));
 assert.equal(active(view),'chat:1');
 await act(async()=>f.change({groups:[{id:'sessions',label:'会话',items:[initialGroups[1].items[1]]}]}));
 assert.equal(active(view),'chat:2');
 await act(async()=>f.change({groups:[]}));
 assert.equal(input(view).props['aria-activedescendant'],undefined);
 await act(async()=>key(view,'Enter'));assert.deepEqual(f.calls,[]);
 await act(async()=>view.unmount());
});

test('IME composition and keyCode 229 never execute a result',async()=>{
 const f=fixture(),{view}=await mount(f);
 await act(async()=>{
  input(view).props.onCompositionStart();key(view,'Enter');input(view).props.onCompositionEnd();
  key(view,'Enter',{isComposing:true});key(view,'Enter',{nativeEvent:{isComposing:true}});
  key(view,'Enter',{keyCode:229});key(view,'Enter',{nativeEvent:{keyCode:229}});
 });
 assert.deepEqual(f.calls,[]);
 await act(async()=>key(view,'Enter'));assert.deepEqual(f.calls,[['select','new']]);
 await act(async()=>view.unmount());
});

test('query and reachable category buttons update the model and category changes return focus to the input',async()=>{
 const f=fixture(),{view,focuses}=await mount(f);
 await act(async()=>input(view).props.onChange({target:{value:'设计'}}));
 assert.equal(input(view).props.value,'设计');
 const group=view.root.findByProps({'aria-label':'搜索范围'}),buttons=group.findAllByType('button');
 assert.deepEqual(buttons.map(text),categories.map(category=>category.label));
 assert.ok(buttons.every(button=>button.props.tabIndex!==-1&&!button.props.disabled));
 await act(async()=>buttons[2].props.onClick());
 assert.equal(buttons[2].props['aria-pressed'],true);assert.equal(buttons[0].props['aria-pressed'],false);
 assert.equal(focuses(),1);assert.deepEqual(f.calls,[['query','设计'],['category','sessions']]);
 await act(async()=>view.unmount());
});

test('mouse activation preserves input focus and in-flight selection blocks duplicate clicks or Enter',async()=>{
 const f=fixture();let finish;
 f.model.select=id=>{f.calls.push(['select',id]);return new Promise(resolve=>{finish=resolve;});};
 const {view}=await mount(f);let prevented=false;
 await act(async()=>{
  const row=options(view)[1];row.props.onMouseEnter();row.props.onMouseDown({preventDefault(){prevented=true;}});row.props.onClick();
  row.props.onClick();key(view,'Enter');
 });
 assert.equal(prevented,true);assert.equal(active(view),'chat:1');
 assert.deepEqual(f.calls,[['select','chat:1']]);
 assert.ok(options(view).every(row=>row.props['aria-disabled']===true));
 await act(async()=>{finish(false);});
 assert.ok(options(view).every(row=>!row.props['aria-disabled']));
 await act(async()=>f.change({busyId:'another'}));
 await act(async()=>key(view,'Enter'));assert.equal(f.calls.length,1);
 await act(async()=>view.unmount());
});

test('closing clears local pending state and an older operation cannot settle a reopened selection',async()=>{
 const f=fixture(),finishes=[];
 f.model.select=id=>{f.calls.push(['select',id]);return new Promise(resolve=>finishes.push(resolve));};
 const {view}=await mount(f);
 await act(async()=>key(view,'Enter'));
 assert.ok(options(view).every(row=>row.props['aria-disabled']===true));
 await act(async()=>f.model.close());
 await act(async()=>f.model.open());
 assert.ok(options(view).every(row=>!row.props['aria-disabled']));
 await act(async()=>key(view,'Enter'));
 assert.equal(f.calls.filter(call=>call[0]==='select').length,2);
 await act(async()=>finishes[0](false));
 assert.ok(options(view).every(row=>row.props['aria-disabled']===true));
 await act(async()=>finishes[1](true));
 assert.ok(options(view).every(row=>!row.props['aria-disabled']));
 await act(async()=>view.unmount());
});

test('text query hint, loading, model errors and result truncation are explicit and snippets remain plain text',async()=>{
 const f=fixture({category:'text',groups:[]}),{view}=await mount(f);
 assert.match(text(view.toJSON()),/输入关键词，搜索聊天内容/);
 await act(async()=>f.change({query:'设计',loading:true}));
 assert.equal(input(view).props['aria-busy'],true);assert.match(text(view.toJSON()),/正在搜索/);
 await act(async()=>f.change({loading:false,error:'当前无法搜索，请重试。'}));
 assert.equal(text(view.root.findByProps({role:'alert'})),'当前无法搜索，请重试。');
 const snippet='<img src=x onerror=alert(1)> example';
 await act(async()=>f.change({error:null,hasMore:true,groups:[{id:'text',label:'聊天内容',items:[{id:'match',kind:'text',title:'命中会话',snippet}]}]}));
 assert.equal(text(view.root.findByProps({className:'cgpt-global-search-snippet'})),snippet);
 assert.equal(view.root.findAllByType('img').length,0);assert.match(text(view.toJSON()),/继续输入以缩小范围/);
 await act(async()=>view.root.findByProps({'aria-label':'关闭搜索'}).props.onClick());
 assert.equal(f.model.getSnapshot().open,false);
 await act(async()=>view.unmount());
});
