import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativePanelPinsSource} from './rail-native-pins.js';

function inner(initial=[]){
 let value=initial;const listeners=new Set();let subscriptions=0,unsubscriptions=0;
 return {getSnapshot:()=>value,subscribe(listener){listeners.add(listener);subscriptions++;return()=>{listeners.delete(listener);unsubscriptions++;};},
  change(next){value=next;for(const listener of [...listeners])listener();},listeners,
  subscriptions:()=>subscriptions,unsubscriptions:()=>unsubscriptions};
}
function fixture(entries=[]){
 const slotListeners=new Set();let current=entries;
 const slots={entriesOfSlot:name=>{assert.equal(name,'sidebar');return current;},subscribe(name,listener){assert.equal(name,'sidebar');slotListeners.add(listener);return()=>slotListeners.delete(listener);}};
 return {source:createNativePanelPinsSource(slots),slotListeners,
  replace(next){current=next;for(const listener of [...slotListeners])listener();},
  swapBeforeNotification(next){current=next;},notify(){for(const listener of [...slotListeners])listener();}};
}
const entry=source=>({locale:'sidebar',registrant:'Gb',inject:()=>({hooks:{entryPins:source},setPinned(){throw new Error('Must not write native pins');},startSession(){throw new Error('Must not create a Session');}})});

test('missing or incompatible sidebar registrations return the same frozen empty snapshot',()=>{
 const f=fixture(),empty=f.source.getSnapshot();
 assert.deepEqual(empty,[]);assert.ok(Object.isFrozen(empty));assert.equal(f.source.getSnapshot(),empty);
 for(const registration of [
  {locale:'other',inject:()=>{throw new Error('Must not inspect another locale');}},
  {locale:'sidebar'},
  {locale:'sidebar',inject:()=>({hooks:{entryPins:{getSnapshot:()=>['schedules']}}})},
  {locale:'sidebar',inject:()=>{throw new Error('Provider unavailable');}},
 ]){
  f.replace([registration]);assert.equal(f.source.getSnapshot(),empty);
 }
});

test('discovery only reads the source, caches the current entry face, and never invokes Host actions',()=>{
 const pins=inner(['schedules']);let injections=0;
 const registration=entry(pins);const original=registration.inject;
 registration.inject=()=>{injections++;return original();};
 const f=fixture([registration]);
 assert.deepEqual(f.source.getSnapshot(),['schedules']);
 assert.equal(f.source.getSnapshot(),f.source.getSnapshot());
 assert.equal(injections,1);assert.equal(pins.listeners.size,0);assert.equal(f.slotListeners.size,0);
 assert.deepEqual(Object.keys(f.source).sort(),['getSnapshot','subscribe']);
});

test('one shared native subscription follows changes and releases all resources after the final consumer',()=>{
 const pins=inner(),f=fixture([entry(pins)]);let notices=0;
 const stopA=f.source.subscribe(()=>notices++),stopB=f.source.subscribe(()=>notices++);
 assert.equal(f.slotListeners.size,1);assert.equal(pins.listeners.size,1);assert.equal(pins.subscriptions(),1);
 pins.change(['schedules']);assert.deepEqual(f.source.getSnapshot(),['schedules']);assert.equal(notices,2);
 const before=f.source.getSnapshot();pins.change(['schedules']);
 assert.equal(f.source.getSnapshot(),before);assert.equal(notices,2);
 stopA();stopA();assert.equal(pins.listeners.size,1);
 stopB();assert.equal(f.slotListeners.size,0);assert.equal(pins.listeners.size,0);assert.equal(pins.unsubscriptions(),1);
 pins.change([]);assert.equal(notices,2);
});

test('a sidebar registered later becomes live and HMR detaches the old source before following the replacement',()=>{
 const f=fixture();let notices=0;const stop=f.source.subscribe(()=>notices++);
 const oldPins=inner(['schedules']),newPins=inner(['extra']);
 f.replace([entry(oldPins)]);
 assert.deepEqual(f.source.getSnapshot(),['schedules']);assert.equal(oldPins.listeners.size,1);assert.equal(notices,1);
 f.replace([entry(newPins)]);
 assert.equal(oldPins.listeners.size,0);assert.equal(oldPins.unsubscriptions(),1);assert.equal(newPins.listeners.size,1);
 assert.deepEqual(f.source.getSnapshot(),['extra']);assert.equal(notices,2);
 oldPins.change(['stale']);assert.deepEqual(f.source.getSnapshot(),['extra']);assert.equal(notices,2);
 newPins.change(['extra','schedules']);assert.equal(notices,3);
 f.replace([]);assert.equal(newPins.listeners.size,0);assert.deepEqual(f.source.getSnapshot(),[]);assert.equal(notices,4);
 stop();assert.equal(f.slotListeners.size,0);
});

test('an early getSnapshot after HMR cannot swallow the later source notification',()=>{
 const oldPins=inner(['schedules']),newPins=inner(['new-panel']),f=fixture([entry(oldPins)]);
 let notices=0;const stop=f.source.subscribe(()=>notices++);
 f.swapBeforeNotification([entry(newPins)]);
 assert.deepEqual(f.source.getSnapshot(),['new-panel']);assert.equal(notices,0);
 f.notify();assert.equal(notices,1);assert.equal(oldPins.listeners.size,0);assert.equal(newPins.listeners.size,1);
 stop();
});

test('malformed or equivalent source values keep a stable canonical snapshot without loops',()=>{
 const pins=inner(['schedules','schedules',null,7]),f=fixture([entry(pins)]);
 const before=f.source.getSnapshot();assert.deepEqual(before,['schedules']);assert.ok(Object.isFrozen(before));
 let notices=0;const stop=f.source.subscribe(()=>notices++);
 pins.change(['schedules']);assert.equal(f.source.getSnapshot(),before);assert.equal(notices,0);
 pins.change({unpinned:['schedules']});assert.deepEqual(f.source.getSnapshot(),[]);assert.equal(notices,1);
 pins.change(null);assert.equal(notices,1);
 stop();
});

test('synchronous source subscribe notifications do not recurse or duplicate subscriptions',()=>{
 let subscriptions=0,releases=0;const pins={getSnapshot:()=>['schedules'],subscribe(listener){subscriptions++;listener();return()=>releases++;}};
 const f=fixture([entry(pins)]);let notices=0;
 const stop=f.source.subscribe(()=>notices++);
 assert.equal(subscriptions,1);assert.equal(notices,0);
 stop();assert.equal(releases,1);assert.equal(f.slotListeners.size,0);
});
