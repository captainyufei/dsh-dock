import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {WindowChromeToolbar} from '../src/window-chrome-ui.js';

const h=React.createElement;
const Menu=props=>h('div',null,props.anchor,props.open&&h('section',{role:'menu'},props.children));
const MenuItem=props=>h('button',{type:'button',disabled:props.disabled,onClick:props.onSelect},props.children);
const Modal=props=>props.open?h('section',{role:'dialog','aria-label':props.title},props.children,props.footer):null;
const text=node=>typeof node==='string'?node:(node.children||[]).map(text).join('');
const button=(view,label)=>view.root.findAllByType('button').find(node=>node.props['aria-label']===label||text(node)===label);
const item=(view,label)=>view.root.findAllByType(MenuItem).find(node=>node.props.children===label);
const rows=[
 {id:'s1',title:'示例会话',workspaceTitle:'示例工作区'},
 {id:'s2',title:'动效方案',workspaceTitle:'视频'},
];

function fixture(overrides={}){
 const listeners=new Set(),calls=[],collapseCalls=[],expandCalls=[];
 let current={context:{id:'s1',title:'示例会话'},sessions:rows,available:true,busy:false,expanded:false,hasTabs:false,canExpand:false,...overrides};
 let handler=()=>Promise.resolve({sessionId:'s1',kind:'guide'});
 let collapseHandler=()=>Promise.resolve();
 let expandHandler=()=>Promise.resolve();
 const model={getSnapshot:()=>current,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},openTab(options){calls.push(options);return handler(options);},collapsePanel(){collapseCalls.push(true);return collapseHandler();},expandPanel(){expandCalls.push(true);return expandHandler();}};
 return {model,calls,collapseCalls,expandCalls,listeners,publish(patch){current={...current,...patch};for(const listener of [...listeners])listener();},handle(fn){handler=fn;},handleCollapse(fn){collapseHandler=fn;},handleExpand(fn){expandHandler=fn;}};
}
async function mount(f){let view;await act(async()=>{view=TestRenderer.create(h(WindowChromeToolbar,{model:f.model,Menu,MenuItem,Modal}));});return view;}
async function openMenu(view){await act(async()=>button(view,'新建标签页菜单').props.onClick());}
async function unmount(view,f){await act(async()=>view.unmount());assert.equal(f.listeners.size,0);}

test('the persistent toolbar initially exposes only its anchor and opens the two real menu actions without running either',async()=>{
 const f=fixture(),view=await mount(f);
 assert.equal(button(view,'新建标签页菜单').props['aria-expanded'],false);
 assert.equal(view.root.findAllByProps({role:'menu'}).length,0);assert.deepEqual(f.calls,[]);
 await openMenu(view);
 assert.equal(button(view,'新建标签页菜单').props['aria-expanded'],true);
 assert.deepEqual(view.root.findAllByType(MenuItem).map(node=>node.props.children),['新建标签页','在完整视图中打开新标签页']);
 assert.equal(view.root.findByProps({className:'cgpt-window-menu-context'}).children[0],'基于会话：示例会话');
 assert.deepEqual(f.calls,[]);await unmount(view,f);
});

test('an expanded panel replaces the plus menu with a single direct collapse button and follows external state changes',async()=>{
 const f=fixture({expanded:true}),view=await mount(f);
 assert.equal(button(view,'收起右侧面板').props['aria-expanded'],true);
 assert.equal(button(view,'新建标签页菜单'),undefined);
 assert.equal(view.root.findAllByType(Menu).length,0);
 assert.equal(view.root.findAllByType('button').length,1);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.collapseCalls,[]);
 await act(async()=>f.publish({expanded:false}));await openMenu(view);
 assert.equal(view.root.findAllByProps({role:'menu'}).length,1);
 await act(async()=>f.publish({expanded:true}));
 assert.equal(button(view,'新建标签页菜单'),undefined);
 assert.equal(view.root.findAllByProps({role:'menu'}).length,0);
 await act(async()=>f.publish({expanded:false}));
 assert.equal(button(view,'收起右侧面板'),undefined);
 assert.equal(button(view,'新建标签页菜单').props['aria-expanded'],false);
 assert.equal(view.root.findAllByProps({role:'menu'}).length,0);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.collapseCalls,[]);await unmount(view,f);
});

