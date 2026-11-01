import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';

// Validate the actual npm tarball, not just the development directory. This
// catches missing server imports, stale client IDs, and accidentally shipped
// development/private files before a package reaches another installation.
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
const temporary=await mkdtemp(join(tmpdir(),'dsh-dock-package-'));
const npm=process.platform==='win32'?'npm.cmd':'npm';

try{
 assert.notEqual(packageJson.private,true,'A public bundle must not be marked private');
 assert.equal(lock.name,packageJson.name,'Lockfile name must match the package');
 assert.equal(lock.version,packageJson.version,'Lockfile version must match the package');
 assert.equal(lock.packages[''].name,packageJson.name,'Root lock entry must match the package');
 assert.equal(lock.packages[''].version,packageJson.version,'Root lock version must match the package');
 assert.equal(packageJson.dsh.bundle.patch,'./cordis.patch.yml');
 assert.ok(packageJson.engines?.dsh,'Declare the tested DSH version');
 assert.ok(packageJson.repository?.url,'Declare the source repository');
 // npm treats these names as Git dependency build/install hooks. Ship the
 // committed client bundle instead of requiring tools inside another host.
 for(const hook of ['build','prepare','prepack','preinstall','install','postinstall']){
  assert.ok(!Object.hasOwn(packageJson.scripts??{},hook),`Unexpected install-time build hook: ${hook}`);
 }
 if(process.env.GITHUB_REF_TYPE==='tag'){
  assert.equal(process.env.GITHUB_REF_NAME,`v${packageJson.version}`,'Release tag must match package.json');
 }

 const [packed]=JSON.parse(execFileSync(npm,['pack','--json','--ignore-scripts','--pack-destination',temporary],{cwd:root,encoding:'utf8'}));
 assert.equal(packed.name,packageJson.name);
 assert.equal(packed.version,packageJson.version);
 const paths=new Set(packed.files.map(file=>file.path));
 const runtime=['package.json','index.js','video-route.js','client.js','cordis.patch.yml','locale/en.json','locale/zh.json','icon.svg'];
 const documents=['README.md','README.en.md','README.zh-CN.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md'];
 const allowed=new Set([...runtime,...documents,'LICENSE']);
 for(const file of [...runtime,...documents])assert.ok(paths.has(file),`Tarball is missing ${file}`);
 for(const file of paths)assert.ok(allowed.has(file),`Unexpected public package file: ${file}`);
 if(packageJson.license&&packageJson.license!=='UNLICENSED')assert.ok(paths.has('LICENSE'),'A licensed package must ship its LICENSE');

 execFileSync('tar',['-xzf',join(temporary,packed.filename),'-C',temporary]);
 const unpacked=join(temporary,'package');
 const actual=JSON.parse(await readFile(join(unpacked,'package.json'),'utf8'));
 assert.deepEqual(actual,packageJson,'Packed metadata differs from the release source');
 for(const [key,value] of Object.entries(actual.exports)){
  if(typeof value==='string'&&!value.includes('*')){
   await readFile(join(unpacked,value));
   assert.ok(value.startsWith('./')&&!value.includes('..'),`Unsafe export target: ${key}`);
  }
 }
 const patch=await readFile(join(unpacked,'cordis.patch.yml'),'utf8');
 const packageName=/^\s+name:\s*['"]?([^\s'"]+)['"]?\s*$/m.exec(patch)?.[1];
 assert.equal(packageName,actual.name,'Bundle patch must activate the released package');
 let clientDefinition;
 const client=await readFile(join(unpacked,'client.js'),'utf8');
 vm.runInNewContext(client,{window:{__ModuleLoader__:{load:definition=>{clientDefinition=definition;}}}},{timeout:5000});
 assert.equal(clientDefinition?.id,actual.name,'Client ModuleLoader ID must match the released package');
 assert.equal(typeof clientDefinition.factory,'function','Client bundle must expose its module factory');
 const externals=[...new Set([...client.matchAll(/\brequire\(["']([^"']+)["']\)/g)].map(match=>match[1]))];
 for(const dependency of externals){
  assert.ok(actual.peerDependencies?.[dependency]||actual.dependencies?.[dependency],`Undeclared external module: ${dependency}`);
 }
 const server=await import(pathToFileURL(join(unpacked,'index.js')).href);
 assert.equal(typeof server.apply,'function','Packed server entry must load');
 assert.deepEqual(server.inject,['connection','fs'],'Media must use the host connection and filesystem');
 for(const locale of ['en','zh']){
  const translated=JSON.parse(await readFile(join(unpacked,'locale',`${locale}.json`),'utf8'));
  assert.equal(translated.meta.title,'DeepSeek Dock',`Unexpected ${locale} display name`);
 }
 console.log(JSON.stringify({ok:true,name:packed.name,version:packed.version,files:paths.size,bytes:packed.size,integrity:packed.integrity,externalModules:externals,packedServerLoaded:true,clientId:clientDefinition.id},null,2));
}finally{
 await rm(temporary,{recursive:true,force:true});
}
