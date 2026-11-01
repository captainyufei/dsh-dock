import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {VIDEO_PREVIEW_ID,VideoPreview,createVideoProgress,installVideoPreview,videoMediaUrl} from './video-preview.js';

const h=React.createElement;
function fixture({base='https://host.example/work/',desktopSources}={}){
 const controller=new AbortController(),progress=createVideoProgress(),elements=[],calls={loaded:[],failed:0,reload:0};
 let tab={id:'tab-1',title:'final.mp4',visible:true,signal:controller.signal};
 let metadata={status:'live',value:{absolutePath:'/workspace/final.mp4',version:'v1',bytes:1000000}};
 let revision=0;
 const props=()=>({resourceAddress:'dsh-resource://file/session/s1/final.mp4',content:{kind:'renderer',revision,loaded:version=>calls.loaded.push(version),failed:()=>calls.failed++,reload:()=>calls.reload++},useResource:()=>metadata,useTabInfo:()=>({tab}),progress,desktopSources,mediaUrl:(path,version)=>videoMediaUrl(base,path,version)});
 const createNodeMock=node=>{
  if(node.type!=='video')return null;
  const element={currentTime:0,duration:120,ended:false,pauses:0,loads:0,removed:[],pause(){this.pauses++;},load(){this.loads++;},removeAttribute(name){this.removed.push(name);}};
  elements.push(element);return element;
 };
 return {controller,progress,elements,calls,props,createNodeMock,
  setMetadata:value=>{metadata=value;},setVisible:value=>{tab={...tab,visible:value};},nextRevision:()=>revision++,
 };
}
async function mount(f){let view;await act(async()=>{view=TestRenderer.create(h(VideoPreview,f.props()),{createNodeMock:f.createNodeMock});});return view;}
const video=view=>view.root.findByType('video');
const current=f=>f.elements.at(-1);
const text=node=>typeof node==='string'?node:(node.children||[]).map(text).join('');

test('media URLs remain on the app origin/prefix and carry encoded Host path and version',()=>{
 for(const base of ['https://host.example/deployment/','http://127.0.0.1:8877/','dsh-app://app/']){
  const url=new URL(videoMediaUrl(base,'/tmp/a #? 视频.mp4','opaque:#? v1'));
  assert.equal(url.protocol,new URL(base).protocol);assert.equal(url.host,new URL(base).host);
  assert.equal(url.pathname,new URL(base).pathname+'api/chatgpt-rail/media');
  assert.equal(url.searchParams.get('stream'),new URL(base).protocol==='dsh-app:'?'1':null);
  assert.equal(url.searchParams.get('path'),'/tmp/a #? 视频.mp4');assert.equal(url.searchParams.get('version'),'opaque:#? v1');
 }
 assert.equal(new URL(videoMediaUrl('https://host/','C:\\Videos\\final.mp4','v')).searchParams.get('path'),'C:\\Videos\\final.mp4');
 for(const path of ['relative.mp4','//other/share/movie.mp4','\\\\other\\movie.mp4','/tmp/a\0.mp4','/tmp/a\n.mp4'])assert.equal(videoMediaUrl('https://host/',path,'v'),null);
 for(const base of ['file:///tmp/','javascript:alert(1)','dsh-app://other/','https://user:secret@host/','invalid'])assert.equal(videoMediaUrl(base,'/tmp/f.mp4','v'),null);
});

test('native renderer metadata creates only a controlled metadata-preloaded video and reports readiness',async()=>{
 const f=fixture(),view=await mount(f);
 assert.equal(video(view).props.controls,true);assert.equal(video(view).props.preload,'metadata');assert.equal(video(view).props.autoPlay,undefined);
 const src=new URL(video(view).props.src);assert.equal(src.searchParams.get('version'),'v1');assert.equal(src.searchParams.get('path'),'/workspace/final.mp4');
 assert.deepEqual(f.calls.loaded,[]);
 await act(async()=>video(view).props.onLoadedMetadata({currentTarget:current(f)}));
 await act(async()=>video(view).props.onLoadedMetadata({currentTarget:current(f)}));
 assert.deepEqual(f.calls.loaded,['v1']);assert.equal(view.root.findByProps({'data-video-preview':'ready'}).props.className,'cgpt-video-preview');
 await act(async()=>view.unmount());assert.deepEqual(current(f).removed,['src']);assert.equal(current(f).loads,1);f.progress.dispose();
});

test('playback pauses while hidden and resumes position only within the same tab and file version',async()=>{
 const f=fixture();let view=await mount(f);
 await act(async()=>video(view).props.onLoadedMetadata({currentTarget:current(f)}));
 current(f).currentTime=47;await act(async()=>video(view).props.onTimeUpdate({currentTarget:current(f)}));
 f.setVisible(false);await act(async()=>view.update(h(VideoPreview,f.props())));
 assert.ok(current(f).pauses>0);
 await act(async()=>view.unmount());f.setVisible(true);view=await mount(f);
 await act(async()=>video(view).props.onLoadedMetadata({currentTarget:current(f)}));assert.equal(current(f).currentTime,47);
 f.setMetadata({status:'live',value:{absolutePath:'/workspace/final.mp4',version:'v2'}});
 await act(async()=>view.update(h(VideoPreview,f.props())));
 await act(async()=>video(view).props.onLoadedMetadata({currentTarget:current(f)}));assert.equal(current(f).currentTime,0);
 await act(async()=>view.unmount());f.progress.dispose();
});

