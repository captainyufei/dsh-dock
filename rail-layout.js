/** Harness 0.2.1-rc.5 sidebar styling adapter. Never moves host-owned nodes. */
export function wireRailLayout(anchor,{expanded,labels={},onWidth,preferredWidth=392,setWidth,navigation}={}){
 const nav=anchor?.closest?.('nav');const root=nav?.parentElement;
 if(!nav||!root)return()=>{};
 const owned=[];
 function mark(node,name,value=''){
  if(!node)return;const before=node.getAttribute(name);node.setAttribute(name,value);
  owned.push(()=>{if(before===null)node.removeAttribute(name);else node.setAttribute(name,before);});
 }
 mark(root,'data-cgpt-rail');mark(nav,'data-cgpt-rail-nav');
 const sidebarSlot=root.closest('[data-slot="sidebar"]');
 const column=sidebarSlot?.parentElement;const frame=column?.parentElement;
 mark(column,'data-cgpt-rail-column');mark(frame,'data-cgpt-rail-frame');
 // Window chrome belongs to the permanent shell.overlay contribution.
 // This adapter only owns the sidebar's layout and navigation geometry.
 // The native grid animates its right maximum, which may exceed the width its
 // panel can actually use. Resolve that maximum before interpolation so a
 // squeezed right track cannot grow while the panel is sliding closed.
 let frameObserver,frameResizeObserver,layoutDisposed=false;
 if(frame?.style){
  const property='--cgpt-rail-columns';
  const before=frame.style.getPropertyValue(property);
  const priority=frame.style.getPropertyPriority(property);
  let installed=null,lastNative,lastCollapsed;
  const syncColumns=(resized=false)=>{
   if(layoutDisposed)return;
   const native=frame.style.gridTemplateColumns,collapsed=frame.hasAttribute('data-sidebar-collapsed');
   // Our own variable and other frame-local measurements also mutate style.
   if(!resized&&native===lastNative&&collapsed===lastCollapsed)return;
   const tracks=native.match(/^(\d+(?:\.\d+)?)px\s+minmax\((\d+(?:\.\d+)?)px,\s*1fr\)\s+minmax\(0px,\s*(\d+(?:\.\d+)?)px\)$/);
   if(!tracks)return;
   lastNative=native;lastCollapsed=collapsed;
   const nativeLeading=Number(tracks[1]),nativeMinimum=Number(tracks[2]),nativeRight=Number(tracks[3]);
   const leading=collapsed?52:nativeLeading;
   // The host's solve used its original leading width. Let only the center
   // absorb the additional rail width, preserving the solved panel geometry.
   const extra=Math.max(0,leading-nativeLeading),minimum=Math.max(0,nativeMinimum-extra);
   const width=typeof frame.getBoundingClientRect==='function'?frame.getBoundingClientRect()?.width:undefined;
   const right=Number.isFinite(width)&&width>=0?Math.max(0,Math.min(nativeRight,width-nativeLeading-nativeMinimum)):nativeRight;
   const columns=leading+'px minmax('+minimum+'px, 1fr) minmax(0px, '+right+'px)';
   installed=columns;
   if(frame.style.getPropertyValue(property)!==columns)frame.style.setProperty(property,columns);
  };
  syncColumns();
  if(typeof MutationObserver==='function'){
   frameObserver=new MutationObserver(()=>syncColumns());
   frameObserver.observe(frame,{attributes:true,attributeFilter:['style','data-sidebar-collapsed']});
  }
  if(typeof frame.getBoundingClientRect==='function'&&typeof ResizeObserver==='function'){
   frameResizeObserver=new ResizeObserver(()=>syncColumns(true));
   frameResizeObserver.observe(frame);
  }
  owned.push(()=>{
   if(installed===null||frame.style.getPropertyValue(property)!==installed)return;
   if(before)frame.style.setProperty(property,before,priority);else frame.style.removeProperty(property);
  });
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
 const currentWidth=Number.parseFloat(root.style.width||'0');
 if(expanded&&typeof setWidth==='function'&&Math.abs(currentWidth-preferredWidth)>1)setWidth(preferredWidth);
 let observer;let animationFrame;
 if(expanded&&typeof ResizeObserver==='function'){
  const observe=()=>{
   observer=new ResizeObserver(entries=>{
    const width=entries[0]?.target?.getBoundingClientRect().width;
    if(width>=264&&width<=420)onWidth?.(Math.round(width));
   });observer.observe(root);
  };
  if(typeof requestAnimationFrame==='function')animationFrame=requestAnimationFrame(observe);else observe();
 }
 return()=>{if(layoutDisposed)return;layoutDisposed=true;if(animationFrame!==undefined)cancelAnimationFrame(animationFrame);observer?.disconnect();frameObserver?.disconnect();frameResizeObserver?.disconnect();for(const undo of owned.reverse())undo();};
}
