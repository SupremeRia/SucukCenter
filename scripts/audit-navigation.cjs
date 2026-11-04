const { _electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const assert = require('node:assert/strict');
const before = process.argv[2] === 'before';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-audit-nav-'));

const env = { ...process.env, SUCUKCENTER_TEST: '1', SUCUKCENTER_TEST_DOCUMENTS: root };
delete env.ELECTRON_RUN_AS_NODE;
let app;
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
  page.setDefaultTimeout(15000);
  await page.getByRole('heading', { name: 'İşletme Özeti', exact: true }).waitFor();
  await page.evaluate(async () => {
    const run = async (c) => {
      const r = await window.desktop.execute(
        ['product', 'customer', 'supplier'].includes(c.type)
          ? c
          : { operationId: globalThis.crypto.randomUUID(), ...c },
      );
      if (!r.ok) throw new Error(r.error);
      return r.data;
    };
    const p = await run({
        type: 'product',
        name: 'Gezinme Test',
        unit: 'Kg',
        price: 200,
        critical: 0,
        active: true,
      }),
      c = await run({
        type: 'customer',
        name: 'Gezinme Müşteri',
        address: '',
        contact: '',
        phone: '',
      }),
      supplier = await run({
        type: 'supplier',
        name: 'Gezinme Tedarikçi',
        address: '',
        contact: '',
        phone: '',
      });
    await run({
      type: 'purchase',
      supplierId: supplier,
      lines: [{ productId: p, quantity: 100000, price: 100 }],
      paid: false,
      note: '',
    });
    for (let i = 0; i < 12; i++)
      await run({
        type: 'sale',
        customerId: c,
        lines: [{ productId: p, quantity: 1000, price: 200 }],
        note: 'Gezinme',
      });
  });
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Ürün Yönetimi', exact: true })
    .click();
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('sc:snapshot');
    ipcMain.removeHandler('sc:snapshot');
    ipcMain.handle('sc:snapshot', async (e, q) => {
      const result = await original(e, q);
      if (q?.page === 'sales') await new Promise((r) => setTimeout(r, 900));
      return result;
    });
  });
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Müşteri Satışları', exact: true })
    .click();
  await page.waitForTimeout(60);
  const hidden = await page.locator('section[aria-busy]').evaluate((e) => e.hidden),
    rows = await page.getByRole('row').count();
  console.log(
    JSON.stringify({
      mode: before ? 'before' : 'after',
      previousSnapshotVisible: !hidden,
      visibleRowsDuringDelay: rows,
    }),
  );
  assert.equal(hidden, !before);
  assert.equal(rows > 0, before);
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
  assert.ok((await page.getByRole('row').count()) > 1);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(root).startsWith('sucukcenter-audit-nav-'),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