test('an externally opened panel dismisses a pending Session picker and does not restore it when closed',async()=>{
 const f=fixture({context:null}),view=await mount(f);await openMenu(view);
 await act(async()=>item(view,'在完整视图中打开新标签页').props.onSelect());
 assert.equal(view.root.findAllByProps({role:'dialog'}).length,1);
 await act(async()=>f.publish({expanded:true}));
 assert.equal(view.root.findAllByProps({role:'dialog'}).length,0);
 assert.equal(button(view,'收起右侧面板').props.disabled,false);
 await act(async()=>f.publish({expanded:false}));
 assert.equal(view.root.findAllByProps({role:'dialog'}).length,0);
 assert.equal(button(view,'新建标签页菜单').props['aria-expanded'],false);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.collapseCalls,[]);await unmount(view,f);
});

test('collapse is guarded while busy, waits for the Host, and never routes through openTab',async()=>{
 const f=fixture({expanded:true,busy:true,available:false});let resolve;
 f.handleCollapse(()=>new Promise(done=>{resolve=done;}));
 const view=await mount(f);
 assert.equal(button(view,'收起右侧面板').props.disabled,true);
 await act(async()=>{button(view,'收起右侧面板').props.onClick();});
 assert.deepEqual(f.collapseCalls,[]);
 await act(async()=>f.publish({busy:false}));
 assert.equal(button(view,'收起右侧面板').props.disabled,false);
 await act(async()=>{button(view,'收起右侧面板').props.onClick();});
 assert.deepEqual(f.collapseCalls,[true]);assert.deepEqual(f.calls,[]);
 assert.equal(button(view,'收起右侧面板').props.disabled,true);
 assert.equal(button(view,'收起右侧面板').props['aria-busy'],true);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 assert.equal(view.root.findAllByProps({className:'cgpt-window-notice'}).length,0);
 await act(async()=>{button(view,'收起右侧面板').props.onClick();});
 assert.deepEqual(f.collapseCalls,[true]);
 await act(async()=>resolve());
 assert.equal(button(view,'新建标签页菜单'),undefined);
 assert.equal(button(view,'收起右侧面板').props.disabled,false);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 await act(async()=>f.publish({expanded:false}));
 assert.equal(button(view,'新建标签页菜单').props.disabled,false);
 assert.equal(button(view,'收起右侧面板'),undefined);
 assert.deepEqual(f.calls,[]);await unmount(view,f);
});

test('a Host collapse snapshot restores the plus in the same seat but keeps it disabled until the close request settles',async()=>{
 const f=fixture({expanded:true});let resolve;
 f.handleCollapse(()=>new Promise(done=>{resolve=done;}));
 const view=await mount(f);
 await act(async()=>{button(view,'收起右侧面板').props.onClick();});
 await act(async()=>f.publish({expanded:false}));
 assert.equal(button(view,'收起右侧面板'),undefined);
 assert.equal(button(view,'新建标签页菜单').props.disabled,true);
 assert.equal(button(view,'新建标签页菜单').props['aria-busy'],true);
 assert.equal(button(view,'新建标签页菜单').props['aria-expanded'],false);
 assert.equal(view.root.findAllByProps({role:'menu'}).length,0);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 assert.equal(view.root.findAllByProps({className:'cgpt-window-notice'}).length,0);
 await act(async()=>resolve());
 assert.equal(button(view,'新建标签页菜单').props.disabled,false);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.collapseCalls,[true]);await unmount(view,f);
});

test('collapse failures retain the direct collapse button, show the Host error, and allow a retry',async()=>{
 const f=fixture({expanded:true});f.handleCollapse(()=>Promise.reject(new Error('右侧面板暂时繁忙。')));
 const view=await mount(f);
 await act(async()=>button(view,'收起右侧面板').props.onClick());
 assert.match(text(view.root.findByProps({role:'alert'})),/右侧面板暂时繁忙/);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 assert.equal(button(view,'新建标签页菜单'),undefined);
 assert.equal(button(view,'收起右侧面板').props.disabled,false);
 await act(async()=>button(view,'关闭提示').props.onClick());
 assert.equal(view.root.findAllByProps({role:'alert'}).length,0);
 f.handleCollapse(()=>Promise.resolve());
 await act(async()=>button(view,'收起右侧面板').props.onClick());
 assert.deepEqual(f.collapseCalls,[true,true]);assert.deepEqual(f.calls,[]);
 assert.equal(button(view,'收起右侧面板').props.disabled,false);
 assert.equal(view.root.findAllByProps({role:'alert'}).length,0);await unmount(view,f);
});

