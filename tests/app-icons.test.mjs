import test from 'node:test';
import assert from 'node:assert/strict';
import {readNativeAppIcons} from '../src/app-icons.js';

const NS='http://www.w3.org/2000/svg';
function node(name,attrs={},children=[]){
 return {localName:name,namespaceURI:NS,children,getAttribute:key=>attrs[key]??null,hasAttribute:key=>key in attrs};
}
function fixture(items,{baseURI='dsh-app://app/',Parser}={}){
 const document={baseURI,defaultView:{DOMParser:Parser,atob:value=>Buffer.from(value,'base64').toString('binary')}};
 const buttons=items.map(({id,icon,excluded=false})=>({
  getAttribute:key=>key==='data-cgpt-nav-button'?id:null,
  closest:selector=>{assert.equal(selector,'[data-cgpt-app-button],[data-cgpt-app-dock]');return excluded?{}:null;},
  querySelector:selector=>{assert.equal(selector,'svg,img');return icon;},
 }));
 return {nav:{ownerDocument:document,querySelectorAll:selector=>{assert.equal(selector,'[data-cgpt-nav-button]');return buttons;}},buttons};
}
const svg=(children,attrs={})=>node('svg',{viewBox:'0 0 20 20',...attrs},children);
const img=src=>node('img',{src});
const markup=url=>decodeURIComponent(url.slice(url.indexOf(',')+1));

test('copies only native icon artwork, leaves nodes untouched and excludes app Dock descendants',()=>{
 const icon=svg([node('path',{d:'M2 2h16v16H2Z',fill:'currentColor'})]);
 const before=JSON.stringify(icon),f=fixture([{id:'chat',icon},{id:'home',icon,excluded:true},{id:'missing',icon:null}]);
 const result=readNativeAppIcons(f.nav);
 assert.deepEqual([...result.keys()],['chat']);assert.equal(JSON.stringify(icon),before);
 assert.match(markup(result.get('chat')),/color="#fff"/);assert.match(markup(result.get('chat')),/viewBox="0 0 20 20"/);
 assert.equal(readNativeAppIcons(null).size,0);
});

