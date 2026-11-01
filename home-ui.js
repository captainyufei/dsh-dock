import React from 'react';
const h=React.createElement;
const BUSY=new Set(['creating','configuring','sending','opening']);
const EMPTY={workspaces:[],models:[],permissions:[],presets:[]};
const msg=e=>e instanceof Error?e.message:String(e);
const asArray=(x,key)=>Array.isArray(x)?x:(x?.[key]||[]);
const permissionNames={'read-only':'仅可查看','workspace-write':'工作区内修改','danger-full-access':'完全权限',auto:'自动审查'};
const presetNames={default:'标准模式',standard:'标准模式',std:'标准模式',cordis:'创造模式',ptc:'PTC 模式',minimal:'极简模式'};
const COMMANDS=[['/goal ','目标','设置要持续推进的目标'],['/plan ','计划','先讨论和规划任务'],['/model','模型','打开首页模型选择'],['/permission','权限','打开首页权限选择']];

export function Glyph({name,size=18}){
 const paths={folder:'M2 5h6l2 2h8v10H2z',chevron:'m6 8 4 4 4-4',plus:'M10 3v14M3 10h14',send:'M10 16V4m-5 5 5-5 5 5',shield:'m10 2 7 3v5c0 4-7 8-7 8S3 14 3 10V5z',close:'m5 5 10 10M15 5 5 15',at:'M14 10v3c0 3 4 2 4-3a8 8 0 1 0-3 6M14 10a4 4 0 1 0-8 0 4 4 0 0 0 8 0',file:'M5 2h7l4 4v12H5zM12 2v5h4',check:'m4 10 4 4 8-9',home:'m3 9 7-6 7 6M5 8v9h10V8M8 17v-4h4v4',mic:'M7 4a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM4 9v1a6 6 0 0 0 12 0V9M10 16v3'};
 return h('svg',{width:size,height:size,viewBox:'0 0 20 20',fill:'none','aria-hidden':true,style:{flex:'none'}},h('path',{d:paths[name]||paths.file,stroke:'currentColor',strokeWidth:1.5,strokeLinecap:'round',strokeLinejoin:'round'}));
}
function Menu({id,label,icon,children,open,setOpen,disabled=false,align='left',above=false,wide=false}){
 const root=React.useRef(null),trigger=React.useRef(null);
 const accessibleLabel=label||({plus:'添加文件或调用指令',reference:'引用文件或对话'}[id])||id;
 React.useEffect(()=>{
  if(!open)return;
  const close=e=>{if(!root.current?.contains(e.target))setOpen(null);};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();setOpen(null);trigger.current?.focus();}};
  globalThis.document?.addEventListener('pointerdown',close);
  globalThis.document?.addEventListener('keydown',key);
  return()=>{globalThis.document?.removeEventListener('pointerdown',close);globalThis.document?.removeEventListener('keydown',key);};
 },[open,setOpen]);
 return h('span',{className:'cgpt-menu-anchor',ref:root},
  h('button',{ref:trigger,type:'button',className:'cgpt-control','aria-label':accessibleLabel,'aria-haspopup':'menu','aria-expanded':!!open,disabled,onClick:()=>setOpen(open?null:id)},icon&&h(Glyph,{name:icon}),h('span',{className:'cgpt-control-label'},label),h(Glyph,{name:'chevron',size:13})),
  open?h('div',{className:'cgpt-menu'+(wide?' cgpt-menu-wide':''),'data-align':align,'data-above':above||undefined,role:'menu','aria-label':typeof label==='string'?label:id,onKeyDown:e=>{
   if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
   const items=Array.from(e.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled)'));
   if(!items.length)return;e.preventDefault();const n=items.indexOf(globalThis.document.activeElement);
   items[e.key==='Home'?0:e.key==='End'?items.length-1:e.key==='ArrowDown'?(n+1)%items.length:(n+items.length-1)%items.length]?.focus();
  }},children):null);
}
function Item({selected,onClick,children,detail,disabled=false}){
 return h('button',{type:'button',role:selected===undefined?'menuitem':'menuitemradio','aria-checked':selected,disabled,className:'cgpt-menu-item',onClick},h('span',{className:'cgpt-menu-item-body'},children,detail&&h('small',null,detail)),selected&&h(Glyph,{name:'check',size:15}));
}

