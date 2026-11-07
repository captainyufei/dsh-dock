export const NATIVE_SESSION_ROW_ACTIONS='sidebar.workspaces.session.row.action';
export const PINNED_SESSION_ROW_ACTIONS='chatgptRail.pinnedSession.row.action';

/** Reuse the Host's archive button and its confirmation/notification closures.
 * The plugin owns only the presentation slot; the Host owns all mutations. */
export function mirrorNativePinnedActions(slots){
 let stops=[];
 const clear=()=>{for(const stop of stops.splice(0).reverse())stop();};
 function sync(){
  clear();
  try{
   for(const entry of slots.entriesOfSlot(NATIVE_SESSION_ROW_ACTIONS)){
    if(entry.options.id!=='archive')continue;
    stops.push(slots.register({
     name:PINNED_SESSION_ROW_ACTIONS,id:entry.options.id,
     order:entry.options.order,priority:entry.options.priority,
     inject:entry.inject,locale:entry.locale,
     ...(entry.store===undefined?{}:{store:entry.store}),
    },entry.component));
   }
  }catch(error){clear();throw error;}
 }
 sync();
 const unsubscribe=slots.subscribe(NATIVE_SESSION_ROW_ACTIONS,sync);
 return()=>{unsubscribe();clear();};
}