test('SVG reconstruction strips scripts, foreign content, external use, styles, event handlers, IDs and url paints',()=>{
 const icon=svg([
  node('script',{},[node('path',{d:'M0 0'})]),node('foreignObject',{},[node('path',{d:'M0 0'})]),node('use',{href:'https://evil.test/a.svg#x'}),
  node('path',{d:'M1 1L9 9',id:'duplicate',onload:'fetch(secret)',style:'fill:red',fill:'url(https://evil.test/a)',stroke:'currentColor','stroke-width':'1.5','stroke-linecap':'round'}),
  node('g',{transform:'translate(2,3)'},[node('circle',{cx:'4',cy:'4',r:'3',fill:'#abcdef'})]),
 ],{id:'root',onload:'evil()',style:'color:red',fill:'url(#pattern)',color:'red'});
 const value=markup(readNativeAppIcons(fixture([{id:'app',icon}]).nav).get('app'));
 assert.doesNotMatch(value,/script|foreignObject|use|href|onload|style=|id=|url\(|evil|color="red"/);
 assert.match(value,/fill="currentColor"/);assert.match(value,/stroke-width="1.5"/);assert.match(value,/transform="translate\(2,3\)"/);assert.match(value,/fill="#abcdef"/);
});

test('retains geometry and presentation attributes without a DOM serializer dependency',()=>{
 const icon=svg([
  node('rect',{x:'1',y:'2',width:'4',height:'6',rx:'1',fill:'none',stroke:'#fff'}),
  node('ellipse',{cx:'10',cy:'10',rx:'4',ry:'3',opacity:'.5'}),
  node('line',{x1:'1',y1:'1',x2:'4',y2:'4','stroke-dasharray':'2,3','stroke-dashoffset':'1'}),
  node('polyline',{points:'1,2 3,4 5,6'}),node('polygon',{points:'2 3,4 5,6 7','fill-rule':'evenodd'}),
 ],{viewBox:'-2 -2 40 40',fill:'none','stroke-linejoin':'round'});
 const value=markup(readNativeAppIcons(fixture([{id:'app',icon}]).nav).get('app'));
 for(const name of ['rect','ellipse','line','polyline','polygon'])assert.match(value,new RegExp('<'+name));
 assert.match(value,/viewBox="-2 -2 40 40"/);assert.match(value,/stroke-linejoin="round"/);
});

test('preserves Context Insights nested local masks instead of exporting its solid cover rectangle',()=>{
 // dsh-context's mono sidebar icon uses a hole mask and four translated copies
 // of it to thin the original sheet artwork. Its only visible node is a rect.
 const bounds={x:'-34',y:'-34',width:'1092',height:'1092'};
 const rectangle=(attrs={})=>node('rect',{...bounds,...attrs});
 const hole='dsh-context-sheet-r7-hole',thin='dsh-context-sheet-r7-thin';
 const icon=svg([
  node('defs',{},[
   node('mask',{id:hole,maskUnits:'userSpaceOnUse',...bounds},[
    rectangle({fill:'#fff'}),node('g',{fill:'#000'},[
     node('path',{d:'M130 20h770v96H130z'}),node('path',{d:'M82 68h96v888H82z'}),
    ]),
   ]),
   node('mask',{id:thin,maskUnits:'userSpaceOnUse',...bounds},[
    rectangle({fill:'#fff'}),...[[17,0],[-17,0],[0,17],[0,-17]].map(([x,y])=>rectangle({fill:'#000',mask:'url(#'+hole+')',transform:'translate('+x+' '+y+')'})),
   ]),
  ]),rectangle({fill:'currentColor',mask:'url(#'+thin+')'}),
 ],{viewBox:'0 0 1024 1024'});
 const before=JSON.stringify(icon);
 const value=markup(readNativeAppIcons(fixture([{id:'dsh-context',icon}]).nav).get('dsh-context'));
 assert.equal(JSON.stringify(icon),before);
 assert.equal((value.match(/<mask /g)||[]).length,2);
 assert.equal((value.match(/mask="url\(#/g)||[]).length,5);
 assert.match(value,/<rect[^>]*fill="currentColor" mask="url\(#app-icon-mask-1\)"/);
 assert.match(value,/<mask id="app-icon-mask-1" maskUnits="userSpaceOnUse"/);
 assert.match(value,/<g fill="#000"><path d="M130 20h770v96H130z"/);
 assert.match(value,/transform="translate\(-17 0\)"/);
 for(const [,id]of value.matchAll(/mask="url\(#([^)]*)\)"/g))assert.ok(value.includes('id="'+id+'"'));
 assert.doesNotMatch(value,/dsh-context-sheet|style=|href=|<use/);
});

test('local masks keep the geometry whitelist and generate their own IDs',()=>{
 const icon=svg([
  node('defs',{},[
   node('mask',{id:'source-id',onload:'bad()',style:'mask-image:url(https://evil.test)',maskUnits:'userSpaceOnUse','mask-type':'alpha'},[
    node('script'),node('foreignObject'),node('use',{href:'https://evil.test/a.svg#x'}),
    node('rect',{width:'20',height:'20',fill:'#fff',onclick:'bad()'}),
   ]),
   node('mask',{id:'unused'},[node('rect',{width:'99'})]),
  ]),node('circle',{cx:'10',cy:'10',r:'8',mask:'url(#source-id)'}),
 ]);
 const value=markup(readNativeAppIcons(fixture([{id:'app',icon}]).nav).get('app'));
 assert.match(value,/mask-type="alpha"/);assert.match(value,/id="app-icon-mask-1"/);
 assert.doesNotMatch(value,/source-id|unused|script|foreignObject|<use|href=|onload|onclick|style=|evil|width="99"/);
});

test('rejects external, missing, ambiguous and cyclic masks rather than exposing unmasked geometry',()=>{
 const rect=mask=>node('rect',{width:'20',height:'20',mask});
 const local=(id,children,attrs={})=>node('mask',{id,...attrs},children);
 const make=(mask,definitions=[])=>svg([node('defs',{},definitions),rect(mask)]);
 const invalid=[
  make('url(https://evil.test/m.svg#mask)'),make('url(#missing)'),make('var(--mask)'),
  make('url(#one)',[local('one',[rect('url(#one)')])]),
  make('url(#one)',[local('one',[rect('url(#two)')]),local('two',[rect('url(#one)')])]),
  make('url(#one)',[local('one',[node('use',{href:'#elsewhere'})])]),
  make('url(#one)',[local('one',[node('rect')]),local('one',[node('circle')])]),
  make('url(#one)',[local('one',[node('rect')],{maskUnits:'url(https://evil.test)'})]),
 ];
 for(const icon of invalid)assert.equal(readNativeAppIcons(fixture([{id:'app',icon}]).nav).size,0);
});

test('invalid roots and geometry-only unsupported icons are omitted; duplicate ids keep first valid image',()=>{
 const bad=svg([node('use',{href:'#icon'})]),good=svg([node('path',{d:'M2 2L3 3'})]);
 const wrongNS={...good,namespaceURI:'http://www.w3.org/1999/xhtml'};
 const result=readNativeAppIcons(fixture([{id:'a',icon:bad},{id:'a',icon:good},{id:'a',icon:svg([node('circle',{r:'7'})])},{id:'other',icon:wrongNS}]).nav);
 assert.equal(result.size,1);assert.match(markup(result.get('a')),/M2 2L3 3/);
});

test('validates viewBox and bounds SVG size and nesting',()=>{
 const fallback=svg([node('path',{d:'M0 0L2 2'})],{viewBox:'0 0 NaN 20',width:'16',height:'18'});
 assert.match(markup(readNativeAppIcons(fixture([{id:'a',icon:fallback}]).nav).get('a')),/viewBox="0 0 16 18"/);
 let nested=node('path',{d:'M0 0'});for(let i=0;i<20;i++)nested=node('g',{},[nested]);
 assert.equal(readNativeAppIcons(fixture([{id:'a',icon:svg([nested])}]).nav).size,0);
 assert.equal(readNativeAppIcons(fixture([{id:'a',icon:svg(Array.from({length:300},()=>node('path',{d:'M0 0'})))}]).nav).size,0);
});

test('allows existing same-origin image routes and ordinary HTTPS image URLs',()=>{
 const items=[['relative','/api/plugin-icon'],['same','dsh-app://app/assets/icon.svg'],['https','https://cdn.test/icon.webp?v=1']].map(([id,src])=>({id,icon:img(src)}));
 const result=readNativeAppIcons(fixture(items).nav);
 assert.equal(result.get('relative'),'dsh-app://app/api/plugin-icon');assert.equal(result.get('same'),'dsh-app://app/assets/icon.svg');assert.equal(result.get('https'),'https://cdn.test/icon.webp?v=1');
 const web=readNativeAppIcons(fixture([{id:'same',icon:img('http://localhost:8888/image')}],{baseURI:'http://localhost:8888/'}).nav);
 assert.equal(web.get('same'),'http://localhost:8888/image');
});

test('rejects image URLs that are pages, credentialed, unsafe schemes or cross-origin HTTP',()=>{
 const values=['https://cdn.test/page','https://user:secret@cdn.test/icon.png','http://cdn.test/icon.png','javascript:alert(1)','file:///etc/passwd','blob:https://app/id','data:text/html,<script>x</script>','dsh-app://other/icon'];
 assert.equal(readNativeAppIcons(fixture(values.map((src,i)=>({id:String(i),icon:img(src)}))).nav).size,0);
});

test('accepts raster data images but rejects unsupported or malformed data encodings',()=>{
 const accepted=['data:image/png;base64,YQ==','data:image/jpeg;base64,YQ==','data:image/webp;base64,YQ=='];
 const rejected=['data:image/svg+xml,%3Csvg%3E%3C/svg%3E','data:image/gif;base64,YQ==','data:image/png,raw','data:image/png;base64,<script>'];
 const result=readNativeAppIcons(fixture([...accepted,...rejected].map((src,i)=>({id:String(i),icon:img(src)}))).nav);
 assert.deepEqual([...result.values()],accepted);
});

test('SVG data URLs require successful XML parsing and pass through the same whitelist',()=>{
 let parsed=0;
 const Parser=class{parseFromString(value,type){parsed++;assert.equal(type,'image/svg+xml');return {documentElement:svg([node('script'),node('path',{d:'M1 1L2 2',onload:'bad()'})]),querySelector:()=>null};}};
 const result=readNativeAppIcons(fixture([{id:'svg',icon:img('data:image/svg+xml,'+encodeURIComponent('<svg><path d="M1 1L2 2"/></svg>'))},{id:'entity',icon:img('data:image/svg+xml,'+encodeURIComponent('<!DOCTYPE svg><svg/>'))}],{Parser}).nav);
 assert.equal(parsed,1);assert.equal(result.size,1);assert.doesNotMatch(markup(result.get('svg')),/script|onload/);
 const Broken=class{parseFromString(){return {querySelector:()=>({})};}};
 assert.equal(readNativeAppIcons(fixture([{id:'svg',icon:img('data:image/svg+xml,%3Csvg%3E')}],{Parser:Broken}).nav).size,0);
});
