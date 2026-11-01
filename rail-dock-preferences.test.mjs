import test from 'node:test';
import assert from 'node:assert/strict';
import {createDockPreferences} from './rail-dock-preferences.js';

const KEY='cgpt-rail.dock.v1';
function fixture(initial){
 const data=new Map(initial===undefined?[]:[[KEY,initial]]),handlers=new Set(),writes=[];
 let readFailure=null,writeFailure=null;
 const storage={
  getItem(key){if(readFailure)throw readFailure;return data.get(key)??null;},
  setItem(key,value){if(writeFailure)throw writeFailure;writes.push(['set',key,value]);data.set(key,value);},
  removeItem(key){if(writeFailure)throw writeFailure;writes.push(['remove',key]);data.delete(key);},
 };
 const eventTarget={addEventListener(type,handler){assert.equal(type,'storage');handlers.add(handler);},removeEventListener(type,handler){assert.equal(type,'storage');handlers.delete(handler);}};
 const store=createDockPreferences({storage,eventTarget});
 return {store,data,storage,writes,handlers,
  readFailure:error=>{readFailure=error;},writeFailure:error=>{writeFailure=error;},
  event({key=KEY,storageArea=storage}={}){for(const handler of [...handlers])handler({key,storageArea});},
 };
}

test('loads a frozen stable preference snapshot with ordered duplicates removed',()=>{
 const f=fixture('["home","plugins","plugins","schedules"]');
 const before=f.store.getSnapshot();
 assert.deepEqual(before,['home','plugins','schedules']);
 assert.equal(Object.isFrozen(before),true);
 assert.equal(f.store.getSnapshot(),before);
 assert.deepEqual(f.writes,[]);
 assert.throws(()=>before.push('other'),TypeError);
});

test('bad or overlong saved values fall back to the automatic default',()=>{
 const bad=['invalid json','{}','42','"home"','["home",""]','[" "]','["home",7]',JSON.stringify(Array.from({length:129},(_,i)=>'panel-'+i))];
 for(const raw of bad)assert.equal(fixture(raw).store.getSnapshot(),null,raw);
 assert.equal(fixture('null').store.getSnapshot(),null);
 assert.deepEqual(fixture('[]').store.getSnapshot(),[]);
});

test('local changes persist before notifying; reset removes the key and equal preferences preserve identity',()=>{
 const f=fixture(),seen=[];
 const stop=f.store.subscribe(()=>seen.push({snapshot:f.store.getSnapshot(),raw:f.data.get(KEY)}));
 f.store.set(['home','plugins','plugins']);
 assert.deepEqual(seen,[{snapshot:['home','plugins'],raw:'["home","plugins"]'}]);
 const before=f.store.getSnapshot();
 f.store.set(['home','plugins']);
 assert.equal(f.store.getSnapshot(),before);assert.equal(seen.length,1);
 f.store.set(null);
 assert.equal(f.store.getSnapshot(),null);assert.equal(f.data.has(KEY),false);
 assert.deepEqual(f.writes.at(-1),['remove',KEY]);assert.equal(seen.length,2);
 stop();
});

test('failed persistence or invalid input cannot change the snapshot or notify consumers',()=>{
 const f=fixture('["home"]');let notifications=0;
 const stop=f.store.subscribe(()=>notifications++);const before=f.store.getSnapshot();
 const denied=new Error('Storage quota exceeded');f.writeFailure(denied);
 assert.throws(()=>f.store.set(['home','plugins']),error=>error===denied);
 assert.throws(()=>f.store.set(null),error=>error===denied);
 f.writeFailure(null);
 for(const value of [undefined,{},[''],['home',false],Array(129).fill('home')])assert.throws(()=>f.store.set(value),TypeError);
 assert.equal(f.store.getSnapshot(),before);assert.equal(notifications,0);assert.deepEqual(f.writes,[]);
 stop();
});

