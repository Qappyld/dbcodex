import {_electron as electron} from 'file:///C:/Users/quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {cp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const label=process.env.DBCODEX_PERF_LABEL??'current',root=resolve('build/performance');
await mkdir(root,{recursive:true});const project=resolve(root,`compliance-${label}-${Date.now()}.dbcd`);await cp('fixtures/Compliance Solution.dbcd',project);
const executable=process.env.DBCODEX_PERF_EXECUTABLE||undefined;
const preferencesPath=executable?resolve(dirname(executable),'data/preferences.json'):resolve('data/preferences.json');let prefs;try{prefs=await readFile(preferencesPath);}catch{}
const launched=performance.now();
const app=await electron.launch({executablePath:resolve(executable??'node_modules/electron/dist/electron.exe'),args:executable?[project]:[resolve('packages/desktop/dist/main.js'),project],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'))});
try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('.react-flow__node-table').nth(18).waitFor();
 await page.waitForTimeout(300);const openMs=performance.now()-launched;
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 await page.evaluate(()=>{window.__perf={tasks:[],frames:[],last:0};new PerformanceObserver(list=>window.__perf.tasks.push(...list.getEntries().map(e=>e.duration))).observe({entryTypes:['longtask']});const tick=t=>{if(window.__perf.last)window.__perf.frames.push(t-window.__perf.last);window.__perf.last=t;requestAnimationFrame(tick);};requestAnimationFrame(tick);});
 const measurements={};
 const measure=async(name,action)=>{
   await page.evaluate(()=>{window.__perf.tasks=[];window.__perf.frames=[];window.__perf.last=0;});
   const before=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));const start=performance.now();
   await action();await page.waitForTimeout(150);
   const after=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
   const samples=await page.evaluate(()=>window.__perf);const frames=samples.frames.sort((a,b)=>a-b);
   measurements[name]={wallMs:Math.round(performance.now()-start),cpuMs:Math.round((after.TaskDuration-before.TaskDuration)*1000),scriptMs:Math.round((after.ScriptDuration-before.ScriptDuration)*1000),layoutMs:Math.round((after.LayoutDuration-before.LayoutDuration)*1000),longTasks:samples.tasks.length,maxLongTaskMs:Math.round(Math.max(0,...samples.tasks)),frameP95Ms:Math.round(frames[Math.floor(frames.length*.95)]??0)};
 };
 await measure('recalculate',async()=>{await page.getByRole('button',{name:'Routage automatique',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.relation-route-tools button').disabled);});
 const edges=page.locator('.react-flow__edge-interaction');
 const hoverPoints=await edges.evaluateAll(elements=>elements.slice(0,12).map(e=>{const p=e.getPointAtLength(e.getTotalLength()/2),m=e.getScreenCTM();return{x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};}));
 await measure('hover',async()=>{for(const p of hoverPoints)await page.mouse.move(p.x,p.y);await page.mouse.move(1250,130);});
 const node=page.locator('.react-flow__node-table[data-id="public.Personne Physique"]'),box=await node.boundingBox();
 await measure('drag',async()=>{await page.mouse.move(box.x+box.width/2,box.y+8);await page.mouse.down();await page.mouse.move(box.x+box.width/2+90,box.y+58,{steps:30});await page.mouse.up();});
 const moved=await node.boundingBox();if(moved.x-box.x<60||moved.y-box.y<30)throw Error('The measured table did not move as expected');
 await measure('pan',async()=>{await page.mouse.move(1200,500);await page.mouse.down({button:'middle'});await page.mouse.move(1100,430,{steps:30});await page.mouse.up({button:'middle'});});
 const {profile}=await cdp.send('Profiler.stop');
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),hits=new Map();for(const sample of profile.samples??[]){const name=nodes.get(sample)?.callFrame.functionName||'(anonymous)';hits.set(name,(hits.get(name)??0)+1);}
 const total=profile.samples?.length??1,hot=[...hits].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([name,count])=>({name,samples:count,percent:Math.round(count*1000/total)/10}));
 const dom=await page.evaluate(()=>({elements:document.querySelectorAll('*').length,handles:document.querySelectorAll('.react-flow__handle').length,relations:document.querySelectorAll('.directed-relation').length,animatedDots:document.querySelectorAll('.relation-direction-dot').length}));
 const result={label,openMs:Math.round(openMs),measurements,dom,hot,errors};
 await writeFile(resolve(root,`${label}.json`),JSON.stringify(result,null,2));await writeFile(resolve(root,`${label}.cpuprofile`),JSON.stringify(profile));console.log(JSON.stringify(result,null,2));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await app.close();if(prefs)await writeFile(preferencesPath,prefs);}
