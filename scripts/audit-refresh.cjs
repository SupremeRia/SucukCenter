const { _electron } = require('playwright'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const before = process.argv[2] === 'before';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-audit-refresh-'));
let app;
const env = { ...process.env, SUCUKCENTER_TEST: '1', SUCUKCENTER_TEST_DOCUMENTS: root };
delete env.ELECTRON_RUN_AS_NODE;
(async () => {
  app = await _electron.launch({
    executablePath: require('electron'),
    args: [
      before
        ? path.resolve('artifacts/audit/legacy-1.6.0/dist-electron/electron/main.js')
        : path.resolve('.'),
    ],
    env,
  });
  const page = await require('./electron-test-window.cjs').mainWindow(app);
  await page.getByRole('heading', { name: 'İşletme Özeti', exact: true }).waitFor();
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
  await app.evaluate(({ ipcMain }) => {
    globalThis.auditRefreshPages = [];
    const snapshot = ipcMain._invokeHandlers.get('sc:snapshot'),
      execute = ipcMain._invokeHandlers.get('sc:execute');
    ipcMain.removeHandler('sc:snapshot');
    ipcMain.removeHandler('sc:execute');
    ipcMain.handle('sc:snapshot', (e, q) => {
      globalThis.auditRefreshPages.push(q?.page);
      return snapshot(e, q);
    });
    ipcMain.handle('sc:execute', async (e, q) => {
      const r = await execute(e, q);
      if (q.type === 'settings') await new Promise((resolve) => setTimeout(resolve, 700));
      return r;
    });
  });
  await page.getByRole('button', { name: 'Temayı değiştir', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Müşteriler', exact: true })
    .click();
  await page.waitForTimeout(1000);
  const pages = await app.evaluate(() => globalThis.auditRefreshPages);
  console.log(
    JSON.stringify({
      mode: before ? 'before' : 'after',
      requestedPages: pages,
      last: pages.at(-1),
    }),
  );
  assert.equal(pages.at(-1), before ? 'home' : 'customers');
  if (!before) {
    await app.evaluate(({ dialog }, folder) => {
      dialog.showSaveDialog = async () => {
        await new Promise((r) => setTimeout(r, 400));
        return { canceled: false, filePath: folder + '/safe.db' };
      };
    }, root);
    await page.evaluate(() => {
      window.auditMaintenanceBackup = window.desktop.backup();
      return true;
    });
    await page.waitForTimeout(80);
    const read = await page.evaluate(() => window.desktop.snapshot({ page: 'customers' }));
    assert.ok(read.ok, read.error);
    const backup = await page.evaluate(() => window.auditMaintenanceBackup);
    assert.ok(backup.ok, backup.error);
    console.log('PASS safe readonly requests during maintenance');
  }
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(root).startsWith('sucukcenter-audit-refresh-'),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
