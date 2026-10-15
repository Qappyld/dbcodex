import {readFile,writeFile,mkdir,cp,readdir,stat,lstat,realpath,access} from 'node:fs/promises';
import {resolve,relative,join,dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const req=createRequire(import.meta.url),asar=createRequire(req.resolve('@electron/packager'))('@electron/asar');
const root=await realpath(process.cwd()),primary=resolve(root,'release/DBCodex-win32-x64'),backup=resolve(root,'build/consolidation/2026-10-15');
const confined=p=>{const r=relative(root,resolve(p));if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Path outside workspace: '+p);return resolve(p);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
async function files(folder){const result=[];for(const e of await readdir(folder,{withFileTypes:true})){const p=join(folder,e.name);if(e.isSymbolicLink())throw Error('Refusing linked file: '+p);if(e.isDirectory())result.push(...await files(p));else if(e.isFile())result.push(p);}return result;}
if(process.argv[2]==='prepare'){
 if(await exists(join(backup,'plan.json')))throw Error('Consolidation already prepared.');
 await mkdir(backup,{recursive:true});
 const inventory=JSON.parse(await readFile('build/consolidation/inventory.json','utf8'));
 const copies=[];
 for(const item of inventory){const folder=confined(item.folder);if(await realpath(folder)!==folder)throw Error('Linked installation.');if((await stat(join(folder,'DBCodex.exe'))).size<1000000)throw Error('Not an installation.');
  const slug=relative(root,folder).replace(/[^a-zA-Z0-9-]/g,'_'),payload=await readFile(join(folder,'resources/app.asar'));
  await writeFile(join(backup,slug+'.asar'),payload);
  const data=join(folder,'data');if(await exists(data)){await files(data);await cp(data,join(backup,'data',slug),{recursive:true,errorOnExist:true,force:false});}
  const projects=(await files(folder)).filter(p=>/\.(dbcd|dbml)$/i.test(p));
  const migrations=[];
  if(folder!==primary){
   const userFiles=[...new Set([...(await exists(data)?await files(data):[]),...projects])].filter(p=>p!==join(data,'preferences.json')&&!p.endsWith('.lock'));
   for(const file of userFiles){const target=join(primary,'data','imported',slug,relative(folder,file));const staged=join(backup,'imported',slug,relative(folder,file));await mkdir(dirname(staged),{recursive:true});await cp(file,staged,{errorOnExist:true,force:false});migrations.push({source:file,target,staged,sha256:hash(await readFile(file))});}
  }
  let preferences=null;try{const p=JSON.parse(await readFile(join(data,'preferences.json'),'utf8'));if(p.version!==1||!['light','dark'].includes(p.theme)||!Array.isArray(p.recent)||!p.recent.every(x=>typeof x==='string'))throw Error();preferences=p;}catch{if(await exists(join(data,'preferences.json')))throw Error('Unreadable preferences preserved; resolve before consolidation: '+folder);}
  copies.push({folder,slug,version:item.version,sha256:hash(payload),preferences,migrations});
 }
 const recent=[],seen=new Set();const ordered=[...copies.filter(c=>c.folder===primary),...copies.filter(c=>c.folder!==primary)];
 for(const copy of ordered)for(const entry of copy.preferences?.recent??[]){let path=resolve(copy.folder,entry);for(const c of copies)for(const migration of c.migrations)if(migration.source.toLowerCase()===path.toLowerCase())path=migration.target;const key=path.toLowerCase();if(seen.has(key))continue;seen.add(key);const rel=relative(primary,path);recent.push(isAbsolute(rel)||rel.startsWith('..')?path:rel);}
 const merged={version:1,theme:ordered.find(c=>c.preferences)?.preferences.theme??'light',recent:recent.slice(0,30)};
 await writeFile(join(backup,'merged-preferences.json'),JSON.stringify(merged,null,2));await writeFile(join(backup,'plan.json'),JSON.stringify({primary,backup,copies,merged,allRecent:recent,prepared:true},null,2));
 console.log(JSON.stringify({copies:copies.length,recent:recent.length,projectsMigrated:copies.flatMap(c=>c.migrations).filter(m=>/\.(dbcd|dbml)$/i.test(m.source)).length,backup},null,2));
}else if(process.argv[2]==='finish'){
 const plan=JSON.parse(await readFile(join(backup,'plan.json'),'utf8'));if(plan.completed)throw Error('Consolidation already completed; refusing to overwrite newer preferences.');const archive=join(primary,'resources/app.asar');const pkg=JSON.parse(asar.extractFile(archive,'package.json'));if(pkg.version!=='0.1.2')throw Error('Wrong main version.');
 const renderer=asar.extractFile(archive,'dist/renderer.js').toString(),main=asar.extractFile(archive,'dist/main.js').toString();for(const feature of ['SchemaBuilder','ViewManager','automaticRoute'])if(!renderer.includes(feature))throw Error('Missing '+feature);if(!main.includes('PortableUpdater'))throw Error('Updater missing.');
 for(const copy of plan.copies){if(hash(await readFile(join(backup,copy.slug+'.asar')))!==copy.sha256)throw Error('Backup differs.');for(const migration of copy.migrations){const target=confined(migration.target);await mkdir(dirname(target),{recursive:true});if(await exists(target)){if(hash(await readFile(target))!==migration.sha256)throw Error('Migration conflict.');}else await cp(migration.staged,target,{errorOnExist:true,force:false});if(hash(await readFile(target))!==migration.sha256)throw Error('Migration differs.');}}
 const original=plan.copies.find(c=>c.folder===primary);if(original&&await exists(join(backup,'data',original.slug))){await cp(join(backup,'data',original.slug),join(primary,'data'),{recursive:true});}
 await mkdir(join(primary,'data'),{recursive:true});await writeFile(join(primary,'data/preferences.json'),JSON.stringify(plan.merged,null,2));
 plan.completed=true;plan.version=pkg.version;await writeFile(join(backup,'plan.json'),JSON.stringify(plan,null,2));
 await writeFile(join(backup,'summary.json'),JSON.stringify({version:pkg.version,primary,mergedCopies:plan.copies.length,mergedRecent:plan.allRecent.length,migratedFiles:plan.copies.flatMap(c=>c.migrations).length},null,2));console.log('Main installation and merged data verified.');
}else throw Error('Use prepare or finish.');
