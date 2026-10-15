import { _electron as electron, chromium } from 'file:///C:/Users/quentin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { createRequire } from 'node:module';
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { openDbcdProject } from '../packages/core/dist/index.js';
const require = createRequire(import.meta.url);
const asar = createRequire(require.resolve('@electron/packager'))('@electron/asar');
const root = resolve(`build/update-e2e-${Date.now()}`), source = resolve('build/update-release/DBCodex-win32-x64');
await cp(source, root, { recursive: true });
const extracted = join(root, 'old-bundle'); await mkdir(extracted);
asar.extractAll(join(root, 'resources/app.asar'), extracted);
const mainPath = join(extracted, 'dist/main.js'), code = await readFile(mainPath, 'utf8');
let previous = code.replace('var release_config_default = {\n  version: "0.1.1",', 'var release_config_default = {\n  version: "0.1.0",');
if (previous === code) throw Error('Le prédécesseur simulé ne peut pas être préparé.');
// Test-only network/dialog adapter in the disposable predecessor. The real release is unchanged.
const adapter = `
globalThis.fetch = async url => {
  const fs = require('node:fs');
  if (String(url).endsWith('/update-manifest.json')) return new Response(fs.readFileSync(${JSON.stringify(resolve('build/update-release/update-manifest.json'))}));
  if (String(url).endsWith('/DBCodex-0.1.1-win-x64.zip')) return new Response(fs.readFileSync(${JSON.stringify(resolve('build/update-release/DBCodex-0.1.1-win-x64.zip'))}));
  throw Error('Unexpected test network request');
};
dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
`;
previous = previous.replace('app.whenReady().then(() => {', adapter + '\napp.whenReady().then(() => {');
await writeFile(mainPath, previous);
await asar.createPackage(extracted, join(root, 'resources/app.asar'));
const project = join(root, 'test-project.dbcd'); await cp('fixtures/demo-shop.dbcd', project);
await mkdir(join(root, 'data'), { recursive: true });
await writeFile(join(root, 'data/preferences.json'), JSON.stringify({ version: 1, theme: 'dark', recent: ['test-project.dbcd'] }));
const executablePath = join(root, 'DBCodex.exe');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));
let app;
let browser;
const proof = [];
function stopTestProcesses() {
  // Only stop processes from this uniquely named, disposable test copy.
  execFileSync('powershell.exe', ['-NoProfile', '-Command', "Get-Process -Name DBCodex -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:DBCODEX_TEST_EXE } | Stop-Process -Force"], { windowsHide: true, env: { ...process.env, DBCODEX_TEST_EXE: executablePath } });
}
try {
  // Launch outside electron.launch: its cleanup kills Windows child processes, including the updater.
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const child = spawn(executablePath, [`--remote-debugging-port=${port}`, project], { env, stdio: 'ignore', windowsHide: true });
  const closed = new Promise(resolve => child.once('exit', resolve));
  for (let attempt = 0; attempt < 50; attempt++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); break; } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  if (!browser) throw Error('Connexion à la copie de test impossible.');
  const page = browser.contexts()[0].pages()[0]; await page.locator('.cm-content').waitFor();
  const original = await page.locator('.cm-content').innerText();
  await page.locator('.cm-content').fill('// brouillon conserve pendant mise a jour\n' + original);
  await page.locator('.update-menu > summary').click();
  await page.getByRole('button', { name: 'Vérifier les mises à jour', exact: true }).click();
  await page.getByText('La version 0.1.1 est disponible.', { exact: true }).waitFor();
  await page.screenshot({ path: 'build/update-available.png' });
  await page.getByRole('button', { name: 'Télécharger la mise à jour', exact: true }).click();
  await page.getByRole('button', { name: 'Mettre à jour et redémarrer', exact: true }).waitFor();
  await page.screenshot({ path: 'build/update-ready.png' });
  proof.push('Vérification signée, téléchargement vérifié, menu disponible en thème sombre');
  await page.getByRole('button', { name: 'Mettre à jour et redémarrer', exact: true }).click();
  await closed; browser = undefined;
  const expectedAsar = createHash('sha256').update(await readFile(join(source, 'resources/app.asar'))).digest('hex');
  let complete = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try { await access(join(root, '.dbcodex-update.lock')); } catch {
      const hash = createHash('sha256').update(await readFile(join(root, 'resources/app.asar'))).digest('hex');
      if (hash === expectedAsar) { complete = true; break; }
    }
  }
  if (!complete) throw Error('Le remplacement réel ne s’est pas terminé.');
  const snapshot = await openDbcdProject({ workspaceRoot: root, projectPath: 'test-project.dbcd' });
  if (!snapshot.draft?.sourceText.includes('brouillon conserve pendant mise a jour')) throw Error('Brouillon perdu pendant la mise à jour.');
  const prefs = JSON.parse(await readFile(join(root, 'data/preferences.json'), 'utf8'));
  if (prefs.theme !== 'dark' || !prefs.recent.includes('test-project.dbcd')) throw Error('Préférences perdues.');
  proof.push('Fermeture, conservation réelle du brouillon, remplacement complet et sauvegarde');
  // Give the helper enough time to relaunch its own GUI before attaching a fresh test instance.
  await new Promise(resolve => setTimeout(resolve, 1500)); stopTestProcesses();
  app = await electron.launch({ executablePath, args: [project], env });
  const updatedPage = await app.firstWindow(); await updatedPage.locator('.update-menu > summary').click();
  await updatedPage.getByText('DBCodex 0.1.1', { exact: true }).waitFor();
  await updatedPage.screenshot({ path: 'build/update-complete.png' });
  proof.push('Nouvelle version 0.1.1 lançable après mise à jour');
  console.log(JSON.stringify({ root, proof }, null, 2));
  await writeFile('build/update-e2e-result.json', JSON.stringify({ root, proof }, null, 2));
} finally { if (browser) await browser.close().catch(() => {}); if (app) await app.close().catch(() => {}); stopTestProcesses(); }
