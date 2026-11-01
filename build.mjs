import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const {name}=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8'));
const result=await build({entryPoints:['client-entry.js'],bundle:true,format:'cjs',platform:'browser',external:['react','react-dom','@deepseek-ai/dsh-client-ui-primitives'],loader:{'.css':'text'},write:false,minify:false,legalComments:'inline',target:'es2022'});
const output='window.__ModuleLoader__.load({id:'+JSON.stringify(name)+',factory(require){var module={exports:{}};var exports=module.exports;\n'+result.outputFiles[0].text+'\nreturn module.exports.default;}});\n';
await writeFile('client.js',output);
console.log('Built client.js ('+Buffer.byteLength(output)+' bytes)');
