import React from 'react';

const h=React.createElement;

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

export function PinnedSessions({model,labels={}}){
 const snapshot=React.useSyncExternalStore(model.subscribe,model.getSnapshot,model.getSnapshot);
 const [busy,setBusy]=React.useState(new Set());
 const [error,setError]=React.useState('');
 const mounted=React.useRef(true);
 React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const title=labels.pinned||'置顶';
 const unpinLabel=labels.unpin||'取消置顶';
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
    },row.title),
    h('button',{
     type:'button',className:'cgpt-pinned-unpin',title:unpinLabel,
     'aria-label':unpinLabel+'：'+row.title,disabled:busy.has(row.id),
     onClick:()=>unpin(row.id),
    },h('svg',{width:14,height:14,viewBox:'0 0 20 20',fill:'none','aria-hidden':true},
     h('path',{d:'m3 3 14 14M8 3h5l-1 5 3 3v1H9l-4 5v-6L3 9V8l5-1V3Z',stroke:'currentColor',strokeWidth:1.3,strokeLinecap:'round',strokeLinejoin:'round'}))),
   ))),
  error&&h('div',{className:'cgpt-pinned-error',role:'alert'},error),
 );
}
