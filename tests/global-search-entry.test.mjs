import test from 'node:test';
import assert from 'node:assert/strict';
import {wireGlobalSearchEntry} from '../src/global-search-entry.js';

class Node{
 constructor(tag='div',attrs={}){this.tagName=tag.toUpperCase();this.attrs=new Map(Object.entries(attrs));this.parentElement=null;this.focused=0;}
 append(node){node.parentElement=this;return node;}
 getAttribute(name){return this.attrs.get(name)??null;}
 matches(selector){
  if(selector==='button')return this.tagName==='BUTTON';
  if(selector==='[data-cgpt-search-button]')return this.attrs.has('data-cgpt-search-button');
  if(selector==='[data-slot="sidebar.workspaces"]')return this.getAttribute('data-slot')==='sidebar.workspaces';
  return false;
 }
 closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
 focus(options){assert.deepEqual(options,{preventScroll:true});this.focused++;}
}
function documentFixture(){
 const listeners=new Set();
 return {
  listeners,
  addEventListener(type,listener,capture){assert.equal(type,'click');assert.equal(capture,true);listeners.add(listener);},
  removeEventListener(type,listener,capture){assert.equal(type,'click');assert.equal(capture,true);listeners.delete(listener);},
  click(target,extra={}){
   const event={target,button:0,defaultPrevented:false,stopped:false,immediate:false,
    preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.immediate=true;},...extra};
   for(const listener of [...listeners]){listener(event);if(event.immediate)break;}
   return event;
  },
 };
}
function shortcutsFixture(resolve=()=>({status:'handled',run(){}})){
 const listeners=new Set();
 const command={id:'session.search',defaults:{'desktop:macos':{code:'KeyK',modifiers:['primary']}},resolve};
 const commands=new Map([['session.search',command]]);
 const shortcuts={registry:{commands},catalog:{subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}}};
 return {shortcuts,command,commands,listeners,changed(){for(const listener of [...listeners])listener();}};
}

test('captured search clicks focus their trigger and open without changing markup or invoking the native button',()=>{
 const document=documentFixture();let opened=0;
 const button=new Node('button',{'data-cgpt-search-button':'','aria-label':'Search sessions'});
 const icon=button.append(new Node('svg'));const attrs=[...button.attrs];
 const stop=wireGlobalSearchEntry({document,open(){assert.equal(button.focused,1);opened++;}});
 const event=document.click(icon);
 assert.equal(opened,1);assert.equal(event.defaultPrevented,true);assert.equal(event.stopped,true);assert.equal(event.immediate,true);
 assert.deepEqual([...button.attrs],attrs);
 stop();stop();
 assert.equal(document.listeners.size,0);
 assert.equal(document.click(icon).defaultPrevented,false);assert.equal(opened,1);
});

test('native fallback matching is restricted to workspace search buttons and reads the current locale per click',()=>{
 const document=documentFixture();let label='搜索会话',opened=0;
 const region=new Node('div',{'data-slot':'sidebar.workspaces'});
 const search=region.append(new Node('button',{'aria-label':'搜索会话'}));
 const other=region.append(new Node('button',{'aria-label':'工作区选项'}));
 const outside=new Node('button',{'aria-label':'搜索会话'});
 const stop=wireGlobalSearchEntry({document,open:()=>opened++,getSearchLabel:()=>label});
 assert.equal(document.click(other).defaultPrevented,false);
 assert.equal(document.click(outside).defaultPrevented,false);
 assert.equal(document.click(search).defaultPrevented,true);
 label='Search sessions';
 assert.equal(document.click(search).defaultPrevented,false);
 search.attrs.set('aria-label',label);
 const text={parentElement:search};
 assert.equal(document.click(text).defaultPrevented,true);assert.equal(opened,2);
 stop();
});

test('consumed, secondary, disabled and unrelated clicks retain their owner',()=>{
 const document=documentFixture();let opened=0;
 const button=new Node('button',{'data-cgpt-search-button':''});
 const stop=wireGlobalSearchEntry({document,open:()=>opened++});
 assert.equal(document.click(button,{defaultPrevented:true}).stopped,false);
 assert.equal(document.click(button,{button:2}).defaultPrevented,false);
 button.disabled=true;assert.equal(document.click(button).defaultPrevented,false);
 button.disabled=false;button.attrs.set('aria-disabled','true');assert.equal(document.click(button).defaultPrevented,false);
 assert.equal(document.click(new Node()).defaultPrevented,false);
 assert.equal(document.click(null).defaultPrevented,false);assert.equal(opened,0);
 stop();
});

test('the native shortcut retains resolver this/arguments and metadata while only its handled action opens search',()=>{
 const document=documentFixture();let opened=0,nativeRan=0;
 const receiver={},args=[{region:'editable'},'extra'];let resolved;
 const original=function(...received){assert.equal(this,receiver);assert.deepEqual(received,args);return resolved={status:'handled',extra:'kept',run(){nativeRan++;}};};
 const f=shortcutsFixture(original);const defaults=f.command.defaults;
 const stop=wireGlobalSearchEntry({document,shortcuts:f.shortcuts,open:()=>++opened});
 const result=f.command.resolve.apply(receiver,args);
 assert.equal(result.status,'handled');assert.equal(result.extra,'kept');assert.notEqual(result.run,resolved.run);
 assert.equal(result.run(),1);assert.equal(nativeRan,0);assert.equal(f.command.defaults,defaults);assert.equal(f.commands.size,1);
 stop();assert.equal(f.command.resolve,original);assert.equal(f.listeners.size,0);
});

