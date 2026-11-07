const SVG_NS='http://www.w3.org/2000/svg';
const SHAPES=new Set(['path','circle','ellipse','rect','line','polyline','polygon','g']);
const GEOMETRY={path:['d','pathLength'],circle:['cx','cy','r','pathLength'],ellipse:['cx','cy','rx','ry','pathLength'],rect:['x','y','width','height','rx','ry','pathLength'],line:['x1','y1','x2','y2','pathLength'],polyline:['points','pathLength'],polygon:['points','pathLength'],g:[]};
const PRESENTATION=['fill','stroke','fill-rule','clip-rule','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','opacity','fill-opacity','stroke-opacity','transform'];
const NUMBERS=/^[\s,+.\-\deE]+$/;
const escape=value=>value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const nameOf=node=>String(node?.localName||node?.tagName||'').toLowerCase();
function allowedValue(name,value){
 if(!value||value.length>16000||/[<>&"'\\]/.test(value)||/url\s*\(/i.test(value))return false;
 if(name==='d')return /^[\s,0-9.+\-eEmMzZlLhHvVcCsSqQtTaA]+$/.test(value);
 if(name==='fill'||name==='stroke')return /^(?:none|currentColor|transparent|#[0-9a-f]{3,8}|[a-z]+|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\))$/i.test(value);
 if(name==='fill-rule'||name==='clip-rule')return /^(?:nonzero|evenodd)$/.test(value);
 if(name==='stroke-linecap')return /^(?:butt|round|square)$/.test(value);
 if(name==='stroke-linejoin')return /^(?:miter|round|bevel)$/.test(value);
 if(name==='transform')return /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\([\s,+.\-\deE]+\)\s*)+$/.test(value);
 if(name==='stroke-dasharray'&&value==='none')return true;
 return NUMBERS.test(value);
}
function attributes(node,names){
 return names.flatMap(name=>{
  const value=node.getAttribute?.(name)?.trim();
  return typeof value==='string'&&allowedValue(name,value)?[' '+name+'="'+escape(value)+'"']:[];
 }).join('');
}
function svgImage(root){
 if(nameOf(root)!=='svg'||root.namespaceURI&&root.namespaceURI!==SVG_NS)return null;
 let count=0,geometry=0;
 const masks=new Map(),copiedMasks=new Map(),maskIds=new Map(),visitingMasks=new Set();
 // Mask artwork is geometry too. Keep only local, validated references and
 // replace source IDs; dropping a mask would expose its solid covering shape.
 for(const defs of root.children||[]){
  if(nameOf(defs)!=='defs'||defs.namespaceURI&&defs.namespaceURI!==SVG_NS)continue;
  for(const mask of defs.children||[]){
   if(nameOf(mask)!=='mask'||mask.namespaceURI&&mask.namespaceURI!==SVG_NS)continue;
   const id=mask.getAttribute?.('id');
   if(typeof id==='string'&&/^[a-z_][\w.:-]{0,127}$/i.test(id))masks.set(id,masks.has(id)?null:mask);
  }
 }
 function maskAttribute(node,depth){
  const value=node.getAttribute?.('mask')?.trim();
  if(value==null||value==='none')return '';
  const match=/^url\(#([a-z_][\w.:-]{0,127})\)$/i.exec(value);
  const mask=match&&masks.get(match[1]);
  if(!mask||visitingMasks.has(match[1]))throw new Error('Unsupported icon mask');
  const sourceId=match[1];
  if(!maskIds.has(sourceId))maskIds.set(sourceId,'app-icon-mask-'+(maskIds.size+1));
  if(!copiedMasks.has(sourceId)){
   if(depth>12||++count>256)throw new Error('Oversized icon');
   visitingMasks.add(sourceId);
   let units='';
   for(const name of ['maskUnits','maskContentUnits']){
    const unit=mask.getAttribute?.(name);
    if(unit!=null){
     if(unit!=='userSpaceOnUse'&&unit!=='objectBoundingBox')throw new Error('Unsupported mask units');
     units+=' '+name+'="'+unit+'"';
    }
   }
   const type=mask.getAttribute?.('mask-type');
   if(type!=null){
    if(type!=='luminance'&&type!=='alpha')throw new Error('Unsupported mask type');
    units+=' mask-type="'+type+'"';
   }
   const before=geometry;
   const children=Array.from(mask.children||[]).map(child=>copy(child,depth+1)).join('');
   if(geometry===before)throw new Error('Empty icon mask');
   copiedMasks.set(sourceId,'<mask id="'+maskIds.get(sourceId)+'"'+units+
    attributes(mask,['x','y','width','height',...PRESENTATION])+'>'+children+'</mask>');
   visitingMasks.delete(sourceId);
  }
  return ' mask="url(#'+maskIds.get(sourceId)+')"';
 }
 function copy(node,depth){
  if(depth>12||++count>256)throw new Error('Oversized icon');
  const name=nameOf(node);
  if(!SHAPES.has(name)||node.namespaceURI&&node.namespaceURI!==SVG_NS)return '';
  if(name!=='g')geometry++;
  return '<'+name+attributes(node,[...GEOMETRY[name],...PRESENTATION])+maskAttribute(node,depth)+'>'+
   Array.from(node.children||[]).map(child=>copy(child,depth+1)).join('')+'</'+name+'>';
 }
 try{
  const children=Array.from(root.children||[]).map(child=>copy(child,0)).join('');
  if(!geometry)return null;
  const raw=root.getAttribute?.('viewBox')?.trim();
  const box=raw?.split(/[\s,]+/).map(Number);
  let viewBox='0 0 24 24';
  if(box?.length===4&&box.every(Number.isFinite)&&box[2]>0&&box[3]>0)viewBox=box.join(' ');
  else{
   const width=Number(root.getAttribute?.('width')),height=Number(root.getAttribute?.('height'));
   if(Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0)viewBox='0 0 '+width+' '+height;
  }
  const rootFill=root.getAttribute?.('fill')?.trim();
  const rootMask=maskAttribute(root,0);
  const definitions=copiedMasks.size?'<defs>'+Array.from(copiedMasks.values()).join('')+'</defs>':'';
  const markup='<svg xmlns="'+SVG_NS+'" viewBox="'+viewBox+'" color="#fff"'+
   (rootFill&&allowedValue('fill',rootFill)?'':' fill="currentColor"')+attributes(root,PRESENTATION)+rootMask+'>'+definitions+children+'</svg>';
  if(markup.length>32768)return null;
  return 'data:image/svg+xml,'+encodeURIComponent(markup);
 }catch{return null;}
}
function imageURL(node,document){
 const raw=String(node.currentSrc||node.getAttribute?.('src')||'').trim();
 if(!raw||raw.length>256000||/[\u0000-\u001f\u007f]/.test(raw))return null;
 if(/^data:/i.test(raw)){
  if(/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(raw))return raw;
  const svg=/^data:image\/svg\+xml(?:;charset=utf-8)?(;base64)?,(.*)$/is.exec(raw);
  if(!svg)return null;
  const Parser=document?.defaultView?.DOMParser;
  if(typeof Parser!=='function')return null;
  try{
   const markup=svg[1]?document.defaultView.atob(svg[2]):decodeURIComponent(svg[2]);
   if(markup.length>32768||/<!DOCTYPE|<!ENTITY/i.test(markup))return null;
   const parsed=new Parser().parseFromString(markup,'image/svg+xml');
   if(parsed.querySelector?.('parsererror'))return null;
   return svgImage(parsed.documentElement);
  }catch{return null;}
 }
 try{
  const base=new URL(document?.baseURI||document?.location?.href);
  const url=new URL(raw,base);
  if(url.username||url.password)return null;
  const sameOrigin=url.origin!=='null'?url.origin===base.origin:
   url.protocol==='dsh-app:'&&url.protocol===base.protocol&&url.host===base.host;
  if(sameOrigin&&['https:','http:','dsh-app:'].includes(url.protocol))return url.href;
  if(url.protocol==='https:'&&/\.(?:png|jpe?g|webp|gif|avif|ico|svg)$/i.test(url.pathname))return url.href;
 }catch{/* Missing base and unsupported URLs are not icon capabilities. */}
 return null;
}

/** Snapshot native artwork without mounting plugin components or copying handlers. */
export function readNativeAppIcons(nav){
 const icons=new Map();
 for(const button of nav?.querySelectorAll?.('[data-cgpt-nav-button]')||[]){
  if(button.closest?.('[data-cgpt-app-button],[data-cgpt-app-dock]'))continue;
  const id=button.getAttribute?.('data-cgpt-nav-button');
  if(!id||icons.has(id))continue;
  const node=button.querySelector?.('svg,img');
  if(!node)continue;
  const url=nameOf(node)==='svg'?svgImage(node):nameOf(node)==='img'?imageURL(node,node.ownerDocument||nav.ownerDocument):null;
  if(url)icons.set(id,url);
 }
 return icons;
}
