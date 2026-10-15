import { _electron as electron } from 'file:///C:/Users/quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import assert from 'node:assert/strict';
import { createDbcdProject, saveDbcdProject, emptyPresentation } from '../packages/core/dist/index.js';

await mkdir('build/history-review', { recursive: true });
const file = resolve(`build/history-review/history-${Date.now()}.dbcd`);
const input = { workspaceRoot: dirname(file), projectPath: basename(file) };
const presentation = emptyPresentation();
const created = await createDbcdProject({ ...input, sourceText: 'Table clients {\n id int [pk]\n nom text\n}', presentation });
await saveDbcdProject({ ...input, expectedProjectId: created.projectId, expectedRevisionId: created.currentRevisionId, expectedGeneration: created.generation, sourceText: 'Table clients {\n id int [pk]\n nom varchar(80) [not null]\n email text\n}\nTable commandes {\n id int [pk]\n client_id int [ref: > clients.id]\n}', presentation });
const app = await electron.launch({ executablePath: resolve(process.env.DBCODEX_EXECUTABLE || 'node_modules/electron/dist/electron.exe'), args: process.env.DBCODEX_EXECUTABLE ? [file] : [resolve('packages/desktop/dist/main.js'), file], env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Historique', exact: true }).click();
  const entries = page.getByRole('button', { name: /^Voir la révision/ });
  await entries.nth(1).click();
  await page.getByText('Table ajoutée : commandes', { exact: true }).waitFor();
  await page.getByText('Colonne modifiée : clients.nom (text → varchar(80), obligatoire)', { exact: true }).waitFor();
  await page.screenshot({ path: resolve('build/history-review/desktop.png') });
  await page.getByText('Consulter le DBML avant / après', { exact: true }).click();
  await page.getByRole('region', { name: 'Historique des révisions' }).screenshot({ path: resolve('build/history-review/comparison.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setMinimumSize(360, 580));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(480, 760));
  await page.screenshot({ path: resolve('build/history-review/narrow.png') });
  assert.equal(await page.locator('.history-panel').evaluate(el => el.scrollWidth > el.clientWidth), false);
  assert.deepEqual(errors, []);
  await writeFile('build/history-review/checks.json', JSON.stringify({ passed: true, checks: ['Actual dbcd revision loads parsed schema', 'Table, column and relation changes', 'DBML before / after', '480px panel has no horizontal overflow'], errors }, null, 2));
  console.log('History visual and integration checks passed.');
} finally { await app.close(); }