test('a late collapse rejection after unmount releases its consumer and does not open a tab',async()=>{
 const f=fixture({expanded:true});let reject;
 f.handleCollapse(()=>new Promise((_resolve,fail)=>{reject=fail;}));
 const view=await mount(f);
 await act(async()=>{button(view,'收起右侧面板').props.onClick();});
 await unmount(view,f);
 await act(async()=>reject(new Error('面板已关闭。')));
 assert.equal(f.listeners.size,0);assert.deepEqual(f.calls,[]);assert.deepEqual(f.collapseCalls,[true]);
});

test('a closed panel with retained tabs exposes only a direct restore action instead of a creation menu',async()=>{
 const f=fixture({hasTabs:true}),view=await mount(f);
 assert.equal(button(view,'展开右侧面板').props['aria-expanded'],false);
 assert.equal(view.root.findAllByType('button').length,1);
 assert.equal(view.root.findAllByType(Menu).length,0);
 assert.equal(button(view,'新建标签页菜单'),undefined);
 assert.equal(button(view,'收起右侧面板'),undefined);
 await act(async()=>button(view,'展开右侧面板').props.onClick());
 assert.deepEqual(f.expandCalls,[true]);assert.deepEqual(f.calls,[]);assert.deepEqual(f.collapseCalls,[]);
 assert.equal(button(view,'展开右侧面板').props.disabled,false);
 await act(async()=>f.publish({expanded:true}));
 assert.equal(button(view,'展开右侧面板'),undefined);
 assert.equal(button(view,'收起右侧面板').props.disabled,false);
 await act(async()=>f.publish({expanded:false}));
 assert.equal(button(view,'展开右侧面板').props.disabled,false);
 await act(async()=>f.publish({hasTabs:false}));
 assert.equal(button(view,'展开右侧面板'),undefined);
 assert.equal(button(view,'新建标签页菜单').props['aria-expanded'],false);
 await unmount(view,f);
});

test('an existing Session with no saved tabs directly expands its native tool area without creating a tab',async()=>{
 const f=fixture({hasTabs:false,canExpand:true}),view=await mount(f);
 assert.equal(button(view,'展开右侧面板').props['aria-expanded'],false);
 assert.equal(view.root.findAllByType('button').length,1);
 assert.equal(view.root.findAllByType(Menu).length,0);
 assert.equal(button(view,'新建标签页菜单'),undefined);
 await act(async()=>button(view,'展开右侧面板').props.onClick());
 assert.deepEqual(f.expandCalls,[true]);assert.deepEqual(f.calls,[]);assert.deepEqual(f.collapseCalls,[]);
 assert.equal(view.root.findAllByProps({role:'dialog'}).length,0);
 await act(async()=>f.publish({expanded:true}));
 assert.equal(button(view,'收起右侧面板').props.disabled,false);
 await act(async()=>f.publish({expanded:false,canExpand:false}));
 assert.equal(button(view,'展开右侧面板'),undefined);
 assert.equal(button(view,'新建标签页菜单').props['aria-expanded'],false);
 await unmount(view,f);
});

for(const [changed,patch] of [['retained tabs',{hasTabs:true}],['expand capability',{canExpand:true}],['active Session',{context:{id:'s2',title:'动效方案'}}]]){
 for(const overlay of ['menu','picker']){
  test(`a change to ${changed} dismisses the previous ${overlay} without running an action`,async()=>{
   const f=fixture({context:null}),view=await mount(f);await openMenu(view);
   if(overlay==='picker')await act(async()=>item(view,'新建标签页').props.onSelect());
   assert.equal(view.root.findAllByProps({role:overlay==='picker'?'dialog':'menu'}).length,1);
   await act(async()=>f.publish(patch));
   assert.equal(view.root.findAllByProps({role:'menu'}).length,0);
   assert.equal(view.root.findAllByProps({role:'dialog'}).length,0);
   await act(async()=>f.publish({hasTabs:false,canExpand:false,context:null}));
   assert.equal(button(view,'新建标签页菜单').props['aria-expanded'],false);
   assert.equal(view.root.findAllByProps({role:'dialog'}).length,0);
   assert.deepEqual(f.calls,[]);assert.deepEqual(f.expandCalls,[]);assert.deepEqual(f.collapseCalls,[]);
   await unmount(view,f);
  });
 }
}

