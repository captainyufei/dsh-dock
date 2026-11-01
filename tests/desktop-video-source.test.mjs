import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopVideoSourceManager,DESKTOP_VIDEO_BYTE_LIMIT} from '../src/desktop-video-source.js';

const media='dsh-app://app/api/chatgpt-rail/media?path=%2Ftmp%2Ffinal.mp4&version=v1&stream=1';
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function response(chunks,{status=200,headers={},cancelPromise}={}){
 const calls={cancel:0,release:0,reads:0};let index=0;
 const reader={async read(){calls.reads++;return index<chunks.length?{done:false,value:chunks[index++]}:{done:true};},cancel(){calls.cancel++;return cancelPromise||Promise.resolve();},releaseLock(){calls.release++;}};
 return {ok:status>=200&&status<300,status,headers:new Headers({'content-type':'video/mp4',...headers}),body:{getReader:()=>reader,cancel:()=>reader.cancel()},calls};
}
function fixture(options={}){
 const created=[],revoked=[],requests=[];
 const manager=createDesktopVideoSourceManager({limit:10,fetch:async(url,init)=>{requests.push({url,init});return response([new Uint8Array([1,2,3,4])],{headers:{'content-length':'4'}});},urlApi:{createObjectURL(blob){const url='blob:video-'+created.length;created.push({url,blob});return url;},revokeObjectURL:url=>revoked.push(url)},...options});
 return {manager,created,revoked,requests};
}

test('desktop sources fetch the authenticated route into an owned Blob and retain only media-byte budget',async()=>{
 assert.equal(DESKTOP_VIDEO_BYTE_LIMIT,256*1024*1024);
 const f=fixture(),updates=[],handle=f.manager.open(media,{bytes:4,onProgress:value=>updates.push(value)});
 assert.equal(f.manager.reservedBytes,4);
 const source=await handle.promise;
 assert.equal(source.url,'blob:video-0');assert.equal(source.bytes,4);assert.equal(f.created[0].blob.type,'video/mp4');
 assert.deepEqual([...new Uint8Array(await f.created[0].blob.arrayBuffer())],[1,2,3,4]);
 assert.equal(f.requests[0].init.credentials,'same-origin');assert.equal(f.requests[0].init.cache,'no-store');
 assert.equal(updates.at(-1).percent,100);assert.equal(f.manager.reservedBytes,4);
 handle.dispose();handle.dispose();assert.equal(f.manager.reservedBytes,0);assert.deepEqual(f.revoked,['blob:video-0']);f.manager.dispose();
});

test('metadata and shared reservations reject oversized or concurrent videos before fetching',async()=>{
 const pending=deferred();let fetches=0;
 const f=fixture({fetch:()=>{fetches++;return pending.promise;}});
 await assert.rejects(f.manager.open(media,{bytes:11}).promise,{code:'too-large'});assert.equal(fetches,0);
 const first=f.manager.open(media,{bytes:7});assert.equal(f.manager.reservedBytes,7);
 await assert.rejects(f.manager.open(media,{bytes:4}).promise,{code:'busy'});assert.equal(fetches,1);
 first.dispose();assert.equal(f.manager.reservedBytes,7);
 await assert.rejects(f.manager.open(media,{bytes:4}).promise,{code:'busy'});
 const late=response([new Uint8Array(7)]);pending.resolve(late);
 await assert.rejects(first.promise,{code:'aborted'});assert.equal(f.manager.reservedBytes,0);assert.ok(late.calls.cancel>0);assert.deepEqual(f.created,[]);
 f.manager.dispose();
});

test('actual streamed bytes enforce the per-file cap and reject lying or truncated metadata',async()=>{
 for(const [bytes,chunks,code] of [[undefined,[new Uint8Array(6),new Uint8Array(5)],'too-large'],[4,[new Uint8Array(3),new Uint8Array(2)],'changed'],[6,[new Uint8Array(4)],'changed']]){
  const body=response(chunks),f=fixture({fetch:async()=>body});
  const handle=f.manager.open(media,{bytes});await assert.rejects(handle.promise,{code});
  assert.equal(f.manager.reservedBytes,0);assert.ok(body.calls.cancel>0);assert.equal(f.created.length,0);f.manager.dispose();
 }
});

