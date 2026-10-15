import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDbml, createDbcdProject, openDbcdProject, saveDbcdDraft, saveDbcdProject } from '../packages/core/dist/index.js';

const label = process.argv[2] ?? 'current';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Invalid measurement label');
const sources = {
  compliance: await readFile('fixtures/Compliance Solution.dbml', 'utf8'),
  large: Array.from({ length: 100 }, (_, i) => `Table t${i} {\n id int [pk]\n${Array.from({ length: 30 }, (_, c) => ` c${c} varchar`).join('\n')}\n}`).join('\n'),
};
const results = {};
async function measure(action, count = 15) {
  const samples = [];
  for (let i = 0; i < count; i++) {
    const start = performance.now(); await action(i); samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { medianMs: +samples[Math.floor(samples.length / 2)].toFixed(2), p95Ms: +samples[Math.floor(samples.length * .95)].toFixed(2), samples: count };
}
const workspaceRoot = await mkdtemp(join(tmpdir(), 'dbc-perf-'));
try {
  for (const [name, sourceText] of Object.entries(sources)) {
    const path = { workspaceRoot, projectPath: `${name}.dbcd` };
    // Warm runtime separately from the timed unchanged-source workload.
    parseDbml(sourceText, path.projectPath);
    const parse = await measure(() => { if (!parseDbml(sourceText, path.projectPath).graph) throw Error('Invalid fixture'); });
    const editedParse = await measure(i => { if (!parseDbml(`${sourceText}\n// edit ${i}`, path.projectPath).graph) throw Error('Invalid fixture'); });
    let snapshot = await createDbcdProject({ ...path, sourceText });
    const expected = () => ({ expectedProjectId: snapshot.projectId, expectedRevisionId: snapshot.currentRevisionId, expectedGeneration: snapshot.generation });
    const open = await measure(() => openDbcdProject(path));
    const draft = await measure(() => saveDbcdDraft({ ...path, ...expected(), baseGeneration: snapshot.generation, sourceText, presentation: snapshot.presentation }));
    const save = await measure(async () => { snapshot = await saveDbcdProject({ ...path, ...expected(), sourceText, presentation: snapshot.presentation }); }, 5);
    results[name] = { tables: snapshot.graph.tables.length, parse, editedParse, open, draft, save };
  }
} finally { await rm(workspaceRoot, { recursive: true, force: true }); }
await mkdir('build/performance', { recursive: true });
await writeFile(`build/performance/core-${label}.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
