export const DESKTOP_VIDEO_BYTE_LIMIT=256*1024*1024;
const failure=(code,message,cause)=>Object.assign(new Error(message,cause?{cause}:undefined),{name:code==='aborted'?'AbortError':'DesktopVideoSourceError',code});
const abortFailure=()=>failure('aborted','视频载入已取消。');
const MIME_TYPES=new Set(['video/mp4','video/x-m4v','video/quicktime','video/webm','application/octet-stream']);

/** Bound media bytes across all in-flight reads and live desktop Blob URLs. */
export function createDesktopVideoSourceManager({fetch:fetcher=globalThis.fetch,urlApi=globalThis.URL,Blob:BlobClass=globalThis.Blob,limit=DESKTOP_VIDEO_BYTE_LIMIT,now=()=>globalThis.performance?.now?.()??Date.now()}={}){
 const operations=new Set();
 let used=0,disposed=false;
 const rejected=error=>{const promise=Promise.reject(error);promise.catch(()=>{});return {promise,dispose(){}};};
 function release(operation){
  if(operation.released)return;operation.released=true;
  if(operation.url!==null){urlApi.revokeObjectURL(operation.url);operation.url=null;}
  used-=operation.reserved;operation.reserved=0;operations.delete(operation);
  operation.signal?.removeEventListener?.('abort',operation.cancel);
 }
 function cancel(operation){
  if(operation.released)return;
  operation.controller.abort();
  try{Promise.resolve(operation.reader?.cancel()).catch(()=>{});}catch{}
  // A cancelled read retains its reservation until its pending work settles;
  // rapid hide/show cannot spend the same bytes on several late fetches.
  if(operation.complete)release(operation);
 }
 return {
  get reservedBytes(){return used;},
  open(url,{bytes,signal,onProgress}={}){
   if(disposed)return rejected(failure('closed','视频预览已关闭。'));
   let address;
   try{address=new URL(url);}catch{return rejected(failure('unavailable','无效的视频地址。'));}
   if(address.protocol!=='dsh-app:'||address.hostname!=='app'||address.username||address.password||!address.pathname.endsWith('/api/chatgpt-rail/media')||typeof fetcher!=='function')return rejected(failure('unavailable','桌面视频地址不可用。'));
   const expected=bytes===undefined?null:bytes;
   if(expected!==null&&(!Number.isSafeInteger(expected)||expected<0))return rejected(failure('unavailable','视频大小不可用。'));
   if(expected!==null&&expected>limit)return rejected(failure('too-large','视频超过桌面预览大小上限。'));
   const reservation=expected===null?limit:expected;
   if(used+reservation>limit)return rejected(failure('busy','请先关闭其他视频，再重新载入。'));
   const operation={reserved:reservation,signal,controller:new AbortController(),reader:null,url:null,complete:false,released:false,cancel:null};
   operation.cancel=()=>cancel(operation);used+=reservation;operations.add(operation);
   signal?.addEventListener?.('abort',operation.cancel,{once:true});
   if(signal?.aborted)operation.cancel();
   const check=()=>{if(operation.controller.signal.aborted||signal?.aborted||disposed)throw abortFailure();};
   const promise=(async()=>{
    const parts=[];
    let response,total=0,lastAt=-Infinity,lastPercent=-1,declared=expected;
    const progress=(complete=false)=>{
     const percent=declared!==null&&declared>0?Math.min(100,Math.floor(total/declared*100)):null,at=now();
     if(!complete&&at-lastAt<100&&(percent===null||percent<=lastPercent))return;
     lastAt=at;if(percent!==null)lastPercent=percent;
     try{onProgress?.({loaded:total,total:declared,percent});}catch{}
    };
    try{
     check();
     response=await fetcher(address.href,{signal:operation.controller.signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
     check();
     if(!response.ok)throw failure(response.status===412?'changed':response.status===413?'too-large':'unavailable','视频读取失败（'+response.status+'）。');
     const mediaType=(response.headers.get('content-type')||'application/octet-stream').split(';')[0].trim().toLowerCase();
     if(!MIME_TYPES.has(mediaType))throw failure('unavailable','视频响应格式不正确。');
     const range=response.headers.get('content-range');
     const length=response.headers.get('content-length');
     let responseSize=null;
     if(response.status===206){
      const match=range?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
      if(!match||Number(match[1])!==0||Number(match[2])+1!==Number(match[3]))throw failure('unavailable','视频响应不完整。');
      responseSize=Number(match[3]);
     }else if(length!==null&&/^\d+$/.test(length))responseSize=Number(length);
     if(responseSize!==null&&(!Number.isSafeInteger(responseSize)||responseSize>limit))throw failure('too-large','视频超过桌面预览大小上限。');
     if(expected!==null&&responseSize!==null&&expected!==responseSize)throw failure('changed','视频已变化，请重新载入。');
     if(declared===null&&responseSize!==null)declared=responseSize;
     if(typeof response.body?.getReader!=='function')throw failure('unavailable','视频数据流不可用。');
     operation.reader=response.body.getReader();progress();
     for(;;){
      const chunk=await operation.reader.read();check();
      if(chunk.done)break;
      const value=chunk.value;
      if(!ArrayBuffer.isView(value)||typeof value.byteLength!=='number')throw failure('unavailable','视频数据无效。');
      const next=total+value.byteLength;
      if(next>limit)throw failure('too-large','视频超过桌面预览大小上限。');
      if(declared!==null&&next>declared)throw failure('changed','视频已变化，请重新载入。');
      if(next>operation.reserved){
       const extra=next-operation.reserved;
       if(used+extra>limit)throw failure('busy','请先关闭其他视频，再重新载入。');
       used+=extra;operation.reserved=next;
      }
      total=next;parts.push(value);progress();check();
     }
     if(total===0||declared!==null&&total!==declared)throw failure('changed','视频数据不完整，请重新载入。');
     check();
     const blob=new BlobClass(parts,{type:mediaType});
     if(blob.size!==total)throw failure('changed','视频数据不完整，请重新载入。');
     operation.url=urlApi.createObjectURL(blob);check();
     operation.complete=true;
     used-=operation.reserved-total;operation.reserved=total;
     progress(true);
     // A consumer can cancel synchronously from its progress callback.
     check();
     return Object.freeze({url:operation.url,bytes:total,mediaType});
    }catch(error){
     if(operation.controller.signal.aborted||signal?.aborted||disposed)throw abortFailure();
     if(error?.name==='DesktopVideoSourceError')throw error;
     throw failure('unavailable','视频读取失败。',error);
    }finally{
     parts.length=0;
     if(!operation.complete||operation.controller.signal.aborted||disposed){
      operation.controller.abort();
      try{await (operation.reader?operation.reader.cancel():response?.body?.cancel());}catch{}
      release(operation);
     }
     try{operation.reader?.releaseLock();}catch{}
     operation.reader=null;
    }
   })();
   promise.catch(()=>{});
   return {promise,dispose:operation.cancel};
  },
  dispose(){if(disposed)return;disposed=true;for(const operation of [...operations])cancel(operation);},
 };
}
