/** Resolve the sidebar through its public slot, including the shared scrollport. */
export function resolveRailElements(anchor){
 const nav=anchor?.closest?.('nav');
 let root=nav?.parentElement;
 const sidebar=root?.closest?.('[data-slot="sidebar"]');
 if(sidebar){
  let branch=root;
  while(branch?.parentElement&&branch.parentElement!==sidebar)branch=branch.parentElement;
  if(branch?.parentElement===sidebar)root=branch;
 }
 // The Host removes data-sidebar-scrollport while collapsed but retains the
 // same wrappers. Resolve that branch from the slot in both presentations.
 const scrollport=root&&nav?.parentElement!==root?nav?.parentElement:null;
 return {nav,root,scrollport};
}

/** Keep frame geometry alive across sidebar content rerenders and toggles. */
export function wireRailGeometry(anchor,{preferredWidth=392,setWidth,onWidth}={}){
 const {root}=resolveRailElements(anchor);
 const column=root?.closest?.('[data-slot="sidebar"]')?.parentElement;
 const frame=column?.parentElement;
 if(!frame?.style)return()=>{};
 const owned=[];
 for(const [node,name] of [[column,'data-cgpt-rail-column'],[frame,'data-cgpt-rail-frame']]){
  const before=node.getAttribute(name);node.setAttribute(name,'');
  owned.push(()=>{if(node.getAttribute(name)!=='')return;if(before===null)node.removeAttribute(name);else node.setAttribute(name,before);});
 }
 const properties=new Map(['--cgpt-rail-columns','--cgpt-rail-content-width'].map(name=>[name,{
  before:frame.style.getPropertyValue(name),priority:frame.style.getPropertyPriority(name),installed:null,
 }]));
 const write=(name,value)=>{
  properties.get(name).installed=value;
  if(frame.style.getPropertyValue(name)!==value)frame.style.setProperty(name,value);
 };
 owned.push(()=>{for(const [name,{before,priority,installed}] of properties){
  if(installed===null||frame.style.getPropertyValue(name)!==installed)continue;
  if(before)frame.style.setProperty(name,before,priority);else frame.style.removeProperty(name);
 }});
 const validWidth=value=>Number.isFinite(value)&&value>=264&&value<=420;
 let preferred=validWidth(preferredWidth)?Math.round(preferredWidth):392;
 let disposed=false,lastNative,lastCollapsed,lastDrawer,lastDragging=false,frameWidth,restoreTarget;
 const sync=(resized=false,records=[])=>{
  if(disposed)return;
  const native=frame.style.gridTemplateColumns;
  const collapsed=frame.hasAttribute('data-sidebar-collapsed');
  const drawer=frame.hasAttribute('data-sidebar-drawer'),dragging=frame.hasAttribute('data-dragging');
  // Reading computed/root widths here would capture the animation, not its target.
  // Ignore our CSS-variable mutations so they cannot create an observer loop.
  if(!resized&&native===lastNative&&collapsed===lastCollapsed&&drawer===lastDrawer&&dragging===lastDragging)return;
  const tracks=native.match(/^(\d+(?:\.\d+)?)px\s+minmax\((\d+(?:\.\d+)?)px,\s*1fr\)\s+minmax\(0px,\s*(\d+(?:\.\d+)?)px\)$/);
  if(!tracks)return;
  const nativeLeading=Number(tracks[1]),nativeMinimum=Number(tracks[2]),nativeRight=Number(tracks[3]);
  // A very short drag can start and finish in one mutation batch.
  const wasDragging=lastDragging||records.some(record=>record.attributeName==='data-dragging'&&record.oldValue!==null);
  const changedWidth=native!==lastNative;
  const changedToggle=lastCollapsed!==undefined&&collapsed!==lastCollapsed;
  let notifyWidth;
  if(!drawer&&!collapsed&&!changedToggle&&(dragging||wasDragging)&&changedWidth&&validWidth(nativeLeading)&&preferred!==Math.round(nativeLeading)){
   preferred=Math.round(nativeLeading);notifyWidth=preferred;
  }
  lastNative=native;lastCollapsed=collapsed;lastDrawer=drawer;lastDragging=dragging;
  if(drawer){
   restoreTarget=undefined;
   // A narrow host uses an overlay drawer, not a leading grid track.
   // Its column has the host's target width; leave both targets untouched.
   const drawerWidth=Number.parseFloat(column.style.width);
   write('--cgpt-rail-content-width',(Number.isFinite(drawerWidth)?drawerWidth:preferred)+'px');
   write('--cgpt-rail-columns',native);
   return;
  }
  // Folded landscape can center the sidebar at half the viewport. That is a
  // host presentation constraint, not a new user drag preference.
  const constrained=nativeLeading>420;
  const leading=collapsed?52:constrained?nativeLeading:preferred;
  const minimum=Math.max(0,nativeMinimum-Math.max(0,leading-nativeLeading));
  const columns=width=>{
   // The host right maximum can exceed the actual squeezed panel width.
   const right=Number.isFinite(width)&&width>=0?Math.max(0,Math.min(nativeRight,width-nativeLeading-nativeMinimum)):nativeRight;
   return leading+'px minmax('+minimum+'px, 1fr) minmax(0px, '+right+'px)';
  };
  // Install the final expanded target BEFORE asking the host to remember it or
  // forcing layout. Host toggleSidebar briefly writes its default 280px first.
  // Keep the content target while closed; only the outer grid track animates.
  write('--cgpt-rail-content-width',(constrained&&!collapsed?nativeLeading:preferred)+'px');
  write('--cgpt-rail-columns',columns(frameWidth));
  const restore=!collapsed&&!constrained&&Math.abs(nativeLeading-preferred)>1;
  if(!restore)restoreTarget=undefined;
  else if(typeof setWidth==='function'&&restoreTarget!==nativeLeading+':'+preferred){
   restoreTarget=nativeLeading+':'+preferred;
   setWidth(preferred);
  }
  if(typeof frame.getBoundingClientRect==='function'){
   frameWidth=frame.getBoundingClientRect()?.width;
   write('--cgpt-rail-columns',columns(frameWidth));
  }
  if(notifyWidth!==undefined)onWidth?.(notifyWidth);
 };
 let mutationObserver,resizeObserver;
 if(typeof MutationObserver==='function'){
  mutationObserver=new MutationObserver(records=>sync(false,records));
  mutationObserver.observe(frame,{attributes:true,attributeOldValue:true,attributeFilter:['style','data-sidebar-collapsed','data-sidebar-drawer','data-dragging']});
 }
 if(typeof frame.getBoundingClientRect==='function'&&typeof ResizeObserver==='function'){
  resizeObserver=new ResizeObserver(()=>sync(true));resizeObserver.observe(frame);
 }
 const dispose=()=>{if(disposed)return;disposed=true;mutationObserver?.disconnect();resizeObserver?.disconnect();for(const undo of owned.reverse())undo();};
 try{sync();}catch(error){dispose();throw error;}
 return dispose;
}

