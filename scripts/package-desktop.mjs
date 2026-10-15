import { packager } from '@electron/packager';
import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {resolve,join} from 'node:path';
const output=resolve(process.env.DBCODEX_RELEASE_OUT||'release');
const config=JSON.parse(await readFile('release-config.json','utf8'));
if (!/^\d+\.\d+\.\d+$/.test(config.version) || !config.publicKey) throw Error('Configuration de version ou de signature manquante.');
await mkdir('build/portable-app', {recursive:true});
await cp('packages/desktop/dist','build/portable-app/dist',{recursive:true});
await writeFile('build/portable-app/package.json',JSON.stringify({name:'dbcodex',version:config.version,type:'module',main:'dist/main.js'}));
const dataPath=join(output,'DBCodex-win32-x64/data');
const dataBackup=`build/portable-data-backup-${Date.now()}`;
const preserveData=existsSync(dataPath);
if(preserveData) await cp(dataPath,dataBackup,{recursive:true});
let result;
try { result=await packager({dir:'build/portable-app',out:output,name:'DBCodex',platform:'win32',arch:'x64',overwrite:true,asar:true,prune:false,appVersion:config.version});
} finally {
  if(preserveData) { await mkdir(dataPath,{recursive:true}); await cp(dataBackup,dataPath,{recursive:true}); }
}
console.log(result.join('\n'));
await cp('docs/PORTABLE-WINDOWS.md',join(output,'DBCodex-win32-x64/LIRE-MOI.md'));
await cp('docs/UPDATES.md',join(output,'DBCodex-win32-x64/UPDATES.md'));
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const folder=join(output,'DBCodex-win32-x64'),archive=join(output,`DBCodex-${config.version}-win-x64.zip`);
execFileSync('powershell.exe',['-NoProfile','-Command',`$portableItems = Get-ChildItem -LiteralPath ${quote(folder)} | Where-Object { $_.Name -ne 'data' }; Compress-Archive -LiteralPath $portableItems.FullName -DestinationPath ${quote(archive)} -Force`],{stdio:'inherit'});
console.log(archive);
