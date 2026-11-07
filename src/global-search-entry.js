// Harness 0.2.2 dispatches desktop shortcuts before DOM keyboard events. Keep
// its existing command and user binding; adapt only the resolved search action.
// This is a version-sensitive registry adapter, not a public override API.
const wrappers=new WeakMap();

function liveResolver(resolve){
 let record;
 while((record=wrappers.get(resolve))&&!record.active)resolve=record.original;
 return resolve;
}

/** Reversible search entry points; never changes markup or shortcut settings. */
export function wireGlobalSearchEntry({document,shortcuts,open,getSearchLabel}){
 if(typeof document?.addEventListener!=='function'||typeof open!=='function'){
  throw new TypeError('A document and search opener are required.');
 }
 const records=new Map(),seen=new WeakSet();
 let current,unsubscribe,disposed=false;

 function onClick(event){
  if(disposed||event.defaultPrevented||event.button>0)return;
  const target=event.target?.closest?event.target:event.target?.parentElement;
  if(!target)return;
  let trigger=target.closest('[data-cgpt-search-button]');
  if(!trigger){
   const button=target.closest('button');
   const label=typeof getSearchLabel==='function'?getSearchLabel():undefined;
   if(!button?.closest('[data-slot="sidebar.workspaces"]')||!label||button.getAttribute('aria-label')!==label)return;
   trigger=button;
  }
  if(trigger.disabled||trigger.getAttribute('aria-disabled')==='true')return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  trigger.focus?.({preventScroll:true});
  open();
 }

 function release(record){
  record.active=false;
  // Preserve a later owner. A removed lower layer remains a transparent
  // resolver until the active upper adapter relinquishes its ownership.
  if(record.command.resolve===record.wrapper){
   record.command.resolve=liveResolver(record.original);
  }
 }

 function sync(){
  if(disposed)return;
  const command=shortcuts?.registry?.commands?.get?.('session.search');
  if(command!==current){
   const previous=records.get(current);
   if(previous)release(previous);
   current=command;
  }
  if(!command||(typeof command!=='object'&&typeof command!=='function')||typeof command.resolve!=='function'||seen.has(command))return;
  seen.add(command);
  const record={command,original:command.resolve,wrapper:null,active:true};
  record.wrapper=function(...args){
   // Keep native resolution (including refusals and thrown errors) intact.
   const result=Reflect.apply(record.original,this,args);
   if(!record.active||result?.status!=='handled')return result;
   return {...result,run:function(...runArgs){
    if(!record.active)return typeof result.run==='function'?Reflect.apply(result.run,this,runArgs):undefined;
    return open();
   }};
  };
  // An unavailable/read-only registry must not disable the mouse entry point.
  try{command.resolve=record.wrapper;}catch{return;}
  if(command.resolve!==record.wrapper)return;
  wrappers.set(record.wrapper,record);
  records.set(command,record);
 }

 function dispose(){
  if(disposed)return;
  disposed=true;
  document.removeEventListener('click',onClick,true);
  unsubscribe?.();
  for(const record of records.values())release(record);
  records.clear();
 }

 document.addEventListener('click',onClick,true);
 try{
  sync();
  if(typeof shortcuts?.catalog?.subscribe==='function')unsubscribe=shortcuts.catalog.subscribe(sync);
 }catch(error){dispose();throw error;}
 return dispose;
}