test('restoring retained tabs guards busy and duplicate clicks without opening or creating another tab',async()=>{
 const f=fixture({hasTabs:true,busy:true,available:false});let resolve;
 f.handleExpand(()=>new Promise(done=>{resolve=done;}));
 const view=await mount(f);
 assert.equal(button(view,'展开右侧面板').props.disabled,true);
 await act(async()=>{button(view,'展开右侧面板').props.onClick();});
 assert.deepEqual(f.expandCalls,[]);
 await act(async()=>f.publish({busy:false}));
 assert.equal(button(view,'展开右侧面板').props.disabled,false);
 await act(async()=>{button(view,'展开右侧面板').props.onClick();});
 assert.equal(button(view,'展开右侧面板').props.disabled,true);
 assert.equal(button(view,'展开右侧面板').props['aria-busy'],true);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 assert.equal(view.root.findAllByProps({className:'cgpt-window-notice'}).length,0);
 await act(async()=>{button(view,'展开右侧面板').props.onClick();});
 assert.deepEqual(f.expandCalls,[true]);
 await act(async()=>resolve());
 assert.equal(button(view,'展开右侧面板').props.disabled,false);
 assert.equal(button(view,'收起右侧面板'),undefined);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.collapseCalls,[]);await unmount(view,f);
});

test('an early Host expansion keeps the same-seat collapse action locked until the restore request settles',async()=>{
 const f=fixture({hasTabs:true});let resolve;
 f.handleExpand(()=>new Promise(done=>{resolve=done;}));
 const view=await mount(f);
 await act(async()=>{button(view,'展开右侧面板').props.onClick();});
 await act(async()=>f.publish({expanded:true}));
 assert.equal(button(view,'展开右侧面板'),undefined);
 assert.equal(button(view,'收起右侧面板').props.disabled,true);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 assert.equal(view.root.findAllByProps({className:'cgpt-window-notice'}).length,0);
 await act(async()=>{button(view,'收起右侧面板').props.onClick();});
 assert.deepEqual(f.collapseCalls,[]);
 await act(async()=>resolve());
 assert.equal(button(view,'收起右侧面板').props.disabled,false);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.expandCalls,[true]);await unmount(view,f);
});

test('restore failures keep the existing content affordance and report the Host error before allowing a retry',async()=>{
 const f=fixture({hasTabs:true});f.handleExpand(()=>Promise.reject(new Error('原会话的工具暂不可用。')));
 const view=await mount(f);
 await act(async()=>button(view,'展开右侧面板').props.onClick());
 assert.match(text(view.root.findByProps({role:'alert'})),/原会话的工具暂不可用/);
 assert.equal(button(view,'展开右侧面板').props.disabled,false);
 assert.equal(button(view,'新建标签页菜单'),undefined);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 f.handleExpand(()=>Promise.resolve());
 await act(async()=>button(view,'展开右侧面板').props.onClick());
 assert.equal(view.root.findAllByProps({role:'alert'}).length,0);
 assert.deepEqual(f.expandCalls,[true,true]);assert.deepEqual(f.calls,[]);assert.deepEqual(f.collapseCalls,[]);
 await unmount(view,f);
});

test('a restore failure from an old Session does not display an error on the new Session',async()=>{
 const f=fixture({hasTabs:true});let reject;
 f.handleExpand(()=>new Promise((_resolve,fail)=>{reject=fail;}));
 const view=await mount(f);
 await act(async()=>{button(view,'展开右侧面板').props.onClick();});
 await act(async()=>f.publish({context:{id:'s2',title:'动效方案'},hasTabs:false}));
 await act(async()=>reject(new Error('旧会话已切换。')));
 assert.equal(button(view,'新建标签页菜单').props.disabled,false);
 assert.equal(view.root.findAllByProps({role:'alert'}).length,0);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.collapseCalls,[]);await unmount(view,f);
});

test('a successful creation from an old Session does not display a success notice on the new Session',async()=>{
 const f=fixture();let resolve;
 f.handle(()=>new Promise(done=>{resolve=done;}));
 const view=await mount(f);await openMenu(view);
 await act(async()=>{item(view,'新建标签页').props.onSelect();});
 await act(async()=>f.publish({context:{id:'s2',title:'动效方案'}}));
 await act(async()=>resolve());
 assert.equal(view.root.findAllByProps({role:'alert'}).length,0);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 assert.deepEqual(f.calls,[{fullscreen:false}]);await unmount(view,f);
});

