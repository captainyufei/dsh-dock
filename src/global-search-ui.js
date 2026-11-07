import React from 'react';

const h=React.createElement;
const stop=event=>event.stopPropagation();
const ICONS={
 search:'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.7-1.8L20 20',
 action:'m13 2-8 11h6l-1 9 9-13h-6l1-7Z',
 session:'M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.6-.8L4 20l1.3-4.4a9 9 0 0 1-.8-3.6 8 8 0 1 1 15.5-.5Z',
 workspace:'M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3V6Z',
 text:'M5 3h10l4 4v14H5V3Zm9 0v5h5M8 12h8M8 16h6',
};
const ACTION_ICONS={
 'action:home':'M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7M17 3l4 4-11 11-5 1 1-5L17 3Zm-3 3 4 4',
 'action:plugins':'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
 'action:schedules':'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
};
function Icon({kind='search',itemId}){
 const path=kind==='action'?(ACTION_ICONS[itemId]||ICONS.action):(ICONS[kind]||ICONS.search);
 return h('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:path}));
}

/** The Host Modal owns the portal, Escape, focus trap and focus restoration. */
export function GlobalSearchPalette({model,Modal}){
 const snapshot=React.useSyncExternalStore(model.subscribe,model.getSnapshot,model.getSnapshot);
 const [activeId,setActiveId]=React.useState(null);
 const [pendingId,setPendingId]=React.useState(null);
 const inputRef=React.useRef(null),rows=React.useRef(new Map()),composing=React.useRef(false),selection=React.useRef(null);
 const instance=React.useId(),listId=instance+'-results',statusId=instance+'-status';
 const groups=snapshot.groups||[],items=groups.flatMap(group=>group.items||[]);
 const currentId=items.some(item=>item.id===activeId)?activeId:items[0]?.id??null;
 const busy=snapshot.busyId!=null||pendingId!==null;
 const optionId=id=>instance+'-option-'+encodeURIComponent(id);
 React.useEffect(()=>{
  setActiveId(snapshot.open?currentId:null);
  if(!snapshot.open){composing.current=false;selection.current=null;setPendingId(null);}
 },[snapshot.open,currentId]);
 React.useEffect(()=>()=>{selection.current=null;},[model]);
 React.useLayoutEffect(()=>{
  if(snapshot.open&&currentId!==null)rows.current.get(currentId)?.scrollIntoView?.({block:'nearest'});
 },[snapshot.open,currentId,groups]);
 async function select(id){
  if(id===null||busy||selection.current||!snapshot.open)return;
  const operation={id};selection.current=operation;setPendingId(id);
  try{await model.select(id);}catch{
   // The model publishes selection failures into snapshot.error.
  }finally{
   if(selection.current===operation){selection.current=null;setPendingId(null);}
  }
 }
 function onKeyDown(event){
  if(composing.current||event.isComposing||event.nativeEvent?.isComposing||event.keyCode===229||event.nativeEvent?.keyCode===229)return;
  if(event.altKey||event.ctrlKey||event.metaKey)return;
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();
   if(items.length){
    const index=items.findIndex(item=>item.id===currentId),delta=event.key==='ArrowDown'?1:-1;
    setActiveId(items[(index+delta+items.length)%items.length].id);
   }
  }else if(event.key==='Enter'){
   event.preventDefault();void select(currentId);
  }
 }
 const needsTextQuery=snapshot.category==='text'&&!snapshot.query?.trim();
 const emptyLabel=needsTextQuery?'输入关键词，搜索聊天内容':snapshot.query?.trim()?'没有找到匹配的结果':'暂无可用结果';
 const error=typeof snapshot.error==='string'?snapshot.error:snapshot.error?.message;
 const status=snapshot.loading?'正在搜索…':items.length?'找到 '+items.length+' 条结果'+(snapshot.hasMore?'，继续输入可缩小范围':''):emptyLabel;
 return h(Modal,{
  open:snapshot.open,title:'搜索',headless:true,className:'cgpt-global-search-modal',contentClassName:'cgpt-global-search-modal-content',
  shortcutModal:'dsh-dock.search',onClose:()=>model.close(),
 },h('div',{className:'cgpt-global-search',onClick:stop,onPointerDown:stop,onContextMenu:stop},
  h('div',{className:'cgpt-global-search-input-row'},
   h(Icon),
   h('input',{
    ref:inputRef,type:'text',role:'combobox',className:'cgpt-global-search-input',value:snapshot.query||'',
    placeholder:'搜索会话、工作区或操作…','aria-label':'搜索会话、工作区或操作',
    'aria-autocomplete':'list','aria-expanded':Boolean(snapshot.open),'aria-controls':listId,
    'aria-activedescendant':snapshot.open&&currentId!==null?optionId(currentId):undefined,'aria-describedby':statusId,
    'aria-busy':Boolean(snapshot.loading),autoComplete:'off',spellCheck:false,'data-modal-autofocus':true,
    onChange:event=>model.setQuery(event.target.value),onKeyDown,
    onCompositionStart:()=>{composing.current=true;},onCompositionEnd:()=>{composing.current=false;},
   }),
   h('button',{type:'button',className:'cgpt-global-search-close','aria-label':'关闭搜索',onClick:()=>model.close()},h('kbd',null,'esc')),
  ),
  h('div',{className:'cgpt-global-search-results',id:listId,role:'listbox','aria-label':'搜索结果','aria-busy':Boolean(snapshot.loading||busy)},
   error&&h('div',{className:'cgpt-global-search-message cgpt-global-search-error',role:'alert'},error),
   snapshot.notice&&h('div',{className:'cgpt-global-search-message',role:'status'},snapshot.notice),
   groups.filter(group=>group.items?.length).map((group,index)=>h('div',{key:group.id,role:'group','aria-labelledby':instance+'-group-'+index,className:'cgpt-global-search-group'},
    h('div',{id:instance+'-group-'+index,className:'cgpt-global-search-heading'},group.label),
    group.items.map(item=>h('div',{
     key:item.id,id:optionId(item.id),role:'option',tabIndex:-1,'aria-selected':item.id===currentId,'aria-disabled':busy||undefined,
     'data-search-item':item.id,className:'cgpt-global-search-option'+(item.snippet?' cgpt-global-search-option-snippet':''),
     ref:node=>{if(node)rows.current.set(item.id,node);else rows.current.delete(item.id);},
     onMouseEnter:()=>setActiveId(item.id),onMouseDown:event=>event.preventDefault(),onClick:()=>void select(item.id),
    },h('span',{className:'cgpt-global-search-icon'},h(Icon,{kind:item.kind,itemId:item.id})),
    h('span',{className:'cgpt-global-search-copy'},h('span',{className:'cgpt-global-search-title'},item.title),item.snippet&&h('span',{className:'cgpt-global-search-snippet'},item.snippet)),
    item.detail&&h('span',{className:'cgpt-global-search-detail'},item.detail),
    item.shortcut&&h('kbd',{className:'cgpt-global-search-shortcut'},item.shortcut),
    (snapshot.busyId===item.id||pendingId===item.id)&&h('span',{className:'cgpt-global-search-spinner','aria-label':'正在打开'}),
    )),
   )),
   snapshot.loading&&h('div',{className:'cgpt-global-search-message'},h('span',{className:'cgpt-global-search-spinner','aria-hidden':true}),'正在搜索…'),
   !snapshot.loading&&!items.length&&!error&&h('div',{className:'cgpt-global-search-empty'},h(Icon,{kind:needsTextQuery?'text':'search'}),h('p',null,emptyLabel)),
   snapshot.hasMore&&!snapshot.loading&&h('div',{className:'cgpt-global-search-message cgpt-global-search-more'},'结果较多，请继续输入以缩小范围。'),
  ),
  h('div',{id:statusId,className:'cgpt-global-search-sr-only',role:'status','aria-live':'polite'},status),
  h('div',{className:'cgpt-global-search-footer'},
   h('div',{className:'cgpt-global-search-categories',role:'group','aria-label':'搜索范围'},(snapshot.categories||[]).map(category=>h('button',{
    key:category.id,type:'button','aria-pressed':snapshot.category===category.id,onClick:()=>{model.setCategory(category.id);inputRef.current?.focus();},
   },category.label))),
   h('span',{className:'cgpt-global-search-hint','aria-hidden':true},h('kbd',null,'↑↓'),' 选择 ',h('kbd',null,'↵'),' 打开'),
  ),
 ));
}
