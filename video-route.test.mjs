import test from 'node:test';
import assert from 'node:assert/strict';
import {createVideoRoute,VIDEO_MEDIA_PATH} from './video-route.js';
import {apply,inject} from './index.js';

const PATH='/work/视频 clip #1.mp4';
const secret='/private/credential-details';
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
async function flush(){for(let i=0;i<10;i++)await Promise.resolve();}
function fixture({size=29,chunkBytes=7,path=PATH,version='v1',type='file'}={}){
 const bytes=Uint8Array.from({length:size},(_,i)=>i),calls=[],target={displayPath:path,targetKey:Symbol('opaque')};
 const state={version,size,type};
 const fs={
  async resolve(value,options){calls.push({kind:'resolve',value,options});return target;},
  async stat(value,signal){calls.push({kind:'stat',target:value,signal});return {...state};},
  async readByteRange(value,range,signal){calls.push({kind:'read',target:value,range:{...range},signal});return bytes.subarray(range.offset,range.offset+range.length);},
  readBytes(){throw new Error('Whole-file reads are forbidden');},
 };
 const route=createVideoRoute(fs,{chunkBytes});
 const request=({method='GET',headers,signal,version,stream,path:requestPath=path}={})=>new Request('http://host'+VIDEO_MEDIA_PATH+'?path='+encodeURIComponent(requestPath)+(version===undefined?'':'&version='+encodeURIComponent(version))+(stream===undefined?'':'&stream='+encodeURIComponent(stream)),{method,headers,signal});
 return {fs,route,state,bytes,calls,target,request,reads:()=>calls.filter(call=>call.kind==='read')};
}
function trackAbort(signal){
 const add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);let count=0;
 signal.addEventListener=(type,...args)=>{if(type==='abort')count++;return add(type,...args);};
 signal.removeEventListener=(type,...args)=>{if(type==='abort')count--;return remove(type,...args);};
 return ()=>count;
}

test('Host registers one authenticated Connection Fetch route with composed fs and fiber cleanup',()=>{
 const f=fixture(),events=[],dispose=()=>events.push('dispose');
 assert.deepEqual(inject,['connection','fs']);
 apply({fs:f.fs,connection:{fetch:{register(route){events.push(route);return dispose;}}},effect(effect,label){events.push(label);assert.equal(effect(),dispose);}});
 const route=events[1];assert.equal(route.path,'/api/chatgpt-rail/media');assert.deepEqual(route.methods,['GET','HEAD']);assert.equal(route.requestBody,'buffered');assert.equal(typeof route.fetch,'function');
 assert.deepEqual(f.calls,[]);
});

test('full GET preserves bytes through bounded reads of the opaque composed target',async()=>{
 const f=fixture(),request=f.request(),listeners=trackAbort(request.signal),response=await f.route.fetch(request);
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'video/mp4');assert.equal(response.headers.get('content-length'),'29');
 assert.equal(response.headers.get('accept-ranges'),'bytes');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.equal(response.headers.get('content-security-policy'),"sandbox; default-src 'none'");
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),f.bytes);
 assert.deepEqual(f.reads().map(call=>call.range),[{offset:0,length:7},{offset:7,length:7},{offset:14,length:7},{offset:21,length:7},{offset:28,length:1}]);
 assert.ok(f.calls.filter(call=>call.kind!=='resolve').every(call=>call.target===f.target));
 assert.equal(f.calls[0].value,PATH);assert.ok(f.calls[0].options.signal instanceof AbortSignal);assert.equal(listeners(),0);
});

test('backpressure permits only one bounded permission preflight until the consumer asks for more',async()=>{
 const f=fixture(),response=await f.route.fetch(f.request());
 assert.equal(f.reads().length,1);await flush();assert.equal(f.reads().length,1);
 const reader=response.body.getReader();assert.deepEqual((await reader.read()).value,f.bytes.subarray(0,7));await flush();assert.equal(f.reads().length,1);
 assert.deepEqual((await reader.read()).value,f.bytes.subarray(7,14));await flush();assert.equal(f.reads().length,2);
 await reader.cancel();assert.equal(f.reads()[1].signal.aborted,true);
});

