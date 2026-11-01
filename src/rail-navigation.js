import React from 'react';

const h=React.createElement;

export function mountRailActionsSeat(anchor){
 const nav=anchor?.closest?.('nav');
 if(!nav)return null;
 const node=nav.ownerDocument.createElement('span');
 node.className='cgpt-rail-actions-seat';
 nav.appendChild(node);
 return {node,dispose:()=>node.remove()};
}

function ActionIcon({name}){
 const props={width:20,height:20,viewBox:'0 0 20 20',fill:'none',stroke:'currentColor',strokeWidth:1.4,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true};
 if(name==='browse')return h('svg',props,h('circle',{cx:10,cy:10,r:7.5}),h('path',{d:'m13.2 6.8-2 4.4-4.4 2 2-4.4 4.4-2Z'}));
 if(name==='create')return h('svg',props,h('rect',{x:3,y:3,width:14,height:14,rx:3}),h('path',{d:'M10 6.5v7M6.5 10h7'}));
 return h('svg',props,h('path',{d:'m8 2-.5 2-1.7 1-2-.6L2 7.6l1.5 1.5v1.8L2 12.4l1.8 3.2 2-.6 1.7 1L8 18h4l.5-2 1.7-1 2 .6 1.8-3.2-1.5-1.5V9.1L18 7.6l-1.8-3.2-2 .6-1.7-1L12 2H8Z'}),h('circle',{cx:10,cy:10,r:2.6}));
}

export function RailActionButtons({navigationModel}){
 const snapshot=React.useSyncExternalStore(navigationModel.subscribe,navigationModel.getSnapshot,navigationModel.getSnapshot);
 const [error,setError]=React.useState('');
 const alive=React.useRef(true);
 React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function run(id){
  setError('');
  try{await navigationModel.run(id);}catch(reason){if(alive.current)setError(reason?.message||'入口暂时无法打开，请重试。');}
 }
 const stop=event=>event.stopPropagation();
 return h('span',{className:'cgpt-rail-action-buttons',onClick:stop,onPointerDown:stop,onContextMenu:stop},
  snapshot.visible.map((entry,index)=>entry.kind!=='action'?null:h('button',{
   key:entry.id,type:'button','aria-label':entry.label,title:entry.label,
   'data-cgpt-rail-action':entry.id,draggable:false,style:{order:index},onClick:()=>run(entry.id),
  },h(ActionIcon,{name:entry.icon}))),
  error&&h('span',{className:'cgpt-rail-action-error',role:'alert'},error),
 );
}

/** Replaces only the default More contribution. Other providers remain intact. */
export function RailOverflowContent({navigationModel,MenuItem,onOpen,onDismiss}){
 const snapshot=React.useSyncExternalStore(navigationModel.subscribe,navigationModel.getSnapshot,navigationModel.getSnapshot);
 const [error,setError]=React.useState('');
 const alive=React.useRef(true);
 React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 React.useEffect(()=>{if(!snapshot.showMore)onDismiss();},[snapshot.showMore,onDismiss]);
 async function run(entry){
  setError('');
  try{
   if(entry.kind==='panel'&&typeof onOpen==='function')onOpen(entry.id);
   else await navigationModel.run(entry.id);
   onDismiss();
  }catch(reason){if(alive.current)setError(reason?.message||'入口暂时无法打开，请重试。');}
 }
 return h(React.Fragment,null,
  snapshot.overflow.map(entry=>h(MenuItem,{key:entry.id,current:entry.active,onSelect:()=>run(entry),
   ...(entry.kind==='action'?{icon:h(ActionIcon,{name:entry.icon})}:{}),
  },entry.label)),
  error&&h('div',{className:'cgpt-rail-overflow-error',role:'alert'},error),
 );
}
