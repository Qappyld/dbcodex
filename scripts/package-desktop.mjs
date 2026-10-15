import { packager } from '@electron/packager';
import { build, Platform, Arch } from 'electron-builder';
import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import {resolve,join} from 'node:path';
const output=resolve(process.env.DBCODEX_RELEASE_OUT||'release');
const config=JSON.parse(await readFile('release-config.json','utf8'));
if (!/^\d+\.\d+\.\d+$/.test(config.version) || !config.publicKey) throw Error('Configuration de version ou de signature manquante.');
await mkdir('build/portable-app', {recursive:true});
await cp('packages/desktop/dist','build/portable-app/dist',{recursive:true});
await writeFile('build/portable-app/package.json',JSON.stringify({name:'dbcodex',version:config.version,type:'module',main:'dist/main.js'}));
// Build from a clean staging directory, never from a user's running portable/data.
const staging=resolve('build/portable-package');
const result=await packager({dir:'build/portable-app',out:staging,name:'DBCodex',icon:resolve('assets/dbcodex.ico'),platform:'win32',arch:'x64',overwrite:true,asar:true,prune:false,appVersion:config.version});
console.log(result.join('\n'));
await mkdir(output,{recursive:true});
await cp('docs/PORTABLE-WINDOWS.md',join(staging,'DBCodex-win32-x64/LIRE-MOI.md'));
await cp('docs/UPDATES.md',join(staging,'DBCodex-win32-x64/UPDATES.md'));
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const folder=join(staging,'DBCodex-win32-x64'),archive=join(output,`DBCodex-${config.version}-win-x64.zip`);
// Keep the ZIP update channel for applications distributed before the single EXE.
execFileSync('powershell.exe',['-NoProfile','-Command',`$portableItems = Get-ChildItem -LiteralPath ${quote(folder)} | Where-Object { $_.Name -ne 'data' }; Compress-Archive -LiteralPath $portableItems.FullName -DestinationPath ${quote(archive)} -Force`],{stdio:'inherit'});
await build({
  targets: Platform.WINDOWS.createTarget('portable', Arch.x64),
  // electron-builder adds its launcher helper; isolate that from the legacy inventory.
  prepackaged: await (async () => {
    const portableBundle=resolve('build/single-exe-bundle');
    await cp(folder,portableBundle,{recursive:true});
    return portableBundle;
  })(),
  config: {
    appId:'fr.appyld.dbcodex', productName:'DBCodex',
    directories:{app:resolve('build/portable-app'),output},
    electronVersion:JSON.parse(await readFile('package.json','utf8')).devDependencies.electron,
    win:{icon:resolve('assets/dbcodex.ico'),signAndEditExecutable:false},
    portable:{artifactName:`DBCodex-${config.version}-win-x64.exe`,requestExecutionLevel:'user',unpackDirName:false,useZip:true},
    publish:null,
  },
});
console.log(join(output,`DBCodex-${config.version}-win-x64.exe`));