test('storage updates and clears synchronize only the same storage area and preference key',()=>{
 const f=fixture('["home"]');let notifications=0;
 const stop=f.store.subscribe(()=>notifications++);
 f.data.set(KEY,'["home","plugins"]');
 f.event({key:'other'});f.event({storageArea:{}});
 assert.deepEqual(f.store.getSnapshot(),['home']);assert.equal(notifications,0);
 f.event();assert.deepEqual(f.store.getSnapshot(),['home','plugins']);assert.equal(notifications,1);
 const before=f.store.getSnapshot();f.event();assert.equal(f.store.getSnapshot(),before);assert.equal(notifications,1);
 f.data.clear();f.event({key:null});
 assert.equal(f.store.getSnapshot(),null);assert.equal(notifications,2);
 stop();
});

test('a later storage read failure retains the last snapshot; malformed external data returns to default',()=>{
 const f=fixture('["home"]');let notifications=0;
 const stop=f.store.subscribe(()=>notifications++),before=f.store.getSnapshot();
 f.readFailure(new Error('Blocked'));f.data.set(KEY,'["plugins"]');f.event({key:null});
 assert.equal(f.store.getSnapshot(),before);assert.equal(notifications,0);
 f.readFailure(null);f.data.set(KEY,'malformed');f.event();
 assert.equal(f.store.getSnapshot(),null);assert.equal(notifications,1);
 stop();
});

test('subscriptions share one listener, detach after the last consumer, and refresh after detached changes',()=>{
 const f=fixture();let notifications=0;
 const listener=()=>notifications++;
 const stopA=f.store.subscribe(listener),stopB=f.store.subscribe(listener);
 assert.equal(f.handlers.size,1);
 stopA();stopA();assert.equal(f.handlers.size,1);
 f.store.set(['home']);assert.equal(notifications,1);
 stopB();assert.equal(f.handlers.size,0);
 f.data.set(KEY,'["plugins"]');
 const stopC=f.store.subscribe(listener);
 assert.deepEqual(f.store.getSnapshot(),['plugins']);assert.equal(notifications,2);assert.equal(f.handlers.size,1);
 stopC();
});

test('dispose is idempotent and releases listeners without deleting the saved preferences',()=>{
 const f=fixture('["home"]');let notifications=0;
 const stop=f.store.subscribe(()=>notifications++);
 f.store.dispose();f.store.dispose();stop();
 assert.equal(f.handlers.size,0);assert.equal(f.data.get(KEY),'["home"]');
 assert.equal(f.store.getSnapshot()[0],'home');
 assert.throws(()=>f.store.set(['plugins']),/关闭/);
 const lateStop=f.store.subscribe(()=>notifications++);lateStop();
 f.event();assert.equal(notifications,0);assert.deepEqual(f.writes,[]);
});

test('missing globals and blocked initial storage reads are safe without pretending a save succeeded',()=>{
 const missing=createDockPreferences({storage:undefined,eventTarget:undefined});
 assert.equal(missing.getSnapshot(),null);assert.throws(()=>missing.set(['home']),/不可用/);
 const blocked=createDockPreferences({storage:{getItem(){throw new Error('blocked');}},eventTarget:undefined});
 assert.equal(blocked.getSnapshot(),null);blocked.dispose();missing.dispose();
 assert.equal(createDockPreferences().getSnapshot(),null);
});

test('a custom preference key is used for reads, writes and external notifications',()=>{
 const data=new Map([['custom','["home"]']]),handlers=new Set();
 const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const store=createDockPreferences({key:'custom',storage,eventTarget:{addEventListener:(_type,handler)=>handlers.add(handler),removeEventListener:(_type,handler)=>handlers.delete(handler)}});
 const stop=store.subscribe(()=>{});
 store.set(['plugins']);assert.equal(data.get('custom'),'["plugins"]');assert.equal(data.has(KEY),false);
 data.set('custom','["schedules"]');for(const handler of handlers)handler({key:'custom',storageArea:storage});
 assert.deepEqual(store.getSnapshot(),['schedules']);
 stop();store.dispose();
});

test('a failed observer cannot misreport an already saved change or block another consumer',()=>{
 const f=fixture();let notified=0;
 const stopA=f.store.subscribe(()=>{throw new Error('Observer failed');});
 const stopB=f.store.subscribe(()=>notified++);
 assert.doesNotThrow(()=>f.store.set(['home','plugins']));
 assert.equal(f.data.get(KEY),'["home","plugins"]');assert.equal(notified,1);
 stopA();stopB();f.store.dispose();
});
