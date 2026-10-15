import { _electron as electron } from 'file:///C:/Users/quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { createDbcdProject } from '../packages/core/dist/index.js';
import assert from 'node:assert/strict';

await mkdir('build/ui-review', { recursive: true });
const path = resolve(`build/ui-review/views-${Date.now()}.dbcd`);
await createDbcdProject({ workspaceRoot: dirname(path), projectPath: basename(path), sourceText: await readFile('fixtures/commerce-7-tables.dbml', 'utf8') });
const launch = () => electron.launch({ executablePath: resolve('node_modules/electron/dist/electron.exe'),
  args: [resolve('packages/desktop/dist/main.js'), path],
  env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) });
let app = await launch();
const checks = [], errors = [];
try {
  let page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.locator('.react-flow__node-table').first().waitFor();
  if (await page.getByRole('button', { name: 'Afficher les vues', exact: true }).isVisible()) await page.getByRole('button', { name: 'Afficher les vues', exact: true }).click();
  await page.getByRole('button', { name: 'Choisir une vue' }).waitFor();
  assert.equal(await page.getByLabel('Détail de la vue', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Niveau de détail', { exact: true }).count(), 1);
  const choose = async name => {
    await page.getByRole('button', { name: 'Choisir une vue' }).click();
    await page.getByRole('button', { name, exact: true }).click();
  };
  const waitTables = count => page.waitForFunction(count => document.querySelectorAll('.react-flow__node-table').length === count, count);
  const visibleTables = () => page.locator('.react-flow__node-table').count();
  await choose('＋ Nouvelle vue');
  await page.getByText('Cette vue est vide', { exact: true }).waitFor();
  await waitTables(0); assert.equal(await visibleTables(), 0);
  const boxes = page.getByRole('checkbox', { name: /^Afficher public\./ });
  assert.equal(await boxes.count(), 7);
  const first = boxes.nth(0), second = boxes.nth(1);
  await first.check(); await second.check();
  await waitTables(2); assert.equal(await visibleTables(), 2);
  await page.getByLabel('Niveau de détail', { exact: true }).selectOption('names');
  await page.locator('.react-flow__node-table').first().press('ArrowRight');
  const position = await page.locator('.react-flow__node-table').first().getAttribute('style');
  await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click();
  await page.getByText('Cette vue est vide', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Niveau de détail').inputValue(), 'names');
  await first.check();
  assert.equal(await page.locator('.react-flow__node-table').first().getAttribute('style'), position);
  await page.getByRole('button', { name: 'Enregistrer la vue', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer la vue', exact: true }).waitFor({ state: 'visible' });
  await page.locator('.view-save:disabled').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Enregistrer la vue', exact: true }).isEnabled(), false);
  checks.push('Empty creation, all tables available, preview, reset, saved membership, independent detail and positions');

  await second.check(); await choose('Default View');
  const dialog = page.getByRole('dialog', { name: 'Modifications de la vue non enregistrées' });
  await dialog.waitFor(); await page.screenshot({ path: resolve('build/ui-review/views-unsaved.png') });
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  await waitTables(2); assert.equal(await visibleTables(), 2);
  await choose('Default View'); await dialog.getByRole('button', { name: 'Abandonner', exact: true }).click();
  await waitTables(7); assert.equal(await visibleTables(), 7);
  await choose('Nouvelle vue'); await waitTables(1); assert.equal(await visibleTables(), 1);
  await second.check(); await choose('Default View');
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await choose('Nouvelle vue'); await waitTables(2); assert.equal(await visibleTables(), 2);
  checks.push('Cancel, discard and save when changing view');

  await page.getByRole('button', { name: 'Actions de la vue' }).click();
  await page.getByRole('button', { name: 'Renommer', exact: true }).click();
  await page.getByLabel('Nom de la vue', { exact: true }).fill('Relations clients');
  await page.getByRole('button', { name: 'Valider le nom de la vue' }).click();
  await page.getByRole('button', { name: 'Choisir une vue' }).click();
  await page.screenshot({ path: resolve('build/ui-review/views-list.png') });
  await page.getByRole('button', { name: 'Relations clients', exact: true }).click();
  await page.getByRole('button', { name: 'Options d’enregistrement de la vue' }).click();
  await page.getByRole('button', { name: 'Enregistrer comme nouvelle vue' }).click();
  await waitTables(2); assert.equal(await visibleTables(), 2);
  assert.equal(await page.getByLabel('Niveau de détail').inputValue(), 'names');
  await page.getByRole('button', { name: 'Actions de la vue' }).click();
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.getByRole('dialog', { name: 'Supprimer la vue ?' }).waitFor();
  await page.screenshot({ path: resolve('build/ui-review/views-delete.png') });
  await page.getByRole('button', { name: 'Supprimer la vue', exact: true }).click();
  await waitTables(7); assert.equal(await visibleTables(), 7);
  assert.equal(await page.getByRole('button', { name: 'Actions de la vue' }).count(), 0);
  checks.push('Inline rename, save as new, copied layout, deletion confirmation, system view protection');

  await choose('Relations clients');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Enregistré', { exact: true }).waitFor();
  await app.close(); app = await launch(); page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Choisir une vue' }).waitFor();
  await waitTables(2); assert.equal(await visibleTables(), 2);
  assert.equal(await page.getByLabel('Niveau de détail').inputValue(), 'names');
  checks.push('Project save and reopen preserve custom view and detail');
  await page.screenshot({ path: resolve('build/ui-review/views-final.png') });

  await page.setViewportSize({ width: 800, height: 700 });
  await page.getByRole('button', { name: 'Afficher les vues', exact: true }).click();
  await page.getByRole('button', { name: 'Choisir une vue' }).click();
  await page.screenshot({ path: resolve('build/ui-review/views-compact.png') });
  assert.equal(await page.getByRole('dialog', { name: 'Vues', exact: true }).count(), 1);
  checks.push('Compact drawer and view list');
  assert.deepEqual(errors, []);
  await writeFile('build/ui-review/views-interactions.json', JSON.stringify({ passed: true, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally { await app.close(); }
