import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {build}=createRequire(resolve(root,'packages/ui/package.json'))('esbuild');
await build({entryPoints:[resolve(root,'packages/ui/src/index.tsx')],bundle:true,format:'iife',jsx:'automatic',platform:'browser',outfile:resolve(root,'packages/ui/dist/widget.js'),define:{'process.env.NODE_ENV':'"production"'},minify:true,keepNames:true});