test('early response failures abort and cancel bodies before releasing the reservation',async()=>{
 for(const header of [{'content-type':'text/html'},{'content-length':'11'},{'content-length':'5'}]){
  const cancelled=deferred(),body=response([],{headers:header,cancelPromise:cancelled.promise});let fetchSignal;
  const f=fixture({fetch:async(_url,init)=>{fetchSignal=init.signal;return body;}}),handle=f.manager.open(media,{bytes:4});
  await Promise.resolve();await Promise.resolve();
  assert.equal(fetchSignal.aborted,true);assert.equal(body.calls.cancel,1);assert.equal(f.manager.reservedBytes,4);
  cancelled.resolve();await assert.rejects(handle.promise);assert.equal(f.manager.reservedBytes,0);f.manager.dispose();
 }
});

test('a complete initial partial response is accepted, while incomplete ranges and changed versions are explicit',async()=>{
 const f=fixture({fetch:async()=>response([new Uint8Array(4)],{status:206,headers:{'content-range':'bytes 0-3/4'}})});
 const handle=f.manager.open(media,{bytes:4});await handle.promise;handle.dispose();f.manager.dispose();
 for(const [status,headers,code] of [[206,{'content-range':'bytes 0-1/4'},'unavailable'],[412,{},'changed'],[404,{},'unavailable'],[413,{},'too-large']]){
  const bad=fixture({fetch:async()=>response([],{status,headers})});await assert.rejects(bad.manager.open(media,{bytes:4}).promise,{code});assert.equal(bad.manager.reservedBytes,0);bad.manager.dispose();
 }
});

test('unknown size reserves the full budget, shrinks to retained size, and progress is throttled',async()=>{
 let now=0;const updates=[];
 const f=fixture({limit:10000,now:()=>now,fetch:async()=>response(Array.from({length:1000},()=>new Uint8Array(10)))});
 const handle=f.manager.open(media,{onProgress:value=>updates.push(value)});assert.equal(f.manager.reservedBytes,10000);
 await handle.promise;assert.ok(updates.length<=3);assert.equal(f.manager.reservedBytes,10000);handle.dispose();
 const knownUpdates=[],known=fixture({limit:10000,now:()=>0,fetch:async()=>response(Array.from({length:1000},()=>new Uint8Array(10)))});
 const second=known.manager.open(media,{bytes:10000,onProgress:value=>knownUpdates.push(value)});await second.promise;
 assert.ok(knownUpdates.length<=102);assert.equal(knownUpdates.at(-1).percent,100);second.dispose();known.manager.dispose();f.manager.dispose();
 const small=fixture(),tiny=small.manager.open(media);assert.equal(small.manager.reservedBytes,10);await tiny.promise;assert.equal(small.manager.reservedBytes,4);tiny.dispose();small.manager.dispose();
});

test('late Blob creation is revoked after cancellation and plugin disposal releases ready sources',async()=>{
 let handle;const revoked=[];
 const f=fixture({urlApi:{createObjectURL(){handle.dispose();return 'blob:late';},revokeObjectURL:url=>revoked.push(url)}});
 handle=f.manager.open(media,{bytes:4});await assert.rejects(handle.promise,{code:'aborted'});assert.deepEqual(revoked,['blob:late']);assert.equal(f.manager.reservedBytes,0);f.manager.dispose();
 const ready=fixture();await ready.manager.open(media,{bytes:4}).promise;ready.manager.dispose();assert.equal(ready.manager.reservedBytes,0);assert.deepEqual(ready.revoked,['blob:video-0']);await assert.rejects(ready.manager.open(media,{bytes:4}).promise,{code:'closed'});
});

test('native tab abort cancels in-flight readers and revokes already-retained desktop URLs',async()=>{
 const signal=new AbortController(),body=response([new Uint8Array(4)]),reading=fixture({fetch:async()=>body});
 const handle=reading.manager.open(media,{bytes:4,signal:signal.signal,onProgress:()=>signal.abort()});
 await assert.rejects(handle.promise,{code:'aborted'});assert.ok(body.calls.cancel>0);assert.equal(reading.manager.reservedBytes,0);assert.equal(reading.created.length,0);reading.manager.dispose();
 const readySignal=new AbortController(),ready=fixture();await ready.manager.open(media,{bytes:4,signal:readySignal.signal}).promise;
 readySignal.abort();assert.equal(ready.manager.reservedBytes,0);assert.deepEqual(ready.revoked,['blob:video-0']);ready.manager.dispose();
});
