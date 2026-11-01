import React from 'react';
import {createDesktopVideoSourceManager} from './desktop-video-source.js';

export const VIDEO_PREVIEW_ID='@local/chatgpt-rail/video';
const SLOT='sidebar.right.tab.document',NS='chatgptRailVideo';
const EXTENSIONS=Object.freeze(['mp4','m4v','mov','webm']);
const h=React.createElement;
const copy={
 zh:{title:'视频',player:'视频预览：{name}',loading:'正在读取视频…',progress:'正在载入视频 {percent}%',hidden:'视频已暂停。',unavailable:'暂时无法读取视频。',failed:'暂时无法播放此视频。',decode:'无法播放此视频，可能是不支持的编码。','too-large':'视频超过桌面预览上限（256 MiB）。',busy:'请先关闭其他视频，再重新载入。',changed:'视频已变化或数据不完整，请重新载入。',external:'可使用顶部的打开方式，在系统应用中打开。',retry:'重新载入'},
 en:{title:'Video',player:'Video preview: {name}',loading:'Loading video…',progress:'Loading video {percent}%',hidden:'Video paused.',unavailable:'This video is unavailable.',failed:'This video could not be played.',decode:'This video may use an unsupported encoding.','too-large':'This video exceeds the desktop preview limit (256 MiB).',busy:'Close another video, then reload.',changed:'This video changed or is incomplete. Reload it to continue.',external:'Use the opening options above to open it in a system application.',retry:'Reload'},
};
const fallbackT=(key,values={})=>Object.entries(values).reduce((text,[name,value])=>text.replaceAll('{'+name+'}',String(value)),copy.zh[key]||key);

/** Keep Host paths on the authenticated application origin and deployment prefix. */
export function videoMediaUrl(base,path,version){
 if(typeof base!=='string'||typeof path!=='string'||!path||/[\u0000-\u001f\u007f]/u.test(path)||/^[/\\]{2}/u.test(path)||!(/^[A-Za-z]:[/\\]/u.test(path)||path.startsWith('/')))return null;
 try{
  const application=new URL(base);
  if(application.username||application.password||!(['http:','https:'].includes(application.protocol)||application.protocol==='dsh-app:'&&application.hostname==='app'))return null;
  const url=new URL('api/chatgpt-rail/media',application);
  url.searchParams.set('path',path);
  // Desktop strips Content-Length; expose total bytes in the initial partial response.
  if(application.protocol==='dsh-app:')url.searchParams.set('stream','1');
  if(typeof version==='string'&&version)url.searchParams.set('version',version);
  return url.href;
 }catch{return null;}
}

/** State survives body remounts, but never the owning native tab occurrence. */
export function createVideoProgress(){
 const records=new Map();
 let disposed=false;
 function record(signal){
  if(disposed||!signal||signal.aborted||typeof signal.addEventListener!=='function')return null;
  let held=records.get(signal);
  if(!held){
   const release=()=>{signal.removeEventListener('abort',release);records.delete(signal);};
   held={address:null,version:null,time:0,release};records.set(signal,held);
   signal.addEventListener('abort',release,{once:true});
  }
  return held;
 }
 return {
  position(signal,address,version){const held=record(signal);return held?.address===address&&held.version===version?held.time:0;},
  remember(signal,address,version,time){
   if(!Number.isFinite(time)||time<0)return;
   const held=record(signal);if(held)Object.assign(held,{address,version,time});
  },
  dispose(){if(disposed)return;disposed=true;for(const held of [...records.values()])held.release();records.clear();},
 };
}

function metadataOf(snapshot){
 if(snapshot?.status)return snapshot;
 if(snapshot?.ok===true)return {status:'live',value:snapshot.value};
 if(snapshot?.ok===false)return {status:'failed',failure:snapshot.error};
 return {status:'none'};
}
const frameStyle={position:'relative',display:'flex',flex:'1 1 auto',flexDirection:'column',minHeight:0,height:'100%',width:'100%',background:'#111',whiteSpace:'normal',fontFamily:'var(--dsw-font-family,system-ui)',fontSize:13};
const noticeStyle={display:'flex',flex:'1 1 auto',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,minHeight:120,padding:24,color:'var(--dsw-alias-label-secondary,#888)',textAlign:'center',whiteSpace:'normal',lineHeight:1.6};
const retryStyle={border:'1px solid var(--dsw-alias-border-l2,#ddd)',borderRadius:7,padding:'5px 12px',background:'transparent',color:'inherit',font:'inherit',cursor:'pointer'};

