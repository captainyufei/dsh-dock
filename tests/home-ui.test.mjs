import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {HomePage} from '../src/home-ui.js';

function setup(){
 let state={text:'',files:[],workspaceId:'w1',agentPreset:'std',modelSelection:null,permissionPreset:'read-only',status:'idle',error:null};
 const listeners=new Set(); let creates=0,sends=0;
 const controller={getSnapshot:()=>state,subscribe:f=>(listeners.add(f),()=>listeners.delete(f)),update:p=>{state={...state,...p};listeners.forEach(f=>f());},setText(text){this.update({text});},addFiles(){},removeFile(){},async submit(){sends++;}};
 const adapter={loadModels:async()=>[{id:'p',name:'Provider',models:[{id:'m1',name:'Model one',reasoning:{defaultEffort:'high',efforts:[{id:'high',name:'High'}]}}]}],loadPermissions:async()=>[{value:'read-only',name:'Read Only'},{value:'danger-full-access',name:'Full access'}],loadPresets:async()=>[{id:'std',name:'标准模式',isDefault:true}],loadWorkspaces:async()=>[{workspaceId:'w1',title:'项目一',path:'/test/project'}],loadDefaults:async()=>({}),create:async()=>{creates++;},send:async()=>{}};
 return {controller,adapter,get creates(){return creates;},get sends(){return sends;}};
}
async function render(p){let tree;await act(async()=>{tree=Renderer.create(React.createElement(HomePage,p));await new Promise(r=>setImmediate(r));});return tree;}

test('home mount and editing do not create a Session',async()=>{
 const fixture=setup();const tree=await render(fixture);
 const input=tree.root.findByType('textarea');
 act(()=>input.props.onChange({target:{value:'本地草稿'}}));
 assert.equal(fixture.controller.getSnapshot().text,'本地草稿');assert.equal(fixture.creates,0);assert.equal(fixture.sends,0);
 tree.unmount();
});
test('IME Enter does not send; normal Enter requests one submission',async()=>{
 const fixture=setup();fixture.controller.setText('你好');const tree=await render(fixture);
 const input=tree.root.findByType('textarea');let prevented=0;
 act(()=>input.props.onKeyDown({key:'Enter',shiftKey:false,nativeEvent:{isComposing:true},preventDefault(){prevented++;}}));
 assert.equal(fixture.sends,0);assert.equal(prevented,0);
 await act(async()=>input.props.onKeyDown({key:'Enter',shiftKey:false,nativeEvent:{isComposing:false},preventDefault(){prevented++;}}));
 assert.equal(fixture.sends,1);assert.equal(prevented,1);tree.unmount();
});
test('busy submission locks draft input',async()=>{
 const fixture=setup();fixture.controller.update({status:'sending'});const tree=await render(fixture);
 assert.equal(tree.root.findByType('textarea').props.disabled,true);tree.unmount();
});

test('attachment and reference toolbar buttons have usable accessible names',async()=>{
 const fixture=setup();const tree=await render(fixture);
 assert.ok(tree.root.findByProps({'aria-label':'添加文件或调用指令'}));
 assert.ok(tree.root.findByProps({'aria-label':'引用文件或对话'}));tree.unmount();
});
test('catalog failure offers a visible retry without a Session',async()=>{
 const fixture=setup();fixture.adapter.loadModels=async()=>{throw new Error('offline');};const tree=await render(fixture);
 assert.ok(tree.root.findAllByType('button').find(b=>b.children.includes('重新读取选项')));
 assert.equal(fixture.creates,0);tree.unmount();
});

test('selecting an @ reference replaces the typed trigger rather than duplicating it',async()=>{
 const fixture=setup();fixture.controller.setText('读 @');
 fixture.adapter.listSessionReferences=()=>[{sessionId:'s1',label:'原会话',mention:'@[原会话](dsh-session:InMxIg)'}];
 let tree;await act(async()=>{tree=Renderer.create(React.createElement(HomePage,fixture),{createNodeMock:element=>element.type==='textarea'?{style:{},scrollHeight:66,selectionStart:3,selectionEnd:3,focus(){},setSelectionRange(){}}:null});await new Promise(r=>setImmediate(r));});
 act(()=>tree.root.findByProps({'aria-label':'引用文件或对话'}).props.onClick());
 const choice=tree.root.findAllByType('button').find(b=>b.props.role==='menuitem'&&b.findAllByType('span').some(s=>s.children.includes('原会话')));
 assert.ok(choice);act(()=>choice.props.onClick());
 assert.equal(fixture.controller.getSnapshot().text,'读 @[原会话](dsh-session:InMxIg) ');tree.unmount();
});
