import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const hostRequire=name=>name==='@deepseek-ai/dsh-client-ui-primitives'?{Menu:()=>null,MenuItemButton:()=>null,Modal:()=>null}:require(name);

test('the built plugin registers valid list contributions without touching Session creation',()=>{
 let plugin;const sandbox={URL,TextEncoder,btoa,localStorage:{getItem:()=>null},window:{__ModuleLoader__:{load:definition=>{plugin=definition.factory(hostRequire);}}}};
 vm.runInNewContext(readFileSync(new URL('../dist/client.js',import.meta.url),'utf8'),sandbox);
 const registered=[];
 const source=value=>({getSnapshot:()=>value,subscribe:()=>()=>{}});
 const ctx={sessions:{list:source({byId:{},ids:[]}),create(){throw new Error('Must not create a Session during plugin startup');}},workspaces:{list:source({items:[],pinnedSessionIds:[],archivedSessionIds:[]})},conversation:{},uiWorkspace:{},remote:{},layout:{panelInfo:source({activePanelId:null})},locale:{bind:()=>key=>key},effect:()=>()=>{},slots:{
  inject:(_name,install)=>install(),
  spec:()=>({kind:'list',scope:'root',inject:{hooks:{}}}),
  entries:()=>[],entriesOfSlot:()=>[],subscribe:()=>()=>{},
  register(options,component){
   if(['sidebar.panellist','sidebar.session.row.leading','shell.overlay'].includes(options.name))assert.equal(typeof options.id,'string',options.name+' list contribution requires an id');
   registered.push({options,component});return()=>{};
  },
 }};
 assert.doesNotThrow(()=>plugin.apply(ctx));
 assert.ok(registered.find(x=>x.options.name==='main'&&x.options.key==='home'));
 assert.ok(registered.find(x=>x.options.name==='shell.overlay'&&x.options.id==='chatgpt-rail.window-chrome'));
 assert.ok(registered.find(x=>x.options.name==='sidebar.panellist').options.children['chatgptRail.session.contextMenu']);
 assert.deepEqual(Object.keys(registered.find(x=>x.options.name==='sidebar.panellist').options.children['chatgptRail.pinnedSession.row.action']).sort(),['kind','scope']);
 assert.equal(registered.find(x=>x.options.name==='sidebar.panellist').options.children['chatgptRail.pinnedSession.row.action'].kind,'list');
});