test('decode failures stop loading once, keep a recoverable body and direct users to native opening options',async()=>{
 const f=fixture(),view=await mount(f),element=current(f);element.error={code:3};
 await act(async()=>video(view).props.onError({currentTarget:element}));
 await act(async()=>video(view).props.onError({currentTarget:element}));
 assert.equal(f.calls.failed,1);assert.match(text(view.root.findByProps({role:'alert'})),/编码/);assert.match(text(view.root.findByProps({role:'alert'})),/顶部/);
 await act(async()=>view.root.findByType('button').props.onClick());assert.equal(f.calls.reload,1);
 f.nextRevision();await act(async()=>view.update(h(VideoPreview,f.props())));
 assert.equal(view.root.findAllByProps({role:'alert'}).length,0);
 await act(async()=>video(view).props.onLoadedMetadata({currentTarget:current(f)}));assert.deepEqual(f.calls.loaded,['v1']);
 await act(async()=>view.unmount());f.progress.dispose();
});

test('loading, absent resources, RemoteResult metadata and repeated failures have explicit retry lifecycles',async()=>{
 const f=fixture();f.setMetadata({status:'loading'});const view=await mount(f);
 assert.equal(view.root.findAllByType('video').length,0);assert.equal(view.root.findAllByProps({role:'status'}).length,1);assert.equal(f.calls.failed,0);
 f.setMetadata(undefined);await act(async()=>view.update(h(VideoPreview,f.props())));
 assert.equal(f.calls.failed,1);assert.equal(view.root.findAllByType('video').length,0);
 await act(async()=>view.update(h(VideoPreview,f.props())));assert.equal(f.calls.failed,1);
 await act(async()=>view.root.findByType('button').props.onClick());assert.equal(f.calls.reload,1);
 f.setMetadata({ok:true,value:{absolutePath:'/workspace/final.mp4',version:'v3'}});await act(async()=>view.update(h(VideoPreview,f.props())));
 await act(async()=>video(view).props.onLoadedMetadata({currentTarget:current(f)}));assert.deepEqual(f.calls.loaded,['v3']);
 f.nextRevision();f.setMetadata({ok:false,error:{code:'workspace-file/not-found'}});await act(async()=>view.update(h(VideoPreview,f.props())));
 assert.equal(f.calls.failed,2);
 await act(async()=>view.unmount());f.progress.dispose();
});

test('tab abort retires playback and progress; stale metadata events cannot acknowledge a new revision',async()=>{
 const f=fixture(),view=await mount(f),oldLoaded=video(view).props.onLoadedMetadata,element=current(f);
 element.currentTime=37;await act(async()=>video(view).props.onTimeUpdate({currentTarget:element}));
 await act(async()=>f.controller.abort());assert.ok(element.pauses>0);assert.deepEqual(element.removed,['src']);assert.equal(element.loads,1);
 await act(async()=>oldLoaded({currentTarget:element}));assert.deepEqual(f.calls.loaded,[]);
 assert.equal(f.progress.position(f.controller.signal,f.props().resourceAddress,'v1'),0);
 await act(async()=>view.unmount());assert.equal(element.loads,1);f.progress.dispose();
});

test('progress is isolated per native occurrence and disposed without persisting media bytes',()=>{
 const progress=createVideoProgress(),a=new AbortController(),b=new AbortController();
 progress.remember(a.signal,'file-a','v1',12);
 assert.equal(progress.position(a.signal,'file-a','v1'),12);assert.equal(progress.position(b.signal,'file-a','v1'),0);assert.equal(progress.position(a.signal,'file-a','v2'),0);
 a.abort();assert.equal(progress.position(a.signal,'file-a','v1'),0);
 progress.remember(b.signal,'file-a','v1',31);progress.dispose();assert.equal(progress.position(b.signal,'file-a','v1'),0);
});

function desktopFixture(){
 const operations=[],desktopSources={open(url,options){
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const operation={url,options,resolve,reject,disposed:0};operations.push(operation);
  return {promise,dispose:()=>operation.disposed++};
 }};
 return {...fixture({base:'dsh-app://app/',desktopSources}),operations};
}