function VideoPlayer({src,version,address,request,tab,progress,t,name}){
 const ref=React.useRef(null),alive=React.useRef(true),reported=React.useRef(null);
 const [failure,setFailure]=React.useState(null),[ready,setReady]=React.useState(false);
 const remember=React.useCallback(element=>progress?.remember(tab.signal,address,version,element?.ended?0:element?.currentTime),[progress,tab.signal,address,version]);
 React.useEffect(()=>{
  alive.current=true;
  const element=ref.current;
  let retired=false;
  const stop=()=>{if(!element)return;remember(element);try{element.pause();}catch{}};
  const retire=()=>{
   stop();
   if(element&&!retired){retired=true;try{element.removeAttribute('src');element.load();}catch{}}
  };
  tab.signal?.addEventListener?.('abort',retire,{once:true});
  if(tab.signal?.aborted)retire();
  return()=>{
   alive.current=false;tab.signal?.removeEventListener?.('abort',retire);
   // Retire this media request when its native body or revision is replaced.
   retire();
  };
 },[tab.signal,remember]);
 React.useEffect(()=>{if(!tab.visible){const element=ref.current;remember(element);try{element?.pause();}catch{}}},[tab.visible,remember]);
 function loaded(event){
  if(!alive.current||tab.signal?.aborted||reported.current)return;
  const element=event.currentTarget;
  const position=progress?.position(tab.signal,address,version)||0;
  if(position>0)try{element.currentTime=Number.isFinite(element.duration)?Math.min(position,Math.max(0,element.duration-0.05)):position;}catch{}
  if(!tab.visible)try{element.pause();}catch{}
  reported.current='loaded';setReady(true);request.loaded?.(version);
 }
 function failed(event){
  if(!alive.current||tab.signal?.aborted)return;
  remember(event.currentTarget);try{event.currentTarget?.pause();}catch{}
  const code=event.currentTarget?.error?.code;
  setFailure(code===3||code===4?'decode':'failed');
  if(reported.current!=='failed'){reported.current='failed';request.failed?.();}
 }
 return h('div',{className:'cgpt-video-preview','data-video-preview':failure?'failed':ready?'ready':'loading',style:frameStyle},
  h('video',{key:src,ref,src,controls:true,preload:'metadata',playsInline:true,'aria-label':t('player',{name}),style:{display:failure?'none':'block',width:'100%',height:'100%',minHeight:0,flex:'1 1 auto',objectFit:'contain',background:'#111'},onLoadedMetadata:loaded,onError:failed,onTimeUpdate:event=>remember(event.currentTarget),onPause:event=>remember(event.currentTarget),onSeeked:event=>remember(event.currentTarget),onEnded:()=>progress?.remember(tab.signal,address,version,0)}),
  !ready&&!failure&&h('div',{role:'status',style:{...noticeStyle,position:'absolute',inset:0,pointerEvents:'none',color:'#ddd'}},t('loading')),
  failure&&h('div',{role:'alert',style:noticeStyle},h('p',{style:{margin:0}},t(failure)),h('p',{style:{margin:0}},t('external')),h('button',{type:'button',style:retryStyle,onClick:()=>request.reload?.()},t('retry'))),
 );
}

/** Electron's custom-scheme media loader cannot seek even with valid ranges. */
function DesktopVideo({src,bytes,desktopSources,request,tab,...playerProps}){
 const sourceKey=src+'\0'+bytes;
 const [state,setState]=React.useState({key:sourceKey,kind:'loading',percent:Number.isFinite(bytes)?0:null});
 const shown=state.key===sourceKey?state:{kind:'loading',percent:Number.isFinite(bytes)?0:null};
 const requestRef=React.useRef(request);requestRef.current=request;
 const {t}=playerProps;
 React.useEffect(()=>{
  let alive=true;
  setState({key:sourceKey,kind:'loading',percent:Number.isFinite(bytes)?0:null});
  const handle=desktopSources?.open(src,{bytes,signal:tab.signal,onProgress:value=>{if(alive)setState({key:sourceKey,kind:'loading',percent:value.percent});}});
  if(!handle){setState({key:sourceKey,kind:'failed',reason:'unavailable'});requestRef.current.failed?.();return;}
  handle.promise.then(source=>{
   if(!alive||tab.signal?.aborted){handle.dispose();return;}
   setState({key:sourceKey,kind:'ready',url:source.url});
  },error=>{
   if(!alive||tab.signal?.aborted)return;
   const reason=['too-large','busy','changed'].includes(error?.code)?error.code:'unavailable';
   setState({key:sourceKey,kind:'failed',reason});requestRef.current.failed?.();
  });
  return()=>{alive=false;handle.dispose();};
 },[src,bytes,desktopSources,tab.signal]);
 if(shown.kind==='ready')return h(VideoPlayer,{...playerProps,src:shown.url,request,tab});
 return h('div',{className:'cgpt-video-preview','data-video-preview':shown.kind==='failed'?'failed':'loading',style:frameStyle},
  shown.kind==='failed'?h('div',{role:'alert',style:noticeStyle},h('p',{style:{margin:0}},t(shown.reason)),h('p',{style:{margin:0}},t('external')),h('button',{type:'button',style:retryStyle,onClick:()=>requestRef.current.reload?.()},t('retry'))):
   h('div',{role:'status',style:noticeStyle},t(shown.percent===null?'loading':'progress',{percent:shown.percent})),
 );
}

