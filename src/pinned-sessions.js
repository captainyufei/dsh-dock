import React from 'react';

const h=React.createElement;
const NoTooltip=({children})=>children;

// Scope to native browsing trees, leaving search results and Session data intact.
// Hex escaping protects attribute selectors even if a Host id contains CSS syntax.
const cssString=value=>'"'+value.replace(/[^a-zA-Z0-9_-]/gu,char=>'\\'+char.codePointAt(0).toString(16)+' ')+'"';
export function pinnedWorkspaceRules(rows){
 const selectors=rows.map(row=>'[data-slot="sidebar.workspaces"] [role="tree"] [data-row-key='+cssString('session:'+row.id)+']');
 return selectors.length?selectors.join(',')+'{display:none!important}':'';
}

/** Own a sibling seat without replacing or moving the native workspace browser. */
export function mountPinnedSessionsSeat(anchor){
 const root=anchor?.closest?.('nav')?.parentElement;
 const browser=root?.querySelector('[data-slot="sidebar.workspaces"]');
 if(!browser?.parentElement)return null;
 const node=browser.ownerDocument.createElement('div');
 node.className='cgpt-pinned-seat';
 node.setAttribute('data-cgpt-pinned-seat','');
 browser.parentElement.insertBefore(node,browser);
 return {node,dispose:()=>node.remove()};
}

export function PinnedSessions({model,labels={},StateDot,Tooltip=NoTooltip}){
 const snapshot=React.useSyncExternalStore(model.subscribe,model.getSnapshot,model.getSnapshot);
 const [busy,setBusy]=React.useState(new Set());
 const [error,setError]=React.useState('');
 const mounted=React.useRef(true);
 React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const title=labels.pinned||'置顶';
 const unpinLabel=labels.unpin||'取消置顶聊天';
 const runningLabel=labels.running||'进行中';
 function open(id){
  setError('');
  try{if(model.open(id)===false)setError(labels.openFailed||'这条会话当前无法打开。');}catch(reason){setError(reason?.message||labels.openFailed||'打开会话失败，请重试。');}
 }
 async function unpin(id){
  setError('');
  setBusy(previous=>new Set([...previous,id]));
  try{await model.unpin(id);}catch(reason){
   if(mounted.current)setError(reason?.message||labels.unpinFailed||'取消置顶失败，请重试。');
  }finally{
   if(mounted.current)setBusy(previous=>{const next=new Set(previous);next.delete(id);return next;});
  }
 }
 if(snapshot.rows.length===0&&!error)return null;
 // React portal events still bubble through HomeIcon's navigation-button
 // ancestor. Stop them here so opening a pinned chat cannot also select Home.
 const stop=event=>event.stopPropagation();
 return h('section',{
  className:'cgpt-pinned-section','aria-label':title,
  onClick:stop,onPointerDown:stop,onContextMenu:stop,
 },
  h('style',{'data-cgpt-pinned-workspace-filter':''},pinnedWorkspaceRules(snapshot.rows)),
  h('h2',{className:'cgpt-pinned-heading'},title),
  h('ul',{className:'cgpt-pinned-list'},snapshot.rows.map(row=>
   h('li',{key:row.id,className:'cgpt-pinned-row','data-cgpt-pinned-session':row.id,'data-active':snapshot.activeId===row.id||undefined},
    h('button',{
     type:'button',className:'cgpt-pinned-open',
     title:row.workspaceTitle?row.title+'\n'+row.workspaceTitle:row.title,
     'aria-current':snapshot.activeId===row.id?'page':undefined,
     onClick:()=>open(row.id),
    },
     row.running&&h('span',{className:'cgpt-pinned-status',role:'img','aria-label':runningLabel,title:runningLabel},
      StateDot?h(StateDot,{state:'ongoing'}):h('span',{className:'cgpt-pinned-spinner','aria-hidden':true})),
     h('span',{className:'cgpt-pinned-title'},row.title)),
    h(Tooltip,{label:unpinLabel,side:'left',delayMs:400},h('button',{
     type:'button',className:'cgpt-pinned-unpin',
     'aria-label':unpinLabel+'：'+row.title,disabled:busy.has(row.id),
     onClick:()=>unpin(row.id),
    },h('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':true},
     h('path',{transform:'rotate(40 12 12)',d:'M8 2h8a1 1 0 0 1 0 2h-1v5.2l2.8 3.1a1 1 0 0 1-.8 1.7H13v6.5L12 22l-1-1.5V14H7a1 1 0 0 1-.8-1.7L9 9.2V4H8a1 1 0 0 1 0-2Z'})))),
   ))),
  error&&h('div',{className:'cgpt-pinned-error',role:'alert'},error),
 );
}