test('blocked/pass native resolutions and native exceptions are neither replaced nor swallowed',()=>{
 const document=documentFixture();let value,opened=0;
 const failure=new Error('native resolve failed');
 const f=shortcutsFixture(()=>{if(value===failure)throw failure;return value;});
 const stop=wireGlobalSearchEntry({document,shortcuts:f.shortcuts,open:()=>opened++});
 for(value of [{status:'blocked',reason:'modal'},{status:'pass'},undefined,null])assert.equal(f.command.resolve(),value);
 value=failure;assert.throws(()=>f.command.resolve(),error=>error===failure);assert.equal(opened,0);
 stop();
});

test('a previously resolved run falls back to its native action after disposal with this and arguments preserved',()=>{
 const document=documentFixture();let opened=0,ran=0;const receiver={},args=['one',2];
 const f=shortcutsFixture(()=>({status:'handled',run(...values){assert.equal(this,receiver);assert.deepEqual(values,args);ran++;return 'native';}}));
 const stop=wireGlobalSearchEntry({document,shortcuts:f.shortcuts,open:()=>opened++});
 const result=f.command.resolve();stop();
 assert.equal(result.run.apply(receiver,args),'native');assert.equal(ran,1);assert.equal(opened,0);
});

test('catalog replacement restores the old command and adapts the new command without changing either binding',()=>{
 const document=documentFixture();let opened=0;
 const oldResolve=()=>({status:'handled',run(){}}),newResolve=()=>({status:'handled',run(){}});
 const f=shortcutsFixture(oldResolve);
 const stop=wireGlobalSearchEntry({document,shortcuts:f.shortcuts,open:()=>opened++});
 const next={id:'session.search',resolve:newResolve};
 f.commands.set('session.search',next);f.changed();
 assert.equal(f.command.resolve,oldResolve);assert.notEqual(next.resolve,newResolve);
 next.resolve().run();assert.equal(opened,1);
 stop();assert.equal(next.resolve,newResolve);
});

test('a late owner of the same command is not reclaimed on catalog changes or cleanup',()=>{
 const document=documentFixture();const f=shortcutsFixture();let opened=0;
 const stop=wireGlobalSearchEntry({document,shortcuts:f.shortcuts,open:()=>opened++});
 const external=()=>({status:'blocked',reason:'external'});
 f.command.resolve=external;f.changed();
 assert.equal(f.command.resolve,external);stop();assert.equal(f.command.resolve,external);assert.equal(opened,0);
});

test('multiple instances can unload in either order without duplicate actions or stranded resolver layers',()=>{
 for(const first of ['older','newer']){
  const document=documentFixture();let olderOpened=0,newerOpened=0,nativeRan=0;
  const original=()=>({status:'handled',run:()=>nativeRan++});const f=shortcutsFixture(original);
  const older=wireGlobalSearchEntry({document,shortcuts:f.shortcuts,open:()=>olderOpened++});
  const newer=wireGlobalSearchEntry({document,shortcuts:f.shortcuts,open:()=>newerOpened++});
  f.command.resolve().run();assert.equal(newerOpened,1);assert.equal(olderOpened,0);assert.equal(nativeRan,0);
  if(first==='older'){
   older();f.changed();f.command.resolve().run();assert.equal(newerOpened,2);assert.equal(olderOpened,0);newer();
  }else{
   newer();f.changed();f.command.resolve().run();assert.equal(olderOpened,1);older();
  }
  assert.equal(f.command.resolve,original);assert.equal(document.listeners.size,0);assert.equal(f.listeners.size,0);
 }
});

test('multiple click adapters consume each gesture once and the remaining one works after disposal',()=>{
 const document=documentFixture();const button=new Node('button',{'data-cgpt-search-button':''});let count=0;
 const older=wireGlobalSearchEntry({document,open:()=>count++});
 const newer=wireGlobalSearchEntry({document,open:()=>count++});
 document.click(button);assert.equal(count,1);older();document.click(button);assert.equal(count,2);newer();
});

test('missing shortcut capabilities preserve the click entry and a later command can attach through the catalog',()=>{
 const document=documentFixture();const button=new Node('button',{'data-cgpt-search-button':''});let count=0;
 for(const shortcuts of [undefined,{}, {registry:{commands:{}}}]){
  const stop=wireGlobalSearchEntry({document,shortcuts,open:()=>count++});document.click(button);stop();
 }
 assert.equal(count,3);
 const f=shortcutsFixture();f.commands.clear();
 const stop=wireGlobalSearchEntry({document,shortcuts:f.shortcuts,open:()=>count++});
 f.commands.set('session.search',f.command);f.changed();f.command.resolve().run();assert.equal(count,4);stop();
});

test('a read-only native resolver remains intact while click interception still works',()=>{
 const document=documentFixture();const button=new Node('button',{'data-cgpt-search-button':''});let count=0;
 const original=()=>({status:'pass'});const f=shortcutsFixture(original);Object.freeze(f.command);
 const stop=wireGlobalSearchEntry({document,shortcuts:f.shortcuts,open:()=>count++});
 document.click(button);assert.equal(count,1);assert.equal(f.command.resolve,original);stop();
});