test('the Session picker accepts its expected navigation to the selected Session and still reports success',async()=>{
 const f=fixture({context:null});let resolve;
 f.handle(()=>new Promise(done=>{resolve=done;}));
 const view=await mount(f);await openMenu(view);
 await act(async()=>item(view,'在完整视图中打开新标签页').props.onSelect());
 await act(async()=>{button(view,'在「动效方案」中打开标签页').props.onClick();});
 await act(async()=>f.publish({context:{id:'s2',title:'动效方案'},hasTabs:true,expanded:true}));
 await act(async()=>resolve());
 assert.match(text(view.root.findByProps({role:'status'})),/完整视图/);
 assert.deepEqual(f.calls,[{fullscreen:true,sessionId:'s2'}]);
 assert.deepEqual(f.expandCalls,[]);assert.deepEqual(f.collapseCalls,[]);await unmount(view,f);
});

test('a cancelled restore stays silent while releasing the direct restore action for retry',async()=>{
 const f=fixture({hasTabs:true});
 f.handleExpand(()=>Promise.reject(Object.assign(new Error('已停止过期展开。'),{code:'cancelled'})));
 const view=await mount(f);
 await act(async()=>button(view,'展开右侧面板').props.onClick());
 assert.equal(view.root.findAllByProps({role:'alert'}).length,0);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 assert.equal(button(view,'展开右侧面板').props.disabled,false);
 assert.deepEqual(f.expandCalls,[true]);assert.deepEqual(f.calls,[]);await unmount(view,f);
});

test('a late restore rejection after unmount releases its consumer without opening or collapsing a tab',async()=>{
 const f=fixture({hasTabs:true});let reject;
 f.handleExpand(()=>new Promise((_resolve,fail)=>{reject=fail;}));
 const view=await mount(f);
 await act(async()=>{button(view,'展开右侧面板').props.onClick();});
 await unmount(view,f);
 await act(async()=>reject(new Error('面板会话已卸载。')));
 assert.equal(f.listeners.size,0);assert.deepEqual(f.expandCalls,[true]);assert.deepEqual(f.calls,[]);assert.deepEqual(f.collapseCalls,[]);
});

for(const [label,fullscreen] of [['新建标签页',false],['在完整视图中打开新标签页',true]]){
 test(`${label} uses the retained context and closes the menu before awaiting the Host`,async()=>{
  const f=fixture();let resolve;
  f.handle(()=>new Promise(done=>{resolve=done;}));
  const view=await mount(f);await openMenu(view);
  await act(async()=>{item(view,label).props.onSelect();});
  assert.deepEqual(f.calls,[{fullscreen}]);assert.equal(view.root.findAllByProps({role:'menu'}).length,0);
  assert.equal(view.root.findAllByProps({role:'dialog'}).length,0);
  assert.equal(view.root.findAllByProps({role:'status'}).length,0);
  await act(async()=>resolve());
  assert.match(text(view.root.findByProps({role:'status'})),fullscreen?/完整视图/:/文件、终端或浏览器/);
  await unmount(view,f);
 });
}

test('without a retained context the full-view action asks for an existing Session, filters its catalog, then preserves both choices',async()=>{
 const f=fixture({context:null}),view=await mount(f);await openMenu(view);
 await act(async()=>item(view,'在完整视图中打开新标签页').props.onSelect());
 assert.deepEqual(f.calls,[]);assert.equal(view.root.findAllByProps({role:'menu'}).length,0);
 assert.equal(view.root.findByProps({role:'dialog'}).props['aria-label'],'选择会话');
 assert.equal(view.root.findAllByProps({'aria-label':'在「示例会话」中打开标签页'}).length,1);
 await act(async()=>view.root.findByProps({'aria-label':'搜索已有会话'}).props.onChange({target:{value:'视频'}}));
 const choices=view.root.findAllByType('button').filter(node=>String(node.props['aria-label']||'').startsWith('在「'));
 assert.deepEqual(choices.map(node=>node.props['aria-label']),['在「动效方案」中打开标签页']);
 await act(async()=>choices[0].props.onClick());
 assert.deepEqual(f.calls,[{fullscreen:true,sessionId:'s2'}]);
 assert.equal(view.root.findAllByProps({role:'dialog'}).length,0);
 await unmount(view,f);
});

