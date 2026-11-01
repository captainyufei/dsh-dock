import test from 'node:test';
import assert from 'node:assert/strict';
import {wireSessionContextEvents} from './session-context-events.js';

// Small DOM boundary fixture: exercise actual routing/ownership behavior without
// a browser, model service or any ability to navigate or modify Session data.
class Node{
 constructor(tag='div',attributes={}){this.tagName=tag.toUpperCase();this.attributes=new Map(Object.entries(attributes));this.children=[];this.parentElement=null;this.listeners=new Map();this.rect={left:40,top:60,width:200,height:32,bottom:92};}
 getAttribute(name){return this.attributes.get(name)??null;}
 hasAttribute(name){return this.attributes.has(name);}
 setAttribute(name,value){this.attributes.set(name,value);}
 removeAttribute(name){this.attributes.delete(name);}
 append(child){child.parentElement=this;this.children.push(child);return child;}
 remove(){const parent=this.parentElement;if(parent)parent.children=parent.children.filter(child=>child!==this);this.parentElement=null;}
 contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false;}
 matches(selector){
  if(selector==='[data-row-key^="session:"]')return(this.getAttribute('data-row-key')||'').startsWith('session:');
  if(selector==='[data-cgpt-pinned-session]')return this.hasAttribute('data-cgpt-pinned-session');
  if(selector==='button')return this.tagName==='BUTTON';
  if(selector==='button[aria-label]')return this.tagName==='BUTTON'&&this.hasAttribute('aria-label');
  if(selector==='[contenteditable]:not([contenteditable="false"])')return this.hasAttribute('contenteditable')&&this.getAttribute('contenteditable')!=='false';
  return this.tagName===selector.toUpperCase();
 }
 closest(selector){for(let node=this;node;node=node.parentElement)if(selector.split(',').some(part=>node.matches(part)))return node;return null;}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
 getBoundingClientRect(){return this.rect;}
 addEventListener(type,listener,capture){this.listeners.set(type,{listener,capture});}
 removeEventListener(type,listener,capture){const record=this.listeners.get(type);if(record?.listener===listener&&record.capture===capture)this.listeners.delete(type);}
 dispatch(type,event){this.listeners.get(type)?.listener(event);}
}
function event(target,extra={}){
 return {target,clientX:120,clientY:175,key:'',prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra};
}
function fixture(t,options={}){
 const region=new Node(),row=region.append(new Node('div',{'data-row-key':'session:native-id'}));
 const title=row.append(new Node('span'));
 const more=row.append(new Node('button',{'aria-label':'会话操作：Native title'}));
 const archive=row.append(new Node('button',{'aria-label':'归档会话'}));
 const pin=region.append(new Node('li',{'data-cgpt-pinned-session':'pinned-id'}));
 const pinButton=pin.append(new Node('button',{'aria-label':'Pinned title'}));
 const requests=[];
 const OriginalObserver=globalThis.MutationObserver;
 let observer;
 globalThis.MutationObserver=class{
  constructor(callback){this.callback=callback;this.disconnected=false;observer=this;}
  observe(node,config){this.node=node;this.config=config;}
  disconnect(){this.disconnected=true;}
  emit(){this.callback([]);}
 };
 t.after(()=>{globalThis.MutationObserver=OriginalObserver;});
 const stop=wireSessionContextEvents(region,{onRequest:request=>requests.push(request),isMoreButton:label=>label.startsWith('会话操作：'),...options});
 t.after(stop);
 return {region,row,title,more,archive,pin,pinButton,requests,stop,observer};
}

test('right-click routes native and global pin rows without clicking or opening either Session',t=>{
 const f=fixture(t);
 const native=event(f.title);f.region.dispatch('contextmenu',native);
 assert.deepEqual(f.requests,[{sessionId:'native-id',x:120,y:175,trigger:f.row}]);
 assert.equal(native.prevented,true);assert.equal(native.stopped,true);
 const pinned=event(f.pinButton,{clientX:240,clientY:300});f.region.dispatch('contextmenu',pinned);
 assert.deepEqual(f.requests[1],{sessionId:'pinned-id',x:240,y:300,trigger:f.pinButton});
 assert.equal(f.region.listeners.get('contextmenu').capture,true);
 assert.equal(f.region.listeners.get('keydown').capture,true);
});

