import { _electron as electron } from 'file:///C:/Users/quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createDbcdProject, openDbcdProject } from '../packages/core/dist/index.js';

// Isolate the app, projects and preferences from the user's portable installation.
const executablePath = resolve(process.env.DBCODEX_ELECTRON || 'node_modules/electron/dist/electron.exe');
assert.ok(existsSync(executablePath), 'Runtime Electron de développement absent : installez Electron ou définissez DBCODEX_ELECTRON.');
const root = resolve(`build/save-review/${Date.now()}`);
const dist = join(root, 'app/desktop/dist');
await mkdir(dist, { recursive: true });
await cp('packages/desktop/dist', dist, { recursive: true });
const file = join(root, 'original.dbcd'), copy = join(root, 'copie.dbcd');
const input = { workspaceRoot: root, projectPath: basename(file) };
await createDbcdProject({ ...input, sourceText: 'Table clients {\n id int [pk]\n}' });
const app = await electron.launch({ executablePath,
  args: [join(dist, 'main.js'), file],
  env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const source = page.getByRole('textbox', { name: 'DBML source' });
  await source.fill('Table clients {\n id bigint [pk]\n}');
  await page.keyboard.press('Control+s');
  await page.getByText('Enregistré', { exact: true }).waitFor();
  assert.match((await openDbcdProject(input)).sourceText, /bigint/);
  assert.equal((await openDbcdProject(input)).generation, 2);
  await page.getByText('Fichier', { exact: true }).click();
  await page.getByRole('button', { name: /Enregistrer sous/ }).last().waitFor();
  await page.screenshot({ path: join(root, 'file-menu.png') });
  await page.keyboard.press('Escape');
  await source.fill('Table clients {\n id bigint [pk]\n nom text\n}');
  await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, copy);
  await page.keyboard.press('Control+Shift+s');
  await page.locator('.workbench-toolbar strong').filter({ hasText: 'copie.dbcd' }).waitFor();
  await page.getByText('Enregistré', { exact: true }).waitFor();
  assert.match((await openDbcdProject({ ...input, projectPath: 'copie.dbcd' })).sourceText, /nom text/);
  assert.doesNotMatch((await openDbcdProject(input)).sourceText, /nom text/);
  await source.fill('Table clients {\n id bigint [pk]\n nom varchar\n}');
  await page.locator('.workbench-toolbar strong').click();
  await page.keyboard.press('Control+s');
  await page.getByText('Enregistré', { exact: true }).waitFor();
  assert.match((await openDbcdProject({ ...input, projectPath: 'copie.dbcd' })).sourceText, /nom varchar/);
  assert.equal((await openDbcdProject(input)).generation, 2);
  await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' }); });
  await page.getByText('Fichier', { exact: true }).click();
  await page.locator('.file-menu-content').getByRole('button', { name: /Enregistrer sous/ }).click();
  await page.getByRole('button', { name: 'Enregistrer sous', exact: true }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('.workbench-toolbar strong').textContent(), 'copie.dbcd');
  await page.screenshot({ path: join(root, 'saved-copy.png') });
  assert.deepEqual(errors, []);
  await writeFile(join(root, 'checks.json'), JSON.stringify({ passed: true,
    checks: ['Ctrl+S during pending validation', 'Ctrl+Shift+S includes unsaved content', 'Save continues in new project', 'Ctrl+S outside editor', 'Original preserved', 'File menu and cancellation'], errors }, null, 2));
  console.log(`Save integration and visual checks passed: ${root}`);
} finally { await app.close(); }