export function HomePage({controller,adapter,VoiceControl,BrandMark}){
 const state=React.useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
 const [resetConfirm,setResetConfirm]=React.useState(false);
 const [catalogs,setCatalogs]=React.useState(EMPTY),[errors,setErrors]=React.useState({}),[loading,setLoading]=React.useState(true),[menu,setMenu]=React.useState(null),[query,setQuery]=React.useState(''),[notice,setNotice]=React.useState(''),[voiceActive,setVoiceActive]=React.useState(false),[permissionConfirm,setPermissionConfirm]=React.useState(null),[ack,setAck]=React.useState(false),[referenceOpen,setReferenceOpen]=React.useState(false),[referencePath,setReferencePath]=React.useState('');
 const textareaRef=React.useRef(null),fileRef=React.useRef(null),fileReference=React.useRef(false),mounted=React.useRef(false),composing=React.useRef(false);
 const stateRef=React.useRef(state);stateRef.current=state;
 const busy=BUSY.has(state.status);
 const report=React.useCallback(e=>setNotice(msg(e)),[]);
 const update=patch=>{try{controller.update(patch);setNotice('');return true;}catch(e){report(e);return false;}};
 const refresh=React.useCallback(async()=>{
  setLoading(true);
  const keys=['workspaces','models','permissions','presets'];
  const methods=['loadWorkspaces','loadModels','loadPermissions','loadPresets'];
  const results=await Promise.allSettled(methods.map(method=>Promise.resolve().then(()=>adapter[method]())));
  if(!mounted.current)return;
  const next={},failures={};results.forEach((r,i)=>{if(r.status==='fulfilled')next[keys[i]]=asArray(r.value,{models:'groups',permissions:'options',presets:'presets',workspaces:'items'}[keys[i]]);else failures[keys[i]]=msg(r.reason);});
  setCatalogs(previous=>({...previous,...next}));setErrors(failures);setLoading(false);
  try{
   const defaults=await adapter.loadDefaults?.()||{};if(!mounted.current)return;
   const current=controller.getSnapshot(),patch={};
   for(const key of ['agentPreset','modelSelection','permissionPreset'])if(current[key]==null&&defaults[key]!=null)patch[key]=defaults[key];
   if(current.workspaceId==null)patch.workspaceId=defaults.workspaceId||next.workspaces?.[0]?.workspaceId;
   if(Object.keys(patch).length&&!BUSY.has(current.status))controller.update(patch);
  }catch(e){if(mounted.current)setNotice(msg(e));}
 },[adapter,controller]);
 React.useEffect(()=>{mounted.current=true;refresh();return()=>{mounted.current=false;};},[refresh]);
 React.useLayoutEffect(()=>{const node=textareaRef.current;if(node){node.style.height='auto';node.style.height=Math.min(220,Math.max(66,node.scrollHeight))+'px';}},[state.text]);
 React.useEffect(()=>{if(!busy&&!voiceActive)textareaRef.current?.focus();},[]);
 const submit=async()=>{if(busy||voiceActive||stateRef.current.sendUncertain)return;setMenu(null);setNotice('');try{const result=await controller.submit(adapter);if(result?.openError&&mounted.current)setNotice('消息已接受，但打开会话失败：'+msg(result.openError));}catch(e){if(mounted.current)report(e);}};
 const insert=text=>{
  const node=textareaRef.current,snapshot=controller.getSnapshot();
  let start=node?.selectionStart??snapshot.text.length;const end=node?.selectionEnd??start;
  // Replace the active @ trigger/query, rather than leaving an extra @ before
  // the canonical file/session mention chosen from the menu.
  const trigger=snapshot.text.slice(0,start).match(/(?:^|\s)(@[^\s@]*)$/u);
  if(trigger)start-=trigger[1].length;
  try{controller.setText(snapshot.text.slice(0,start)+text+snapshot.text.slice(end));setMenu(null);setTimeout(()=>{node?.focus();node?.setSelectionRange(start+text.length,start+text.length);},0);}catch(e){report(e);}
 };
 const workspaces=catalogs.workspaces,presets=catalogs.presets,permissions=catalogs.permissions;
 const workspace=workspaces.find(w=>w.workspaceId===state.workspaceId);
 const preset=presets.find(p=>p.id===state.agentPreset);
 const modelGroup=catalogs.models.find(g=>g.id===state.modelSelection?.provider);
 const model=modelGroup?.models.find(m=>m.id===state.modelSelection?.model);
 const effort=model?.reasoning?.efforts?.find(e=>e.id===(state.modelSelection?.reasoningEffort??model.reasoning.defaultEffort));
 const modelLabel=model?.name||'模型 · 沿用默认';
 const workspaceLabel=workspace?.title||workspace?.name||workspace?.path?.split('/').filter(Boolean).pop()||'选择工作区';
 const presetLabel=preset?.displayName||preset?.name||presetNames[state.agentPreset]||state.agentPreset||'模式 · 沿用默认';
 const permissionLabel=permissionNames[state.permissionPreset]||permissions.find(p=>p.value===state.permissionPreset)?.name||'权限 · 沿用默认';
 const choosePermission=value=>{if(value==='danger-full-access'||value==='auto'){setPermissionConfirm(value);setAck(false);setMenu(null);}else{update({permissionPreset:value});setMenu(null);}};
 const commandRows=()=>COMMANDS.map(([command,label,detail])=>h(Item,{key:command,detail,onClick:()=>{if(command==='/model'||command==='/permission'){if(controller.getSnapshot().text==='/')update({text:''});setMenu(command==='/model'?'model':'permission');return;}const current=controller.getSnapshot().text;update({text:command+current.replace(/^\s*\/(?:\S*\s*)?/u,'')});setMenu(null);textareaRef.current?.focus();}},label));
 const addFiles=files=>{try{controller.addFiles(Array.from(files||[]));setNotice('');}catch(e){report(e);}};
 const statusText={creating:'正在创建会话…',configuring:'正在应用设置和准备附件…',sending:'正在发送…',opening:'正在打开会话…'}[state.status];
 const error=state.error||notice||(Object.keys(errors).length?'部分选项读取失败，请重新读取。':'');
 return h('section',{className:'cgpt-home','data-cgpt-home':'','aria-label':'首页草稿'},
  h('div',{className:'cgpt-home-stack'},
   h('div',{className:'cgpt-home-headline'},BrandMark?h(BrandMark,{size:34}):null,h('span',null,'探索未至之境'),h('span',{className:'cgpt-preview'},'预览版')),
   h('div',{className:'cgpt-home-selectors'},
    h(Menu,{id:'workspace',label:workspaceLabel,icon:'folder',open:menu==='workspace',setOpen:setMenu,disabled:busy},
     errors.workspaces?h('div',{className:'cgpt-menu-error'},errors.workspaces):null,
     workspaces.map(w=>h(Item,{key:w.workspaceId,selected:w.workspaceId===state.workspaceId,detail:w.path,onClick:()=>{update({workspaceId:w.workspaceId});setMenu(null);}},w.title||w.name||w.path)),
     !workspaces.length?h('div',{className:'cgpt-menu-empty'},loading?'正在读取工作区…':'请先在左侧添加工作区'):null),
    h(Menu,{id:'preset',label:presetLabel,open:menu==='preset',setOpen:setMenu,disabled:busy},
     errors.presets?h('div',{className:'cgpt-menu-error'},errors.presets):null,
     presets.map(p=>h(Item,{key:p.id,selected:p.id===state.agentPreset,detail:p.description,onClick:()=>{update({agentPreset:p.id});setMenu(null);}},p.displayName||p.name||presetNames[p.id]||p.id)))),
   h('div',{className:'cgpt-home-card','data-cgpt-home-card':'',onDragOver:e=>{if(!busy&&e.dataTransfer?.types?.includes('Files'))e.preventDefault();},onDrop:e=>{if(!busy&&e.dataTransfer?.files?.length){e.preventDefault();addFiles(e.dataTransfer.files);}}},
    state.files.length?h('div',{className:'cgpt-file-list'},state.files.map(entry=>h('div',{className:'cgpt-file',key:entry.id},entry.previewUrl&&entry.file?.type?.startsWith('image/')?h('img',{src:entry.previewUrl,alt:''}):h(Glyph,{name:'file',size:22}),h('span',null,entry.file?.name||'文件',h('small',null,Math.ceil((entry.file?.size||0)/1024)+' KB')),h('button',{type:'button','aria-label':'移除 '+(entry.file?.name||'文件'),disabled:busy,onClick:()=>controller.removeFile(entry.id)},h(Glyph,{name:'close',size:13}))))):null,
    h('textarea',{ref:textareaRef,className:'cgpt-home-input','aria-label':'首页消息',placeholder:'描述你想要构建的内容，/ 调用指令，@ 引用文件或对话',value:state.text,disabled:busy,rows:2,onCompositionStart:()=>{composing.current=true;},onCompositionEnd:()=>{composing.current=false;},onChange:e=>{try{controller.setText(e.target.value);}catch(error){report(error);}},onPaste:e=>{const files=Array.from(e.clipboardData?.files||[]);if(files.length){e.preventDefault();addFiles(files);}},onKeyDown:e=>{
     if(e.key==='Enter'&&!e.shiftKey&&!composing.current&&!e.nativeEvent?.isComposing&&e.keyCode!==229){e.preventDefault();submit();}
     else if(e.key==='/'&&!state.text)setMenu('plus');
     else if(e.key==='@')setMenu('reference');
     else if(e.key==='Escape')setMenu(null);
    }}),
    h('div',{className:'cgpt-home-toolbar'},
     h('div',{className:'cgpt-toolbar-left'},
      h(Menu,{id:'plus',label:'',icon:'plus',open:menu==='plus',setOpen:setMenu,disabled:busy,above:true},
       h(Item,{onClick:()=>{fileReference.current=false;fileRef.current?.click();setMenu(null);}},'添加文件'),h('div',{className:'cgpt-menu-divider'}),commandRows()),
      h(Menu,{id:'permission',label:permissionLabel,icon:'shield',open:menu==='permission',setOpen:setMenu,disabled:busy,above:true},
       errors.permissions?h('div',{className:'cgpt-menu-error'},errors.permissions):null,
       permissions.map(p=>h(Item,{key:p.value,selected:p.value===state.permissionPreset,detail:p.description,onClick:()=>choosePermission(p.value)},permissionNames[p.value]||p.name||p.value))),
      h(Menu,{id:'reference',label:'',icon:'at',open:menu==='reference',setOpen:setMenu,disabled:busy,above:true},
       h(Item,{onClick:()=>{fileReference.current=true;fileRef.current?.click();setMenu(null);}},'引用本地文件…'),
       h(Item,{onClick:()=>{setReferenceOpen(true);setReferencePath('');setMenu(null);}},'输入文件或目录路径…'),
       adapter.listSessionReferences?.().length?h('div',{className:'cgpt-menu-section'},'会话'):null,
       (adapter.listSessionReferences?.()||[]).slice(0,15).map(s=>h(Item,{key:s.sessionId,onClick:()=>insert(s.mention+' ')},s.label)))),
     h('div',{className:'cgpt-toolbar-right'},
      h(Menu,{id:'model',label:modelLabel+(effort?' · '+effort.name:''),open:menu==='model',setOpen:setMenu,disabled:busy,above:true,align:'right',wide:true},
       h('input',{className:'cgpt-model-search','aria-label':'搜索模型',placeholder:'搜索模型…',value:query,onChange:e=>setQuery(e.target.value)}),
       errors.models?h('div',{className:'cgpt-menu-error'},errors.models):null,
       catalogs.models.map(g=>h(React.Fragment,{key:g.id},h('div',{className:'cgpt-menu-section'},g.name||g.id),(g.models||[]).filter(m=>m.name.toLowerCase().includes(query.toLowerCase())).map(m=>h(Item,{key:m.id,selected:state.modelSelection?.provider===g.id&&state.modelSelection?.model===m.id,onClick:()=>{update({modelSelection:{provider:g.id,model:m.id,...m.reasoning?.defaultEffort?{reasoningEffort:m.reasoning.defaultEffort}:{}}});setMenu(null);}},m.name)))),
       model?.reasoning?.efforts?.length?h(React.Fragment,null,h('div',{className:'cgpt-menu-divider'}),h('div',{className:'cgpt-menu-section'},'推理等级'),model.reasoning.efforts.map(e=>h(Item,{key:e.id,selected:(state.modelSelection?.reasoningEffort??model.reasoning.defaultEffort)===e.id,onClick:()=>{update({modelSelection:{...state.modelSelection,reasoningEffort:e.id}});setMenu(null);}},e.name))):null),
      VoiceControl?h(VoiceControl,{controller,textareaRef,locked:busy,onActiveChange:setVoiceActive,onError:report}):null,
      h('button',{type:'button',className:'cgpt-send','aria-label':state.status==='error'?'重试发送':'发送消息',title:statusText||'发送消息',disabled:busy||voiceActive||state.sendUncertain||(!state.text.trim()&&!state.files.length)||!state.workspaceId,onClick:submit},h(Glyph,{name:'send',size:21})))),
    h('input',{ref:fileRef,type:'file',multiple:true,hidden:true,'aria-label':'选择附件',onChange:e=>{addFiles(e.target.files);if(fileReference.current&&e.target.files?.length)insert('');fileReference.current=false;e.target.value='';}})),
   (error||statusText)?h('div',{className:'cgpt-home-notice','data-error':!!error,role:error?'alert':'status'},error||statusText,
    Object.keys(errors).length?h('button',{type:'button',onClick:refresh},'重新读取选项'):null,
    state.preparedSessionId?h('button',{type:'button',onClick:()=>Promise.resolve().then(()=>adapter.open({sessionId:state.preparedSessionId})).catch(report)},state.sendUncertain?'打开会话核对':'打开已准备的会话'):null,
    state.preparedSessionId||state.sendUncertain?h('button',{type:'button',disabled:busy,onClick:()=>setResetConfirm(true)},'核对后重新开始'):null):null),
  resetConfirm?h('div',{className:'cgpt-modal-backdrop'},h('div',{className:'cgpt-modal',role:'dialog','aria-modal':true,'aria-label':'重新开始草稿'},h('h3',null,'已核对会话了吗？'),h('p',null,'请先检查会话列表，确认上一次消息没有发出。继续后可重新选择工作区和模式；已经创建的会话会保留。'),h('div',{className:'cgpt-modal-actions'},h('button',{type:'button',onClick:()=>setResetConfirm(false)},'返回核对'),h('button',{type:'button',onClick:()=>{const old=controller.resetPreparedSession();if(old)adapter.release?.(old);adapter.resetCreateUncertainty?.();setNotice('');setResetConfirm(false);}},'已核对，重新开始')))):null,
  permissionConfirm?h('div',{className:'cgpt-modal-backdrop'},h('div',{className:'cgpt-modal',role:'dialog','aria-modal':true,'aria-label':'确认权限选择'},h('h3',null,permissionConfirm==='auto'?'启用自动审查？':'使用完全权限？'),h('p',null,permissionConfirm==='auto'?'自动审查是实验功能，由模型判断工具调用是否授权。':'完全权限允许会话访问工作区以外的文件并执行命令。此选择只用于你将发送的新会话。'),h('label',{className:'cgpt-ack'},h('input',{type:'checkbox',checked:ack,onChange:e=>setAck(e.target.checked)}),'我理解并接受此权限范围'),h('div',{className:'cgpt-modal-actions'},h('button',{type:'button',onClick:()=>setPermissionConfirm(null)},'取消'),h('button',{type:'button',disabled:!ack,onClick:()=>{update({permissionPreset:permissionConfirm});setPermissionConfirm(null);}},'确认选择')))):null,
  referenceOpen?h('div',{className:'cgpt-modal-backdrop'},h('form',{className:'cgpt-modal',role:'dialog','aria-modal':true,'aria-label':'引用文件或目录',onSubmit:e=>{e.preventDefault();const path=referencePath.trim();if(!path||/["\r\n]/u.test(path)){setNotice('请输入不含双引号或换行的文件路径');return;}insert('@"'+path+'" ');setReferenceOpen(false);}},h('h3',null,'引用文件或目录'),h('input',{autoFocus:true,'aria-label':'文件或目录路径',placeholder:'/路径/文件 或 工作区内相对路径',value:referencePath,onChange:e=>setReferencePath(e.target.value)}),h('div',{className:'cgpt-modal-actions'},h('button',{type:'button',onClick:()=>setReferenceOpen(false)},'取消'),h('button',{type:'submit',disabled:!referencePath.trim()},'插入引用')))):null);
}