/** Style the sidebar across the supported Host structures. */
export function wireRailLayout(anchor,{labels={},navigation}={}){
 const {nav,root,scrollport}=resolveRailElements(anchor);
 if(!nav||!root)return()=>{};
 const owned=[];
 function mark(node,name,value=''){
  if(!node)return;const before=node.getAttribute(name);node.setAttribute(name,value);
  owned.push(()=>{if(before===null)node.removeAttribute(name);else node.setAttribute(name,before);});
 }
 mark(root,'data-cgpt-rail');mark(nav,'data-cgpt-rail-nav');
 if(scrollport&&scrollport!==root){
  mark(scrollport,'data-cgpt-rail-scrollport');
  if(scrollport.parentElement!==root)mark(scrollport.parentElement,'data-cgpt-rail-scroll-region');
 }
 const brand=root.querySelector('[data-slot="sidebar.brand.name"]');
 const brandRow=brand?.closest('[data-window-drag]');mark(brandRow,'data-cgpt-brand-row');
 for(const row of Array.from(root.children))if(row.hasAttribute('data-window-drag')&&row!==brandRow)mark(row,'data-cgpt-top-strip');
 const newButton=Array.from(root.querySelectorAll('button[aria-label]')).find(button=>button.getAttribute('aria-label')===labels.newSession&&!brandRow?.contains(button));
 mark(newButton,'data-cgpt-new-chat');
 const toggle=Array.from(root.querySelectorAll('button[aria-label]')).find(button=>[labels.toggleOpen,labels.toggleCollapse].includes(button.getAttribute('aria-label')));
 mark(toggle,'data-cgpt-rail-toggle');
 const iconParent=newButton?.querySelector('svg')?.parentElement;
 const newLabel=iconParent?.lastElementChild;
 if(newLabel&&newLabel.tagName==='SPAN'){mark(newLabel,'data-cgpt-new-label',labels.newChat||'新聊天');}
 const region=root.querySelector('[data-slot="sidebar.workspaces"]');
 mark(region?.parentElement,'data-cgpt-workspace-region');
 const launcher=root.querySelector('[data-slot="settings.launcher"]');
 mark(launcher,'data-cgpt-account-seat');mark(launcher?.parentElement,'data-cgpt-settings-row');
 const footer=root.querySelector('[data-slot="sidebar.footer.action"]');mark(footer,'data-cgpt-footer-seat');
 const settings=root.querySelector('[data-slot="sidebar.settings"]');
 mark(settings?.parentElement?.parentElement,'data-cgpt-foot-area');
 for(const button of nav.querySelectorAll('button[aria-label]')){
  if(button.closest('[data-cgpt-app-dock]'))continue;
  const name=button.getAttribute('aria-label');
  const id=Object.keys(labels.panels||{}).find(id=>labels.panels[id]===name)||(name===labels.more?'more':null);
  if(!id)continue;
  mark(button,'data-cgpt-nav-button',id);
  mark(button,'title',name);
  if(id!=='home'&&id!=='more')mark(button,'draggable','false');
  let item=button;while(item.parentElement&&item.parentElement!==nav)item=item.parentElement;
  if(item.parentElement===nav){
   mark(item,'data-cgpt-nav-item',id);
   if(navigation){
    const index=navigation.visible.findIndex(entry=>entry.kind==='panel'&&entry.id===id);
    if((id==='more'&&!navigation.showMore)||(id!=='more'&&index<0))mark(item,'data-cgpt-nav-hidden');
    mark(item,'data-cgpt-nav-order',String(id==='more'?navigation.visible.length:Math.max(0,index)));
   }
  }
 }
 const search=root.querySelector('[data-slot="sidebar.workspaces"] button[aria-label="'+(labels.search||'搜索会话').replaceAll('"','\\"')+'"]');
 mark(search,'data-cgpt-search-button');
 let disposed=false;
 return()=>{if(disposed)return;disposed=true;for(const undo of owned.reverse())undo();};
}
