import {readNativeAppIcons} from './app-icons.js';

/** Keep Host contributions mounted; own only a sibling presentation seat. */
export function mountAppDockSeat(anchor,model){
 const nav=anchor?.closest?.('nav');if(!nav)return null;
 const document=nav.ownerDocument,view=document.defaultView;
 const seat=document.createElement('span');seat.className='cgpt-app-dock-seat';seat.setAttribute('data-cgpt-app-dock','');
 const previousMode=nav.getAttribute('data-cgpt-app-mode'),previousMore=nav.getAttribute('data-cgpt-app-native-more');
 const previousExtra=nav.style.getPropertyValue('--cgpt-app-extra-height');
 let disposed=false,queued=false;
 const reflect=()=>{
  const value=model.getSnapshot();
  nav.setAttribute('data-cgpt-app-native-more',String(value.canShowNativeMore));
  nav.style.setProperty('--cgpt-app-extra-height',(value.reservedEntryCount||0)*44+'px');
 };
 const read=()=>{if(disposed)return;queued=false;model.setIcons(readNativeAppIcons(nav));};
 const queue=()=>{if(disposed||queued)return;queued=true;queueMicrotask(read);};
 nav.appendChild(seat);nav.setAttribute('data-cgpt-app-mode','');
 let stop,observer;
 const dispose=()=>{
  if(disposed)return;disposed=true;stop?.();observer?.disconnect();seat.remove();
  if(previousMode===null)nav.removeAttribute('data-cgpt-app-mode');else nav.setAttribute('data-cgpt-app-mode',previousMode);
  if(previousMore===null)nav.removeAttribute('data-cgpt-app-native-more');else nav.setAttribute('data-cgpt-app-native-more',previousMore);
  if(previousExtra)nav.style.setProperty('--cgpt-app-extra-height',previousExtra);else nav.style.removeProperty('--cgpt-app-extra-height');
 };
 try{
  stop=model.subscribe(reflect);reflect();read();
  if(view?.MutationObserver){
   observer=new view.MutationObserver(records=>{
    if(records.some(record=>!record.target?.closest?.('[data-cgpt-app-dock]')))queue();
   });
   observer.observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['src','d','viewBox','fill','stroke','data-cgpt-nav-button']});
  }
 }catch(error){dispose();throw error;}
 return {node:seat,dispose};
}