/** Composed native document props retain the native path bar and opening actions. */
export function VideoPreview({resourceAddress,content,useResource,useTabInfo,progress,desktopSources,mediaUrl,t=fallbackT}){
 const {tab}=useTabInfo();
 const metadata=metadataOf(useResource(resourceAddress)),request=content?.kind==='renderer'?content:null;
 const path=metadata.value?.absolutePath,version=metadata.value?.version;
 const src=typeof path==='string'?(mediaUrl||((value,stamp)=>videoMediaUrl(globalThis.document?.baseURI,value,stamp)))(path,version):null;
 const pending=metadata.status==='loading';
 const unavailable=!pending&&(metadata.status!=='live'||!src||tab.signal?.aborted);
 const report=React.useRef(null);
 React.useEffect(()=>{
  if(!request||!unavailable||tab.signal?.aborted)return;
  const identity=resourceAddress+'\0'+request.revision;
  if(report.current===identity)return;
  report.current=identity;request.failed?.();
 },[request,unavailable,resourceAddress,tab.signal]);
 if(!request)return null;
 if(pending)return h('div',{role:'status',style:noticeStyle},t('loading'));
 if(unavailable)return h('div',{role:'alert',style:noticeStyle},h('p',{style:{margin:0}},t('unavailable')),h('button',{type:'button',style:retryStyle,onClick:()=>request.reload?.()},t('retry')));
 const name=path.replaceAll('\\','/').split('/').pop()||tab.title||t('title');
 if(src.startsWith('dsh-app://')){
  if(!tab.visible)return h('div',{className:'cgpt-video-preview','data-video-preview':'paused',role:'status',style:noticeStyle},t('hidden'));
  return h(DesktopVideo,{key:resourceAddress+'\0'+version+'\0'+request.revision,src,bytes:metadata.value?.bytes,desktopSources,version,address:resourceAddress,request,tab,progress,t,name});
 }
 return h(VideoPlayer,{key:resourceAddress+'\0'+version+'\0'+request.revision,src,version,address:resourceAddress,request,tab,progress,t,name});
}

/** Register a reversible document renderer rather than replacing native tabs. */
export function installVideoPreview(ctx){
 if(typeof ctx.inject!=='function'&&typeof ctx.documentPreviews?.register!=='function')return()=>{};
 ctx.effect(()=>ctx.locale.register(NS,copy),'chatgpt-rail:video-locale');
 const install=scope=>{
  const progress=createVideoProgress(),desktopSources=createDesktopVideoSourceManager();
  scope.effect(()=>()=>progress.dispose(),'chatgpt-rail:video-progress');
  scope.effect(()=>()=>desktopSources.dispose(),'chatgpt-rail:desktop-video-sources');
  scope.effect(()=>scope.documentPreviews.register({id:VIDEO_PREVIEW_ID,extensions:EXTENSIONS,binaryExtensions:EXTENSIONS,priority:'extension',title:()=>scope.locale.bind(NS)('title'),loading:'renderer',wrap:false}),'chatgpt-rail:video-renderer');
  scope.effect(()=>scope.slots.inject(SLOT,()=>scope.slots.register({name:SLOT,key:VIDEO_PREVIEW_ID,locale:NS,inject:()=>({progress,desktopSources,mediaUrl:(path,version)=>videoMediaUrl(globalThis.document?.baseURI,path,version)})},VideoPreview)),'chatgpt-rail:video-body');
 };
 return typeof ctx.inject==='function'?ctx.inject(['documentPreviews'],install):install(ctx);
}
