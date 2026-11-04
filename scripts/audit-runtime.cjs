const { _electron } = require('playwright');
const fs = require('fs'),
  path = require('path'),
  os = require('os');
const assert = require('node:assert/strict');
const label = process.argv[2] || 'before';
const volume = process.argv[3] || 'small';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-audit-runtime-'));
fs.mkdirSync(path.join(root, 'SucukCenter'));
fs.copyFileSync(
  path.resolve('artifacts/audit/' + volume + '-after-measurement.db'),
  path.join(root, 'SucukCenter', 'sucukcenter.db'),
);
const env = { ...process.env, SUCUKCENTER_TEST: '1', SUCUKCENTER_TEST_DOCUMENTS: root };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const result = { label, volume };
async function settle() {
  await page.waitForFunction(() => {
    const el = document.querySelector('section[aria-busy]');
    return !!el && el.getAttribute('aria-busy') === 'false';
  });
}
async function nav(name) {
  const t = Date.now();
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await settle();
  return Date.now() - t;
}
(async () => {
  let start = Date.now();
  app = await _electron.launch({
    executablePath: require('electron'),
    args: [
      label === 'before'
        ? path.resolve('artifacts/audit/legacy-1.6.0/dist-electron/electron/main.js')
        : path.resolve('.'),
    ],
    env,
    timeout: 120000,
  });
  page = await require('./electron-test-window.cjs').mainWindow(app);
  result.firstWindowCreatedMs = Date.now() - start;
  page.setDefaultTimeout(120000);
  await page.getByRole('heading', { name: 'İşletme Özeti', exact: true }).waitFor();
  await settle();
  result.firstRunReadyMs = Date.now() - start;
  await app.close();
  app = null;
  start = Date.now();
  app = await _electron.launch({
    executablePath: require('electron'),
    args: [
      label === 'before'
        ? path.resolve('artifacts/audit/legacy-1.6.0/dist-electron/electron/main.js')
        : path.resolve('.'),
    ],
    env,
    timeout: 120000,
  });
  page = await require('./electron-test-window.cjs').mainWindow(app);
  page.setDefaultTimeout(120000);
  await page.getByRole('heading', { name: 'İşletme Özeti', exact: true }).waitFor();
  await settle();
  result.startupMs = Date.now() - start;
  await app.evaluate(({ ipcMain }) => {
    globalThis.auditPerf = { counts: {}, maxGap: 0, last: Date.now(), active: 0 };
    globalThis.setInterval(() => {
      const p = globalThis.auditPerf,
        t = Date.now();
      p.maxGap = Math.max(p.maxGap, t - p.last);
      p.last = t;
    }, 20);
    for (const name of ['snapshot', 'report', 'annual', 'lookup']) {
      const fn = ipcMain._invokeHandlers.get('sc:' + name);
      ipcMain.removeHandler('sc:' + name);
      ipcMain.handle('sc:' + name, async (e, q) => {
        globalThis.auditPerf.counts[name] = (globalThis.auditPerf.counts[name] || 0) + 1;
        globalThis.auditPerf.active++;
        try {
          return await fn(e, q);
        } finally {
          globalThis.auditPerf.active--;
        }
      });
    }
  });
  result.customerNavigationMs = await nav('Müşteriler');
  const search = page.getByPlaceholder('Firma, yetkili veya telefon ara…');
  let before = await app.evaluate(() => ({ ...globalThis.auditPerf.counts }));
  let t = Date.now();
  await search.click();
  await page.keyboard.type('Sentetik Müşteri 001', { delay: 12 });
  await page.waitForTimeout(220);
  await settle();
  result.searchToSettledMs = Date.now() - t;
  const after = await app.evaluate(() => ({ ...globalThis.auditPerf.counts }));
  result.searchRequests = Object.fromEntries(
    ['snapshot', 'report', 'annual'].map((k) => [k, (after[k] || 0) - (before[k] || 0)]),
  );
  assert.equal(await search.evaluate((e) => document.activeElement === e), true);
  await search.fill('');
  await page.waitForTimeout(220);
  await settle();
  t = Date.now();
  await page.getByRole('button', { name: 'Müşteri ekle', exact: true }).click();
  await page.getByLabel('Firma adı', { exact: true }).waitFor();
  result.formOpenMs = Date.now() - t;
  await page.keyboard.press('Escape');
  await nav('Müşteri Satışları');
  t = Date.now();
  await page.getByRole('button', { name: 'Yeni satış', exact: true }).first().click();
  const combo = page.getByRole('combobox', { name: 'Müşteri', exact: true });
  await combo.click();
  await page.getByRole('listbox', { name: 'Müşteri seçenekleri', exact: true }).waitFor();
  result.choiceOpenMs = Date.now() - t;
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  result.financeNavigationMs = await nav('Finans ve Raporlar');
  await page.waitForTimeout(200);
  await page.waitForFunction(async () => true);
  await app.evaluate(async () => {
    while (globalThis.auditPerf.active) await new Promise((r) => setTimeout(r, 20));
  });
  result.financeAutomaticRequests = await app.evaluate(() => ({ ...globalThis.auditPerf.counts }));
  await app.evaluate(({ dialog }, root) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: root + '/backup.db' });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root + '/backup.db'] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, root);
  await app.evaluate(() => {
    globalThis.auditPerf.maxGap = 0;
    globalThis.auditPerf.last = Date.now();
  });
  t = Date.now();
  let r = await page.evaluate(() => window.desktop.backup());
  assert.ok(r.ok, r.error);
  result.backupIPC = Date.now() - t;
  t = Date.now();
  r = await page.evaluate(() => window.desktop.restore());
  assert.ok(r.ok, r.error);
  result.restoreIPC = Date.now() - t;
  await page.waitForTimeout(60);
  result.mainEventLoopMaxGapMs = await app.evaluate(() => globalThis.auditPerf.maxGap);
  fs.writeFileSync(
    'artifacts/audit/' + volume + '-' + label + '-runtime.json',
    JSON.stringify(result, null, 2),
  );
  console.log('PASS', JSON.stringify(result));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(root).startsWith('sucukcenter-audit-runtime-'),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
