/** Use the desktop Host's native drag-region observer, never mouse forwarding. */
export function mountWindowDragStrip(frame){
 const document=frame?.ownerDocument;
 if(document?.documentElement?.dataset?.platform!=='darwin')return null;
 const node=document.createElement('div');
 node.className='cgpt-window-drag-strip';
 node.setAttribute('data-window-drag','');
 node.setAttribute('aria-hidden','true');
 // Native draggable regions are collected in document order. Register the
 // background first so later Host buttons/menus keep their no-drag regions.
 frame.prepend(node);
 return {node,dispose:()=>node.remove()};
}