test('an empty or unmatched Session catalog gives a clear explanation and never creates a replacement Session',async()=>{
 const f=fixture({context:null,sessions:[]}),view=await mount(f);await openMenu(view);
 await act(async()=>item(view,'新建标签页').props.onSelect());
 assert.match(text(view.root.findByProps({className:'cgpt-window-empty'})),/暂无已有会话/);
 assert.equal(view.root.findAllByType('input').length,0);assert.deepEqual(f.calls,[]);
 await act(async()=>button(view,'取消').props.onClick());
 assert.equal(view.root.findAllByProps({role:'dialog'}).length,0);
 await act(async()=>f.publish({sessions:rows}));await openMenu(view);
 await act(async()=>item(view,'新建标签页').props.onSelect());
 await act(async()=>view.root.findByType('input').props.onChange({target:{value:'does-not-exist'}}));
 assert.equal(text(view.root.findByProps({className:'cgpt-window-empty'})),'没有匹配的会话。');
 assert.deepEqual(f.calls,[]);await unmount(view,f);
});

test('unavailable services and an action in progress disable the appropriate affordances and guard menu callbacks',async()=>{
 const f=fixture({available:false}),view=await mount(f);await openMenu(view);
 assert.equal(button(view,'新建标签页菜单').props.disabled,false);
 for(const entry of view.root.findAllByType(MenuItem)){
  assert.equal(entry.props.disabled,true);await act(async()=>entry.props.onSelect());
 }
 assert.equal(text(view.root.findByProps({className:'cgpt-window-menu-context'})),'原生标签页功能暂不可用');
 assert.deepEqual(f.calls,[]);
 await act(async()=>f.publish({available:true,busy:true}));
 assert.equal(button(view,'新建标签页菜单').props.disabled,true);
 assert.equal(button(view,'新建标签页菜单').props['aria-busy'],true);
 assert.equal(text(view.root.findByProps({role:'status'})),'正在打开标签页…');
 for(const entry of view.root.findAllByType(MenuItem)){
  assert.equal(entry.props.disabled,true);await act(async()=>entry.props.onSelect());
 }
 assert.deepEqual(f.calls,[]);await unmount(view,f);
});

test('Host errors are visible, dismissible and never become a success notice',async()=>{
 const f=fixture();f.handle(()=>Promise.reject(new Error('会话已切换，已取消新建标签页。')));
 const view=await mount(f);await openMenu(view);
 await act(async()=>item(view,'新建标签页').props.onSelect());
 assert.match(text(view.root.findByProps({role:'alert'})),/会话已切换/);
 assert.equal(view.root.findAllByProps({role:'status'}).length,0);
 assert.equal(view.root.findAllByProps({role:'menu'}).length,0);
 await act(async()=>button(view,'关闭提示').props.onClick());
 assert.equal(view.root.findAllByProps({role:'alert'}).length,0);await unmount(view,f);
});

test('portal pointer, click and context events remain isolated and late Host completion does not retain a consumer',async()=>{
 const f=fixture();let resolve;
 f.handle(()=>new Promise(done=>{resolve=done;}));
 const view=await mount(f);let stopped=0;
 const wrapper=view.root.findByProps({className:'cgpt-window-toolbar'});
 for(const event of ['onClick','onPointerDown','onContextMenu'])wrapper.props[event]({stopPropagation(){stopped++;}});
 assert.equal(stopped,3);await openMenu(view);
 await act(async()=>{item(view,'新建标签页').props.onSelect();});
 await unmount(view,f);await act(async()=>resolve());assert.equal(f.listeners.size,0);
});

test('success notice timers expire normally and are released when the toolbar unmounts',async()=>{
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 const timers=new Map(),ownTokens=new Set();let sequence=0;
 globalThis.setTimeout=(callback,delay,...args)=>{
  if(delay!==4500)return originalSet(callback,delay,...args);
  const token={id:++sequence};ownTokens.add(token);timers.set(token,callback);return token;
 };
 globalThis.clearTimeout=token=>{if(ownTokens.has(token))timers.delete(token);else originalClear(token);};
 try{
  const f=fixture(),view=await mount(f);await openMenu(view);
  await act(async()=>item(view,'新建标签页').props.onSelect());
  assert.equal(timers.size,1);
  const [token,expire]=timers.entries().next().value;timers.delete(token);
  await act(async()=>expire());assert.equal(view.root.findAllByProps({role:'status'}).length,0);
  await openMenu(view);await act(async()=>item(view,'新建标签页').props.onSelect());
  assert.equal(timers.size,1);await unmount(view,f);assert.equal(timers.size,0);
 }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});