for(const [range,start,end] of [['bytes=3-11',3,11],['bytes=23-',23,28],['bytes=-4',25,28],['bytes=-999999',0,28],['bytes=0-999999',0,28],['BYTES=2-4',2,4],['bytes=2-999999999999999999999999999999999999999',2,28]])test(`GET ${range} produces exact inclusive 206 bytes`,async()=>{
 const f=fixture(),response=await f.route.fetch(f.request({headers:{Range:range}}));
 assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes ${start}-${end}/29`);assert.equal(response.headers.get('content-length'),String(end-start+1));
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),f.bytes.subarray(start,end+1));
 assert.ok(f.reads().every(call=>call.range.length<=7));
});

test('invalid, multiple and unsatisfiable ranges return 416 metadata without content reads',async()=>{
 for(const range of ['bytes=','bytes=-','bytes=-0','bytes=29-','bytes=10-2','bytes=0-1,5-9','items=0-3','bytes=1 - 2','bytes=-2-3','bytes=999999999999999999999999999-','bytes='+('9'.repeat(256))+'-']){
  const f=fixture(),response=await f.route.fetch(f.request({headers:{Range:range}}));
  assert.equal(response.status,416,range);assert.equal(response.headers.get('content-range'),'bytes */29');assert.equal(f.reads().length,0);
 }
});

test('HEAD ignores Range, returns full large-file metadata, and never reads bytes',async()=>{
 const f=fixture();f.state.size=2**40;
 for(const Range of ['bytes=3-7','invalid']){
  const request=f.request({method:'HEAD',headers:{Range}}),listeners=trackAbort(request.signal),response=await f.route.fetch(request);
  assert.equal(response.status,200);assert.equal(response.headers.get('content-length'),String(2**40));assert.equal(response.headers.has('content-range'),false);
  assert.equal(await response.text(),'');assert.equal(f.reads().length,0);assert.equal(listeners(),0);
 }
});

test('zero-byte files return an empty response and all their ranges are unsatisfiable',async()=>{
 const f=fixture({size:0}),request=f.request(),listeners=trackAbort(request.signal),response=await f.route.fetch(request);
 assert.equal(response.status,200);assert.equal(response.headers.get('content-length'),'0');assert.equal(await response.text(),'');assert.equal(f.reads().length,0);assert.equal(listeners(),0);
 const ranged=await f.route.fetch(f.request({headers:{Range:'bytes=0-'}}));assert.equal(ranged.status,416);assert.equal(ranged.headers.get('content-range'),'bytes */0');
});

test('only the fixed supported video extensions are served, including resolved alias targets',async()=>{
 for(const [extension,mime] of [['MP4','video/mp4'],['m4v','video/mp4'],['mov','video/quicktime'],['webm','video/webm']]){
  const f=fixture({path:'/work/clip.'+extension}),response=await f.route.fetch(f.request({method:'HEAD'}));assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),mime);
 }
 for(const path of ['/work/notes.html','/work/video.mp4.exe','/work/mp4','/work/video.ogv']){
  const f=fixture(),response=await f.route.fetch(f.request({path}));assert.equal(response.status,415);assert.deepEqual(f.calls,[]);
 }
 const alias=fixture();alias.target.displayPath='/private/notes.txt';
 assert.equal((await alias.route.fetch(alias.request())).status,415);assert.equal(alias.reads().length,0);
});

test('malformed or relative paths and unsupported methods fail without touching fs or exposing paths',async()=>{
 for(const path of ['relative.mp4','../secret.mp4','//network/secret.mp4','\\\\server\\video.mp4','/work/a\0.mp4','/work/a\n.mp4']){
  const f=fixture(),response=await f.route.fetch(f.request({path}));assert.equal(response.status,400);assert.deepEqual(f.calls,[]);assert.equal((await response.text()).includes(path),false);
 }
 const f=fixture(),post=await f.route.fetch(f.request({method:'POST'}));assert.equal(post.status,405);assert.equal(post.headers.get('allow'),'GET, HEAD');assert.deepEqual(f.calls,[]);
 const duplicate=new Request(f.request().url+'&path=%2Fwork%2Fother.mp4');assert.equal((await f.route.fetch(duplicate)).status,400);
 assert.equal((await f.route.fetch({url:'invalid url',method:'GET'})).status,400);
});

test('requested metadata version is enforced before any file content and opaque versions safely round-trip',async()=>{
 const f=fixture({version:'opaque "版本" / 1'}),response=await f.route.fetch(f.request({version:f.state.version}));
 assert.equal(response.status,200);assert.equal(response.headers.get('etag'),'"'+encodeURIComponent(f.state.version)+'"');await response.arrayBuffer();
 const stale=fixture(),request=stale.request({version:'old-version'}),listeners=trackAbort(request.signal),denied=await stale.route.fetch(request);
 assert.equal(denied.status,412);assert.equal(stale.reads().length,0);assert.equal((await denied.text()).includes('old-version'),false);assert.equal(listeners(),0);
});

test('If-Range applies matching byte ranges and falls back to the complete current representation otherwise',async()=>{
 for(const [ifRange,status,start] of [['"v1"',206,3],['"v0"',200,0]]){
  const f=fixture(),response=await f.route.fetch(f.request({headers:{Range:'bytes=3-6','If-Range':ifRange}}));assert.equal(response.status,status);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),f.bytes.subarray(start,status===206?7:29));
 }
});

test('filesystem errors are mapped without leaking provider messages, paths or stack traces',async()=>{
 for(const [code,status] of [['FS_NOT_FOUND',404],['FS_PERMISSION_DENIED',403],['FS_SANDBOX_DENIED',403],['FS_NOT_REGULAR_FILE',403],['FS_STALE_VERSION',409],['FS_IO_ERROR',500],['UNKNOWN',500]]){
  for(const method of ['resolve','stat','readByteRange']){
   const f=fixture();f.fs[method]=async()=>{throw Object.assign(new Error(secret),{code});};
   const request=f.request(),listeners=trackAbort(request.signal),response=await f.route.fetch(request);
   assert.equal(response.status,status,code+' '+method);assert.equal((await response.text()).includes(secret),false);assert.equal(response.headers.get('content-type'),'text/plain; charset=utf-8');assert.equal(listeners(),0);
  }
 }
 const f=fixture();f.fs.stat=async()=>{throw new Error(secret);};const response=await f.route.fetch(f.request({method:'HEAD'}));assert.equal(response.status,500);assert.equal(await response.text(),'');
});

test('missing, nonregular and unknown-size/version files are rejected without raw reads',async()=>{
 for(const [info,status] of [[undefined,404],[{type:'directory',size:10,version:'v1'},403],[{type:'file',version:'v1'},503],[{type:'file',size:-1,version:'v1'},503],[{type:'file',size:1.5,version:'v1'},503],[{type:'file',size:10},503]]){
  const f=fixture();f.fs.stat=async()=>info;assert.equal((await f.route.fetch(f.request())).status,status);assert.equal(f.reads().length,0);
 }
});

test('an aborted request performs no reads and cancellation during metadata resolution is propagated',async()=>{
 const aborted=new AbortController();aborted.abort();const f=fixture();assert.equal((await f.route.fetch(f.request({signal:aborted.signal}))).status,499);assert.deepEqual(f.calls,[]);
 const controller=new AbortController(),waiting=deferred(),g=fixture();let internalSignal;
 g.fs.resolve=async(_path,options)=>{internalSignal=options.signal;return waiting.promise;};
 const request=g.request({signal:controller.signal}),listeners=trackAbort(request.signal),pending=g.route.fetch(request);await flush();controller.abort();assert.equal(internalSignal.aborted,true);
 waiting.resolve(g.target);assert.equal((await pending).status,499);assert.equal(g.reads().length,0);assert.equal(listeners(),0);
});

test('request abort interrupts a pending stream read and ignored late provider data is never enqueued',async()=>{
 const f=fixture(),pending=deferred(),native=f.fs.readByteRange;let calls=0,readingSignal;
 f.fs.readByteRange=async(...args)=>{if(++calls===2){readingSignal=args[2];return pending.promise;}return native(...args);};
 const controller=new AbortController(),request=f.request({signal:controller.signal}),listeners=trackAbort(request.signal),response=await f.route.fetch(request),reader=response.body.getReader();
 await reader.read();const next=reader.read(),rejected=assert.rejects(next,/媒体读取已中断/);await flush();controller.abort();await rejected;
 assert.equal(readingSignal.aborted,true);pending.resolve(f.bytes.subarray(7,14));await flush();assert.equal(calls,2);assert.equal(listeners(),0);
});

test('reader cancellation aborts a pending provider window without late close or enqueue errors',async()=>{
 const f=fixture(),pending=deferred(),native=f.fs.readByteRange;let calls=0,readingSignal;
 f.fs.readByteRange=async(...args)=>{if(++calls===2){readingSignal=args[2];return pending.promise;}return native(...args);};
 const request=f.request(),listeners=trackAbort(request.signal),response=await f.route.fetch(request),reader=response.body.getReader();
 await reader.read();const next=reader.read();await flush();await reader.cancel();assert.deepEqual(await next,{value:undefined,done:true});assert.equal(readingSignal.aborted,true);
 pending.resolve(f.bytes.subarray(7,14));await flush();assert.equal(calls,2);assert.equal(listeners(),0);
});

test('a version or size change during the first bounded read fails before committing a video response',async()=>{
 for(const field of ['version','size']){
  const f=fixture(),native=f.fs.readByteRange;f.fs.readByteRange=async(...args)=>{const data=await native(...args);f.state[field]=field==='version'?'v2':30;return data;};
  const response=await f.route.fetch(f.request());assert.equal(response.status,409);assert.equal(response.headers.get('content-type'),'text/plain; charset=utf-8');assert.equal(f.reads().length,1);
 }
});

test('version changes between or during later reads abort the body before any changed bytes are sent',async()=>{
 for(const when of ['before','during']){
  const f=fixture(),native=f.fs.readByteRange;let calls=0;
  f.fs.readByteRange=async(...args)=>{const bytes=await native(...args);if(++calls===2&&when==='during')f.state.version='v2';return bytes;};
  const response=await f.route.fetch(f.request()),reader=response.body.getReader();assert.deepEqual((await reader.read()).value,f.bytes.subarray(0,7));
  if(when==='before')f.state.version='v2';
  await assert.rejects(reader.read(),/媒体读取已中断/);assert.equal(calls,when==='before'?1:2);
 }
});

test('unexpected short byte windows fail rather than silently contradicting Content-Length',async()=>{
 const early=fixture();early.fs.readByteRange=async()=>new Uint8Array(1);assert.equal((await early.route.fetch(early.request())).status,409);
 const late=fixture(),native=late.fs.readByteRange;let calls=0;late.fs.readByteRange=async(...args)=>++calls===1?native(...args):new Uint8Array(1);
 const response=await late.route.fetch(late.request()),reader=response.body.getReader();await reader.read();await assert.rejects(reader.read(),/媒体读取已中断/);
});

test('factory rejects missing primitives and unbounded or invalid window sizes',()=>{
 for(const method of ['resolve','stat','readByteRange']){const f=fixture();delete f.fs[method];assert.throws(()=>createVideoRoute(f.fs),TypeError);}
 const f=fixture();for(const chunkBytes of [0,-1,1.2,NaN,Infinity,1024*1024+1])assert.throws(()=>createVideoRoute(f.fs,{chunkBytes}),RangeError);
});

test('explicit Desktop stream mode starts with 206 and full Content-Range without requiring a Range header',async()=>{
 const f=fixture(),response=await f.route.fetch(f.request({stream:'1'}));
 assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 0-28/29');assert.equal(response.headers.get('content-length'),'29');
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),f.bytes);assert.ok(f.reads().every(call=>call.range.length<=7));
});

test('real ranges, including failures and If-Range fallback, take priority over Desktop initial streaming mode',async()=>{
 const valid=fixture(),partial=await valid.route.fetch(valid.request({stream:'1',headers:{Range:'bytes=6-12'}}));
 assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),'bytes 6-12/29');assert.deepEqual(new Uint8Array(await partial.arrayBuffer()),valid.bytes.subarray(6,13));
 const invalid=fixture(),unsatisfiable=await invalid.route.fetch(invalid.request({stream:'1',headers:{Range:'bytes=99-'}}));
 assert.equal(unsatisfiable.status,416);assert.equal(invalid.reads().length,0);
 const changed=fixture(),whole=await changed.route.fetch(changed.request({stream:'1',headers:{Range:'bytes=6-12','If-Range':'"old"'}}));
 assert.equal(whole.status,200);assert.equal(whole.headers.has('content-range'),false);assert.deepEqual(new Uint8Array(await whole.arrayBuffer()),changed.bytes);
});

test('Desktop stream mode leaves HEAD, empty files and ordinary HTTP defaults unchanged',async()=>{
 const f=fixture(),head=await f.route.fetch(f.request({method:'HEAD',stream:'1',headers:{Range:'bytes=6-12'}}));
 assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'29');assert.equal(head.headers.has('content-range'),false);assert.equal(f.reads().length,0);
 for(const stream of [undefined,'0','true','2']){
  const normal=fixture(),response=await normal.route.fetch(normal.request({stream}));assert.equal(response.status,200);assert.equal(response.headers.has('content-range'),false);await response.arrayBuffer();
 }
 const empty=fixture({size:0}),zero=await empty.route.fetch(empty.request({stream:'1'}));assert.equal(zero.status,200);assert.equal(zero.headers.get('content-length'),'0');assert.equal(empty.reads().length,0);
});
