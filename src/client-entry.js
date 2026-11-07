import React from 'react';
import {createPortal} from 'react-dom';
import {Menu as NativeMenu,MenuItemButton as NativeMenuItem,Modal as NativeModal,StateDot as NativeStateDot,Tooltip as NativeTooltip} from '@deepseek-ai/dsh-client-ui-primitives';
import {createDraftController} from './draft-controller.js';
import {createHostAdapter} from './host-adapter.js';
import {createNativeControls} from './native-controls.js';
import {HomePage,Glyph} from './home-ui.js';
import {sessionMention} from './references.js';
import {wireRailLayout,wireRailGeometry} from './rail-layout.js';
import {createPinnedSessionsModel} from './pinned-sessions-model.js';
import {PinnedSessions,mountPinnedSessionsSeat} from './pinned-sessions.js';
import {NATIVE_SESSION_ROW_ACTIONS,PINNED_SESSION_ROW_ACTIONS,mirrorNativePinnedActions} from './pinned-session-actions.js';
import {wireSessionContextEvents} from './session-context-events.js';
import {NATIVE_SESSION_MENU,SESSION_CONTEXT_MENU,mirrorNativeSessionMenu,createSessionContextController,mountSessionContextSeat,SessionContextMenu} from './session-context-menu.js';
import {createRailNavigationModel} from './rail-navigation-model.js';
import {RailActionButtons,RailOverflowContent,mountRailActionsSeat} from './rail-navigation.js';
import {createDockPreferences} from './rail-dock-preferences.js';
import {createNativePanelPinsSource} from './rail-native-pins.js';
import {GlobalWindowChrome} from './window-chrome-ui.js';
import {createAppDockModel} from './app-dock-model.js';
import {mountAppDockSeat} from './app-dock-host.js';
import {AppDock} from './app-dock-ui.js';
import {createGlobalSearchModel} from './global-search-model.js';
import {GlobalSearchPalette} from './global-search-ui.js';
import {wireGlobalSearchEntry} from './global-search-entry.js';
import {createNotificationModel} from './notification-model.js';
import {NotificationBell,mountNotificationSeat} from './notification-ui.js';
import {installVideoPreview} from './video-preview.js';
import HOME_CSS from './home.css';
import RAIL_CSS from './rail.css';
import SEARCH_CSS from './global-search.css';
import APP_DOCK_CSS from './app-dock.css';
import NOTIFICATION_CSS from './notification.css';
const h=React.createElement;
const STORAGE='cgpt-rail.home-draft.v2';
function readDraft(){try{return JSON.parse(localStorage.getItem(STORAGE)||'{}');}catch{return {};}}
function HomeIcon({size=18,layout,slots,getRailLabels,pinnedModel,sessionContext,renderSlot,navigationModel,appDockModel,notificationModel}){
 const ref=React.useRef(null);
 const [pinnedSeat,setPinnedSeat]=React.useState(null);
 const [contextSeat,setContextSeat]=React.useState(null);
 const [actionSeat,setActionSeat]=React.useState(null);
 const [appSeat,setAppSeat]=React.useState(null);
 const [notificationSeat,setNotificationSeat]=React.useState(null);
 const navigation=React.useSyncExternalStore(navigationModel.subscribe,navigationModel.getSnapshot,navigationModel.getSnapshot);
 const preferredWidth=React.useRef(392);
 const [rosterRevision,setRosterRevision]=React.useState(0);
 React.useEffect(()=>{
  const update=()=>setRosterRevision(n=>n+1);
  const a=slots.subscribe('sidebar.panellist',update),b=slots.subscribe('sidebar.panellist.actions',update);
  return()=>{a();b();};
 },[slots]);
 React.useLayoutEffect(()=>{
  const seat=mountPinnedSessionsSeat(ref.current);
  setPinnedSeat(seat?.node||null);
  return()=>seat?.dispose();
 },[pinnedModel]);
 React.useLayoutEffect(()=>{
  const seat=mountRailActionsSeat(ref.current);
  setActionSeat(seat?.node||null);
  return()=>seat?.dispose();
 },[navigationModel]);
 React.useLayoutEffect(()=>{
  const seat=mountAppDockSeat(ref.current,appDockModel);setAppSeat(seat?.node||null);
  return()=>seat?.dispose();
 },[appDockModel]);
 React.useLayoutEffect(()=>{
  const seat=mountNotificationSeat(ref.current,notificationModel);setNotificationSeat(seat?.node||null);
  return()=>seat?.dispose();
 },[notificationModel]);
 React.useLayoutEffect(()=>{
  const document=ref.current?.ownerDocument;
  const region=ref.current?.closest('nav')?.parentElement?.querySelector('[data-slot="sidebar.workspaces"]')?.parentElement;
  if(!document||!region)return;
  const seat=mountSessionContextSeat(document);
  setContextSeat(seat.node);
  const pattern=getRailLabels().sessionActionsTemplate.split('__cgpt_session_title__');
  const stop=wireSessionContextEvents(region,{
   onRequest:request=>sessionContext.open(request),
   isMoreButton:label=>pattern.length===2&&label.startsWith(pattern[0])&&label.endsWith(pattern[1]),
  });
  return()=>{sessionContext.close();stop();seat.dispose();};
 },[sessionContext,getRailLabels]);
 React.useLayoutEffect(()=>{
  return wireRailLayout(ref.current,{labels:getRailLabels(),navigation});
 },[size,layout,getRailLabels,rosterRevision,navigation]);
 // The Host changes icon size after its collapse fade. Keep grid ownership
 // alive across that rerender so it cannot cancel the in-flight transition.
 React.useLayoutEffect(()=>wireRailGeometry(ref.current,{
  preferredWidth:preferredWidth.current,setWidth:width=>layout.panels.setSidebar(width),
  onWidth:width=>{preferredWidth.current=width;},
 }),[layout]);
 return h(React.Fragment,null,
  h('span',{ref,style:{display:'flex'}},h('svg',{width:size,height:size,viewBox:'0 0 20 20','aria-hidden':true,fill:'currentColor'},h('path',{d:'M10 2 1 9.5l1.4 1.7L4 9.9V18h4v-5h4v5h4V9.9l1.6 1.3L19 9.5 10 2Z'}))),
  pinnedSeat&&createPortal(h(PinnedSessions,{model:pinnedModel,labels:getRailLabels(),StateDot:NativeStateDot,Tooltip:NativeTooltip,renderSlot}),pinnedSeat),
  contextSeat&&createPortal(h(SessionContextMenu,{controller:sessionContext,renderSlot,Menu:NativeMenu}),contextSeat),
  appSeat&&createPortal(h(AppDock,{model:appDockModel,notificationModel,Modal:NativeModal,Menu:NativeMenu,MenuItem:NativeMenuItem,Tooltip:NativeTooltip}),appSeat),
  notificationSeat&&createPortal(h(NotificationBell,{model:notificationModel,Menu:NativeMenu,MenuItem:NativeMenuItem}),notificationSeat),
  actionSeat&&createPortal(h(RailActionButtons,{navigationModel}),actionSeat),
 );
}
function CompactBrand(){return h('span',null,'DeepSeek');}
function GlobalSearchShell({ctx,model,Modal,getSearchLabel}){
 React.useLayoutEffect(()=>{
  let shortcuts;try{shortcuts=ctx.get('shortcuts');}catch{}
  return wireGlobalSearchEntry({document,shortcuts,open:()=>model.open(),getSearchLabel});
 },[ctx,model,getSearchLabel]);
 return h(GlobalSearchPalette,{model,Modal});
}
export default {
 inject:['slots','locale','layout','sessions','workspaces','conversation','uiWorkspace','uiSession','remote','remote.session','remote.permissionPresets','remote.agentPresets','remote.commands'],
 apply(ctx){
  installVideoPreview(ctx);
  const controller=createDraftController(readDraft());
  const adapter=createHostAdapter(ctx);
  const controls=createNativeControls(ctx,React);
  const pinnedModel=createPinnedSessionsModel(ctx);
  const sessionContext=createSessionContextController(ctx);
  const notificationModel=createNotificationModel(ctx);
  ctx.effect(()=>()=>notificationModel.dispose(),'chatgpt-rail:notifications');
  const searchModel=createGlobalSearchModel(ctx,{
   openHome:()=>ctx.layout.selectPanel('home'),
   openWorkspace:workspaceId=>{controller.update({workspaceId});ctx.layout.selectPanel('home');},
  });
  ctx.effect(()=>()=>searchModel.dispose(),'chatgpt-rail:global-search');
  ctx.effect(()=>()=>sessionContext.dispose(),'chatgpt-rail:session-context');
  adapter.listSessionReferences=()=>{
   const snapshot=ctx.sessions.list.getSnapshot();
   const archived=ctx.workspaces.list.getSnapshot().archivedSessionIds||[];
   return snapshot.ids.map(id=>snapshot.byId[id]).filter(s=>s&&!s.blank&&!archived.includes(s.id)).map(s=>{
    const label=s.title||s.projectionValues?.title||s.id.slice(0,16);
    return {sessionId:s.id,label,mention:sessionMention(s.id,label)};
   });
  };
  ctx.effect(()=>ctx.locale.register('chatgptRail',{zh:{'panel.home':'首页','sidebar.newChat':'新聊天','sidebar.pinned':'置顶','sidebar.unpin':'取消置顶聊天','nav.browse':'浏览更多插件','nav.create':'创建你的插件','nav.settings':'设置'},en:{'panel.home':'Home','sidebar.newChat':'New chat','sidebar.pinned':'Pinned','sidebar.unpin':'Unpin chat','nav.browse':'Browse other plugins','nav.create':'Create your plugin','nav.settings':'Settings'}}),'chatgpt-rail:locale');
  const dockPreferences=createDockPreferences();
  ctx.effect(()=>()=>dockPreferences.dispose(),'chatgpt-rail:dock-preferences');
  const navigationModel=createRailNavigationModel(ctx,{capacity:6,preferences:dockPreferences,nativePins:createNativePanelPinsSource(ctx.slots),getLabels:()=>{
   const t=ctx.locale.bind('chatgptRail');
   return {browsePlugins:t('nav.browse'),createPlugin:t('nav.create'),settings:t('nav.settings')};
  }});
  const appDockModel=createAppDockModel({navigationModel,slots:ctx.slots,layout:ctx.layout});
  ctx.effect(()=>()=>appDockModel.dispose(),'chatgpt-rail:app-dock');
  ctx.effect(()=>{
   const tag=document.createElement('style');tag.dataset.cgptRailStyle='2';tag.textContent=RAIL_CSS+'\n'+HOME_CSS+'\n'+SEARCH_CSS+'\n'+APP_DOCK_CSS+'\n'+NOTIFICATION_CSS;document.head.appendChild(tag);return()=>tag.remove();
  },'chatgpt-rail:styles');
  ctx.effect(()=>{
   let previous='';
   const persist=()=>{const s=controller.getSnapshot();const value=JSON.stringify({text:s.text,workspaceId:s.workspaceId,agentPreset:s.agentPreset,modelSelection:s.modelSelection,permissionPreset:s.permissionPreset,recoverySessionId:s.preparedSessionId,sendUncertain:s.sendUncertain||s.status==='sending'||s.status==='creating'});if(value!==previous){previous=value;try{localStorage.setItem(STORAGE,value);}catch{}}};
   const stop=controller.subscribe(persist);persist();return()=>{stop();controller.dispose();adapter.dispose();};
  },'chatgpt-rail:draft');
  const getRailLabels=()=>({
   newSession:ctx.locale.bind('sidebar')('session.new.label'),newChat:ctx.locale.bind('chatgptRail')('sidebar.newChat'),more:ctx.locale.bind('sidebar')('panels.more'),search:ctx.locale.bind('workspace')('search.sessions.aria'),toggleOpen:ctx.locale.bind('sidebar')('toggle.open'),toggleCollapse:ctx.locale.bind('sidebar')('toggle.collapse'),
   pinned:ctx.locale.bind('chatgptRail')('sidebar.pinned'),unpin:ctx.locale.bind('chatgptRail')('sidebar.unpin'),running:ctx.locale.bind('workspace')('status.running'),
   sessionActionsTemplate:ctx.locale.bind('workspace')('actions.session.aria',{name:'__cgpt_session_title__'}),
   panels:Object.fromEntries(ctx.slots.entriesOfSlot('sidebar.panellist').map(({options})=>[options.id,typeof options.label==='function'?options.label():options.label])),
  });
  ctx.slots.inject('sidebar.brand.name',()=>ctx.slots.register({name:'sidebar.brand.name',priority:-20},CompactBrand));
  ctx.slots.inject('shell.overlay',()=>ctx.slots.register({
   name:'shell.overlay',id:'chatgpt-rail.window-chrome',
   inject:()=>({ctx,Menu:NativeMenu,MenuItem:NativeMenuItem,Modal:NativeModal}),
  },GlobalWindowChrome));
  const getSearchLabel=()=>getRailLabels().search;
  ctx.slots.inject('shell.overlay',()=>ctx.slots.register({
   name:'shell.overlay',id:'chatgpt-rail.global-search',
   inject:()=>({ctx,model:searchModel,Modal:NativeModal,getSearchLabel}),
  },GlobalSearchShell));
  ctx.slots.inject('sidebar.panellist',()=>ctx.slots.inject(NATIVE_SESSION_MENU,()=>ctx.slots.inject(NATIVE_SESSION_ROW_ACTIONS,()=>{
   const nativeSpec=ctx.slots.spec(NATIVE_SESSION_MENU);
   const stopHome=ctx.slots.register({name:'sidebar.panellist',id:'home',order:-10,locale:'chatgptRail',label:()=>ctx.locale.bind('chatgptRail')('panel.home'),
    children:{[SESSION_CONTEXT_MENU]:{kind:'list',scope:'root',inject:nativeSpec.inject},[PINNED_SESSION_ROW_ACTIONS]:{kind:'list',scope:'root'}},
    inject:()=>({layout:ctx.layout,slots:ctx.slots,getRailLabels,pinnedModel,sessionContext,navigationModel,appDockModel,notificationModel}),
   },HomeIcon);
   let stopMenu,stopPinnedActions;
   try{stopMenu=mirrorNativeSessionMenu(ctx.slots);stopPinnedActions=mirrorNativePinnedActions(ctx.slots);}catch(error){stopPinnedActions?.();stopMenu?.();stopHome();throw error;}
   return()=>{stopPinnedActions();stopMenu();stopHome();};
  })));
  ctx.slots.inject('sidebar.panellist.actions',()=>ctx.slots.register({
   name:'sidebar.panellist.actions',id:'entry-customization',priority:-20,
   inject:()=>({navigationModel,MenuItem:NativeMenuItem}),
  },RailOverflowContent));
  ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'home',locale:'chatgptRail',inject:()=>({controller,adapter,...controls})},HomePage));
 }
};
