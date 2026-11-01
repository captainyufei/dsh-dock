export const VIDEO_MEDIA_PATH='/api/chatgpt-rail/media';
const MIME_TYPES=Object.freeze({mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm'});
const BASE_HEADERS=Object.freeze({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"});
const fault=code=>Object.assign(new Error('媒体文件暂不可用。'),{code});
const streamError=()=>new Error('媒体读取已中断。');
const videoType=path=>typeof path==='string'?MIME_TYPES[/\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase()]:undefined;
const absolutePath=path=>typeof path==='string'&&(/^(?:\/(?!\/)|[a-z]:[\\/])/i.test(path))&&!/[\u0000-\u001f\u007f]/.test(path);

/** Parse one inclusive HTTP byte range without rounding large integer bounds. */
function byteRange(value,size){
 if(value===null)return {start:0,end:size-1,status:200};
 if(value.length>256)throw fault('range');
 const match=/^bytes=(\d*)-(\d*)$/i.exec(value.trim());
 if(!match||!match[1]&&!match[2]||size===0)throw fault('range');
 const total=BigInt(size),last=total-1n;
 let start,end;
 if(!match[1]){
  const suffix=BigInt(match[2]);if(suffix===0n)throw fault('range');
  start=suffix>=total?0n:total-suffix;end=last;
 }else{
  start=BigInt(match[1]);end=match[2]?BigInt(match[2]):last;
  if(start>=total||end<start)throw fault('range');
  if(end>last)end=last;
 }
 return {start:Number(start),end:Number(end),status:206};
}

/**
 * An owner-authenticated Connection Fetch route. Filesystem identities and read
 * permission stay with ctx.fs; each pull holds at most one bounded byte window.
 */
export function createVideoRoute(fs,{chunkBytes=256*1024}={}){
 if(!fs||['resolve','stat','readByteRange'].some(name=>typeof fs[name]!=='function'))throw new TypeError('视频路由缺少文件服务。');
 if(!Number.isSafeInteger(chunkBytes)||chunkBytes<1||chunkBytes>1024*1024)throw new RangeError('视频读取块大小无效。');
 async function fetch(request){
  const head=request.method==='HEAD';
  const fail=(status,extra={})=>new Response(head||status===499?null:'媒体文件暂不可用。',{status,headers:{...BASE_HEADERS,'Content-Type':'text/plain; charset=utf-8',...extra}});
  if(request.method!=='GET'&&!head)return fail(405,{Allow:'GET, HEAD'});
  let url;
  try{url=new URL(request.url);}catch{return fail(400);}
  const path=url.searchParams.get('path'),requestedVersion=url.searchParams.get('version');
  if(!absolutePath(path)||url.searchParams.getAll('path').length!==1||url.searchParams.getAll('version').length>1)return fail(400);
  if(!videoType(path))return fail(415);
  const abort=new AbortController();
  let ended=false,streamController,streamOwns=false,listening=false;
  const cleanup=()=>{if(listening){listening=false;request.signal.removeEventListener('abort',onAbort);}};
  function stop(notify){
   if(ended)return;ended=true;abort.abort();cleanup();
   if(notify)try{streamController?.error(streamError());}catch{}
  }
  const onAbort=()=>stop(true);
  const live=()=>{if(ended||abort.signal.aborted||request.signal.aborted)throw fault('FS_ABORTED');};
  request.signal.addEventListener('abort',onAbort,{once:true});listening=true;
  if(request.signal.aborted)onAbort();
  try{
   live();
   const target=await fs.resolve(path,{signal:abort.signal});live();
   const mediaType=videoType(target?.displayPath);
   if(!mediaType)return fail(415);
   const info=await fs.stat(target,abort.signal);live();
   if(!info)return fail(404);
   if(info.type!=='file')return fail(403);
   if(!Number.isSafeInteger(info.size)||info.size<0||typeof info.version!=='string'||!info.version)return fail(503);
   const {size,version}=info;
   if(requestedVersion!==null&&requestedVersion!==version)return fail(412);
   const etag='"'+encodeURIComponent(version)+'"';
   const headers={...BASE_HEADERS,'Content-Type':mediaType,'Accept-Ranges':'bytes',ETag:etag};
   // Range only applies to GET. HEAD reports the complete representation.
   if(head)return new Response(null,{headers:{...headers,'Content-Length':String(size)}});
   let range;
   const requestedRange=request.headers.get('range');
   // Desktop's protocol proxy removes Content-Length. Its explicit streaming
   // mode carries the complete length in Content-Range on the initial read.
   // A real Range and its If-Range precondition always take precedence.
   const initialRange=requestedRange===null&&url.searchParams.get('stream')==='1'&&size>0?'bytes=0-':null;
   const selectedRange=requestedRange!==null&&request.headers.has('if-range')&&request.headers.get('if-range')!==etag?null:requestedRange??initialRange;
   try{range=byteRange(selectedRange,size);}
   catch{return fail(416,{'Content-Range':`bytes */${size}`,'Accept-Ranges':'bytes'});}
   const {start,end,status}=range,length=end-start+1;
   headers['Content-Length']=String(length);
   if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
   if(length===0)return new Response(null,{status,headers});
   async function verify(){
    live();const current=await fs.stat(target,abort.signal);live();
    if(!current||current.type!=='file'||current.version!==version||current.size!==size)throw fault('changed');
   }
   async function read(offset,before=true){
    live();if(before)await verify();
    const count=Math.min(chunkBytes,end-offset+1);
    const data=await fs.readByteRange(target,{offset,length:count},abort.signal);live();
    if(!(data instanceof Uint8Array)||data.byteLength!==count)throw fault('changed');
    await verify();return data;
   }
   // Check the first bounded read before committing HTTP headers so a read
   // permission denial is an HTTP error rather than an opaque broken stream.
   let first=length>0?await read(start,false):null,next=start;
   live();
   const body=new ReadableStream({
    start(controller){streamController=controller;},
    async pull(controller){
     if(ended)return;
     try{
      if(next>end){ended=true;cleanup();controller.close();return;}
      const data=first??await read(next);first=null;
      if(ended)return;
      next+=data.byteLength;controller.enqueue(data);
      if(next>end){ended=true;cleanup();controller.close();}
     }catch{
      if(ended)return;
      stop(false);controller.error(streamError());
     }
    },
    cancel(){stop(false);first=null;},
   },{highWaterMark:0});
   const response=new Response(body,{status,headers});streamOwns=true;return response;
  }catch(error){
   if(request.signal.aborted||error?.code==='FS_ABORTED')return fail(499);
   return fail({FS_NOT_FOUND:404,FS_NOT_REGULAR_FILE:403,FS_PERMISSION_DENIED:403,FS_SANDBOX_DENIED:403,FS_STALE_VERSION:409,changed:409}[error?.code]??500);
  }finally{if(!streamOwns)cleanup();}
 }
 return Object.freeze({path:VIDEO_MEDIA_PATH,methods:Object.freeze(['GET','HEAD']),requestBody:'buffered',fetch});
}
