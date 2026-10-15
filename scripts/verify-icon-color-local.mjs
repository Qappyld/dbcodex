import {_electron as electron} from 'file:///C:/Users/quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {resolve,basename} from 'node:path';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createDbcdProject,emptyPresentation} from '../packages/core/dist/index.js';
const folder=resolve('build/icon-color-review');await mkdir(folder,{recursive:true});
const presentation=emptyPresentation();presentation.views.all.nodes['public.site']={x:300,y:100,color:'#b14859'};
const file=resolve(folder,`color-${Date.now()}.dbcd`);
await createDbcdProject({workspaceRoot:folder,projectPath:basename(file),sourceText:'Table site {\n id int [pk]\n}',presentation});
const app=await electron.launch({executablePath:resolve('release/DBCodex-win32-x64/DBCodex.exe'),args:[file],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'))});
try {const page=await app.firstWindow();const icon=page.locator('.builder-tree-table button:last-child .action-icon');await icon.waitFor();const actual=await icon.evaluate(el=>getComputedStyle(el).color);assert.equal(actual,'rgb(177, 72, 89)');await page.screenshot({path:resolve(folder,'verified.png')});console.log('Packaged app verified: site icon is red ('+actual+').');}finally{await app.close();}
