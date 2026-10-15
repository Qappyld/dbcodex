import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {build}=createRequire(new URL('../packages/ui/package.json',import.meta.url))('esbuild');
await mkdir('build/release-0.1.5',{recursive:true});
await build({entryPoints:['packages/desktop/src/updater.ts'],bundle:true,platform:'node',format:'esm',outfile:'build/release-0.1.5/updater.mjs'});
const {PortableUpdater}=await import('../build/release-0.1.5/updater.mjs');
const config=JSON.parse(await readFile('release-config.json','utf8'));
const results=[];
for(const edition of ['zip','exe']){
 const updater=new PortableUpdater({...config,version:'0.1.4'},resolve('build/release-0.1.5'),'unused',true,edition==='exe'?resolve('build/release-0.1.5/DBCodex.exe'):undefined);
 const status=await updater.check();assert.equal(status.phase,'available',status.message);assert.equal(status.version,'0.1.5');results.push({edition,...status});
}
await writeFile('build/release-0.1.5/public-update-check.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
