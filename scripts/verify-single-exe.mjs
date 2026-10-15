import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
const { chromium } = await import(process.env.DBCODEX_PLAYWRIGHT_MODULE || 'playwright');
const config = JSON.parse(await readFile('release-config.json', 'utf8'));
const output = resolve(process.env.DBCODEX_RELEASE_OUT || 'release');
const root = resolve(`build/single-exe-smoke-${Date.now()}`);
await mkdir(join(root, 'data'), { recursive: true });
// Spaces and a renamed executable exercise both the launcher and future updater jobs.
const executablePath = join(root, 'Mon DBCodex portable.exe');
await cp(join(output, `DBCodex-${config.version}-win-x64.exe`), executablePath);
await cp('fixtures/demo-shop.dbcd', join(root, 'project.dbcd'));
await writeFile(join(root, 'data/preferences.json'), JSON.stringify({ version: 1, theme: 'dark', recent: ['project.dbcd'] }));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['ELECTRON_RUN_AS_NODE', 'PORTABLE_EXECUTABLE_FILE', 'PORTABLE_EXECUTABLE_DIR'].includes(key)));
const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port; await new Promise(resolve => server.close(resolve));
// NSIS does not forward stdout; connect to Chromium rather than Electron's inspector.
const child = spawn(executablePath, [`--remote-debugging-port=${port}`, join(root, 'project.dbcd')], { env, windowsHide: true, stdio: 'ignore' });
let exited = false; const closed = new Promise(resolve => child.once('exit', () => { exited = true; resolve(); }));
let browser;
try {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline && !exited) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert(browser, 'Le portable doit démarrer et exposer sa fenêtre.');
  const page = browser.contexts()[0].pages()[0];
  await page.locator('.cm-content').waitFor({ timeout: 30000 });
  const preferences = await page.evaluate(() => window.dbcodex.call('preferences'));
  assert.equal(preferences.theme, 'dark');
  assert(preferences.recent.some(item => item.path === join(root, 'project.dbcd')));
  const status = await page.evaluate(() => window.dbcodex.call('update_status'));
  assert.equal(status.currentVersion, config.version);
  await page.screenshot({ path: join(root, 'launched.png') });
  await page.evaluate(() => window.close());
  await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(Error('Le portable ne se ferme pas.')), 20000).unref())]);
  const saved = JSON.parse(await readFile(join(root, 'data/preferences.json'), 'utf8'));
  assert.equal(saved.theme, 'dark'); assert(saved.recent.includes('project.dbcd'));
  const result = { passed: true, root, version: config.version, checks: ['Single renamed EXE launches without adjacent Electron files', 'Project opens from command line', 'Preferences use data next to original EXE', 'Relative recent paths preserved', 'Packaged update version correct', 'Launcher exits after normal window closure'] };
  await writeFile(join(root, 'checks.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (!exited && child.pid) execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
}
