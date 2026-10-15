import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyPresentation } from '../packages/core/dist/presentation.js';
const { build } = createRequire(new URL('../packages/ui/package.json', import.meta.url))('esbuild');
await mkdir('build/performance', { recursive: true });
const outfile = resolve('build/performance/presentation-commands.mjs');
await build({ entryPoints: ['packages/ui/src/presentation-commands.ts'], bundle: true, platform: 'node', format: 'esm', outfile });
const { setNodePosition, setNodePositions } = await import(pathToFileURL(outfile).href);
const document = emptyPresentation();
const positions = Array.from({ length: 100 }, (_, i) => ({ id: `public.t${i}`, position: { x: i * 20, y: i * 10 } }));
for (let i = 0; i < 10; i++) document.views[`view${i}`] = { ...structuredClone(document.views.all), system: false, name: `View ${i}` };
for (const view of Object.values(document.views)) for (const { id, position } of positions) view.nodes[id] = { ...position };
const sequential = () => positions.reduce((value, item) => setNodePosition(value, 'all', item.id, item.position), document);
const batched = () => setNodePositions(document, 'all', positions);
assert.deepEqual(batched(), sequential());
function measure(action) {
  action();
  const samples = Array.from({ length: 15 }, () => { const start = performance.now(); action(); return performance.now() - start; }).sort((a, b) => a - b);
  return { medianMs: +samples[7].toFixed(2), p95Ms: +samples[14].toFixed(2), samples: samples.length };
}
const result = { tables: positions.length, views: Object.keys(document.views).length, sequential: measure(sequential), batched: measure(batched), equivalent: true };
await writeFile('build/performance/presentation-batch.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