test('desktop previews show streamed progress, release on hide and reload only when visible without autoplay',async()=>{
 const f=desktopFixture(),view=await mount(f);
 assert.equal(f.operations.length,1);assert.equal(view.root.findAllByType('video').length,0);
 assert.equal(new URL(f.operations[0].url).searchParams.get('version'),'v1');assert.equal(f.operations[0].options.bytes,1000000);
 await act(async()=>f.operations[0].options.onProgress({percent:35}));assert.match(text(view.root.findByProps({role:'status'})),/35%/);
 await act(async()=>f.operations[0].resolve({url:'blob:desktop-1'}));assert.equal(video(view).props.src,'blob:desktop-1');
 await act(async()=>video(view).props.onLoadedMetadata({currentTarget:current(f)}));
 current(f).currentTime=40;await act(async()=>video(view).props.onTimeUpdate({currentTarget:current(f)}));
 const element=current(f);f.setVisible(false);await act(async()=>view.update(h(VideoPreview,f.props())));
 assert.equal(f.operations[0].disposed,1);assert.ok(element.pauses>0);assert.deepEqual(element.removed,['src']);assert.equal(view.root.findAllByType('video').length,0);
 f.setVisible(true);await act(async()=>view.update(h(VideoPreview,f.props())));assert.equal(f.operations.length,2);assert.equal(view.root.findAllByType('video').length,0);
 await act(async()=>f.operations[1].resolve({url:'blob:desktop-2'}));await act(async()=>video(view).props.onLoadedMetadata({currentTarget:current(f)}));
 assert.equal(current(f).currentTime,40);assert.equal(video(view).props.autoPlay,undefined);
 await act(async()=>view.unmount());assert.equal(f.operations[1].disposed,1);f.progress.dispose();
});

test('hidden desktop reads ignore late progress and Blob completion; later size changes replace stale players',async()=>{
 const f=desktopFixture(),view=await mount(f);
 f.setVisible(false);await act(async()=>view.update(h(VideoPreview,f.props())));
 await act(async()=>{f.operations[0].options.onProgress({percent:99});f.operations[0].resolve({url:'blob:late'});});
 assert.equal(view.root.findAllByType('video').length,0);assert.ok(f.operations[0].disposed>=1);
 f.setVisible(true);await act(async()=>view.update(h(VideoPreview,f.props())));
 await act(async()=>f.operations[1].resolve({url:'blob:ready'}));assert.equal(video(view).props.src,'blob:ready');
 f.setMetadata({status:'live',value:{absolutePath:'/workspace/final.mp4',version:'v1',bytes:2000000}});
 await act(async()=>view.update(h(VideoPreview,f.props())));assert.equal(f.operations[1].disposed,1);assert.equal(view.root.findAllByType('video').length,0);assert.equal(f.operations[2].options.bytes,2000000);
 await act(async()=>view.unmount());f.progress.dispose();
});

test('desktop limits and route read failures stay distinct from codec failures and keep native-opening guidance',async()=>{
 for(const [code,pattern] of [['too-large',/256 MiB/],['busy',/关闭其他视频/],['unavailable',/读取/],['changed',/变化/]]){
  const f=desktopFixture(),view=await mount(f);
  await act(async()=>f.operations[0].reject(Object.assign(new Error('route failed'),{code})));
  const message=text(view.root.findByProps({role:'alert'}));assert.match(message,pattern);assert.match(message,/顶部/);assert.doesNotMatch(message,/编码/);assert.equal(f.calls.failed,1);
  await act(async()=>view.root.findByType('button').props.onClick());assert.equal(f.calls.reload,1);
  await act(async()=>view.unmount());f.progress.dispose();
 }
});

test('installation waits for the optional registry and pairs metadata and keyed body with reversible effects',()=>{
 const effects=[],registered=[],definitions=[],locales=new Map();let provide;
 const ctx={effect(factory){const stop=factory();if(typeof stop==='function')effects.push(stop);},inject(names,callback){assert.deepEqual(names,['documentPreviews']);provide=callback;return()=>{};},locale:{register(ns,value){locales.set(ns,value);return()=>locales.delete(ns);},bind(ns){return key=>locales.get(ns).zh[key];}},slots:{inject(name,factory){assert.equal(name,'sidebar.right.tab.document');return factory();},register(options,component){registered.push({options,component});return()=>registered.splice(0);}}};
 installVideoPreview(ctx);assert.equal(definitions.length,0);assert.equal(registered.length,0);
 ctx.documentPreviews={register(definition){definitions.push(definition);return()=>definitions.splice(0);}};provide(ctx);
 assert.equal(definitions[0].id,VIDEO_PREVIEW_ID);assert.deepEqual(definitions[0].extensions,['mp4','m4v','mov','webm']);assert.equal(definitions[0].loading,'renderer');assert.deepEqual(definitions[0].binaryExtensions,definitions[0].extensions);assert.equal(definitions[0].wrap,false);
 assert.equal(registered[0].options.key,VIDEO_PREVIEW_ID);assert.equal(registered[0].component,VideoPreview);assert.equal(definitions[0].title(),'视频');
 assert.equal(registered[0].options.inject().desktopSources,registered[0].options.inject().desktopSources);
 for(const stop of effects.reverse())stop();assert.equal(definitions.length,0);assert.equal(registered.length,0);assert.equal(locales.size,0);
 assert.doesNotThrow(()=>installVideoPreview({}));
});