test('unmatched and editable targets retain their normal context menu and keyboard behavior',t=>{
 const f=fixture(t);
 const other=f.region.append(new Node('div',{'data-row-key':'workspace:one'}));
 const input=f.row.append(new Node('input'));
 const editable=f.row.append(new Node('div',{contenteditable:'true'})).append(new Node('span'));
 const outside=new Node('div',{'data-row-key':'session:outside'});
 for(const target of [other,input,editable,outside]){
  const gesture=event(target);f.region.dispatch('contextmenu',gesture);
  assert.equal(gesture.prevented,false);assert.equal(gesture.stopped,false);
 }
 const normalKey=event(f.title,{key:'Enter'});f.region.dispatch('keydown',normalKey);
 const modified=event(f.title,{key:'F10',shiftKey:true,ctrlKey:true});f.region.dispatch('keydown',modified);
 const repeated=event(f.title,{key:'ContextMenu',repeat:true});f.region.dispatch('keydown',repeated);
 assert.equal(normalKey.prevented,false);assert.equal(modified.prevented,false);assert.equal(repeated.prevented,false);
 assert.deepEqual(f.requests,[]);
});

test('Shift+F10 and the ContextMenu key use the actual trigger geometry',t=>{
 const f=fixture(t);
 const native=event(f.row,{key:'F10',shiftKey:true});f.region.dispatch('keydown',native);
 assert.deepEqual(f.requests[0],{sessionId:'native-id',x:52,y:92,trigger:f.row});
 assert.equal(native.prevented,true);
 f.pinButton.rect={left:220,top:100,width:80,height:32,bottom:132};
 const pinned=event(f.pinButton,{key:'ContextMenu'});f.region.dispatch('keydown',pinned);
 assert.deepEqual(f.requests[1],{sessionId:'pinned-id',x:232,y:132,trigger:f.pinButton});
 assert.equal(pinned.stopped,true);
 assert.equal(f.row.getAttribute('tabindex'),'0');
 assert.equal(f.pin.hasAttribute('tabindex'),false);
});

test('marks only native More buttons and handles added rows and changed aria labels locally',t=>{
 const f=fixture(t);
 assert.equal(f.more.hasAttribute('data-cgpt-session-more'),true);
 assert.equal(f.archive.hasAttribute('data-cgpt-session-more'),false);
 assert.equal(f.pinButton.hasAttribute('data-cgpt-session-more'),false);
 assert.equal(f.observer.node,f.region);
 assert.deepEqual(f.observer.config,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-label']});
 const added=f.region.append(new Node('div',{'data-row-key':'session:new'}));
 const addedMore=added.append(new Node('button',{'aria-label':'会话操作：Added'}));
 f.observer.emit();
 assert.equal(addedMore.hasAttribute('data-cgpt-session-more'),true);
 assert.equal(added.getAttribute('tabindex'),'0');
 addedMore.setAttribute('aria-label','归档会话');f.observer.emit();
 assert.equal(addedMore.hasAttribute('data-cgpt-session-more'),false);
 addedMore.setAttribute('aria-label','会话操作：Renamed');f.observer.emit();
 assert.equal(addedMore.hasAttribute('data-cgpt-session-more'),true);
 added.remove();f.observer.emit();
 assert.equal(addedMore.hasAttribute('data-cgpt-session-more'),false);
 assert.equal(added.hasAttribute('tabindex'),false);
});

test('label prefix/suffix matching does not confuse pin/archive controls with More',t=>{
 const f=fixture(t,{isMoreButton:undefined,moreLabelPattern:{prefix:'会话操作：',suffix:''}});
 assert.equal(f.more.hasAttribute('data-cgpt-session-more'),true);
 assert.equal(f.archive.hasAttribute('data-cgpt-session-more'),false);
});

test('cleanup restores owned markup, preserves pre-existing focus semantics and releases listeners',t=>{
 const region=new Node();
 const row=region.append(new Node('div',{'data-row-key':'session:one',tabindex:'-1'}));
 const more=row.append(new Node('button',{'aria-label':'More one','data-cgpt-session-more':'before'}));
 const f=fixture(t);
 const stop=wireSessionContextEvents(region,{onRequest:()=>{},isMoreButton:label=>label.startsWith('More ')});
 assert.equal(row.getAttribute('tabindex'),'-1');
 assert.equal(more.getAttribute('data-cgpt-session-more'),'');
 stop();stop();
 assert.equal(row.getAttribute('tabindex'),'-1');
 assert.equal(more.getAttribute('data-cgpt-session-more'),'before');
 assert.equal(region.listeners.size,0);
 f.stop();
 assert.equal(f.row.hasAttribute('tabindex'),false);
 assert.equal(f.more.hasAttribute('data-cgpt-session-more'),false);
 assert.equal(f.region.listeners.size,0);
 assert.equal(f.observer.disconnected,true);
 const gesture=event(f.title);f.region.dispatch('contextmenu',gesture);
 assert.equal(gesture.prevented,false);
 assert.deepEqual(f.requests,[]);
});

test('cleanup does not overwrite a later Host tabindex update',t=>{
 const f=fixture(t);
 f.row.setAttribute('tabindex','-1');
 f.stop();
 assert.equal(f.row.getAttribute('tabindex'),'-1');
});
