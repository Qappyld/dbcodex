import { createRequire } from 'node:module';
const { build } = createRequire(new URL('../packages/ui/package.json', import.meta.url))('esbuild');
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
await mkdir('packages/desktop/dist', { recursive:true });
await build({ entryPoints:['packages/desktop/src/main.ts'], bundle:true, platform:'node', format:'esm', outfile:'packages/desktop/dist/main.js', external:['electron'], banner:{js:"import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"} });
await build({ entryPoints:['packages/desktop/src/renderer/PortableApp.tsx'], bundle:true, jsx:'automatic', platform:'browser', format:'iife', outfile:'packages/desktop/dist/renderer.js', define:{'process.env.NODE_ENV':'"production"'}, minify:true, keepNames:true });
await copyFile('packages/desktop/src/preload.cjs','packages/desktop/dist/preload.cjs');
await copyFile('packages/desktop/src/apply-update.ps1','packages/desktop/dist/apply-update.ps1');
await writeFile('packages/desktop/dist/index.html', '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'none\'"><title>DBCodex</title><link rel="stylesheet" href="renderer.css"></head><body><div id="root"></div><script src="renderer.js"></script></body></html>');
