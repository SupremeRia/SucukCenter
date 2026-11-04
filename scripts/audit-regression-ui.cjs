const { _electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const packaged = process.env.SUCUKCENTER_AUDIT_PACKAGED === '1';
const prefix = packaged ? 'sucukcenter-review-' : 'sucukcenter-audit-ui-';
const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
let app, page;
const env = {
  ...process.env,
  SUCUKCENTER_TEST: '1',
  SUCUKCENTER_TEST_DOCUMENTS: root,
  SUCUKCENTER_REVIEW_ROOT: root,
};
delete env.ELECTRON_RUN_AS_NODE;
async function run(c) {
  const r = await page.evaluate(
    (c) => window.desktop.execute(c),
    ['product', 'customer', 'supplier'].includes(c.type) ? c : { operationId: randomUUID(), ...c },
  );
  assert.ok(r.ok, r.error);
  return r.data;
}
async function nav(name) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
}
async function editOrder() {
  const row = page.getByRole('row').filter({ hasText: 'Ürün 064' });
  await row.getByRole('button', { name: 'Kayıt işlemleri', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Düzelt', exact: true }).click();
}
(async () => {
  app = await _electron.launch({
    executablePath: packaged
      ? path.resolve('review-builds/runtime-test/win-unpacked/SucukCenterReview.exe')
      : require('electron'),
    args: [
      ...(packaged ? [] : [path.resolve('.')]),
      '--force-device-scale-factor=' + (process.env.SUCUKCENTER_AUDIT_SCALE || '1'),
    ],
    env,
  });
  page = await require('./electron-test-window.cjs').mainWindow(app);
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('heading', { name: 'İşletme Özeti', exact: true }).waitFor();
  await page.context().setOffline(true);
  let product;
  for (let i = 0; i < 65; i++)
    product = await run({
      type: 'product',
      name: 'Ürün ' + String(i).padStart(3, '0'),
      unit: 'Kg',
      price: 100,
      critical: 0,
      active: true,
    });
  const customer = await run({
    type: 'customer',
    name: 'Test Müşteri',
    address: '',
    contact: '',
    phone: '',
  });
  const order = await run({
    type: 'preorder',
    customerId: customer,
    productId: product,
    quantity: 1000,
    price: 100,
    source: 'prepaid',
    note: 'Uzak ürün',
  });
  await nav('Bekleyen Teslimatlar');
  await page
    .getByText('Ürün yükümlülükleri yükleniyor…', { exact: true })
    .waitFor({ state: 'hidden' });
  await editOrder();
  await page.getByLabel('Ürün', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Ürün', { exact: true }).inputValue(), String(product));
  await page.getByLabel('Miktar', { exact: true }).fill('2');
  await page.getByLabel('Düzeltme gerekçesi').fill('Uzak ürün korunmalı');
  await page.getByRole('button', { name: 'Düzeltmeyi incele', exact: true }).click();
  await page.getByRole('button', { name: 'Düzeltmeyi onayla', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const snapshot = await page.evaluate(() => window.desktop.snapshot({ page: 'preorders' }));
  assert.ok(snapshot.ok);
  const replacement = snapshot.data.preorders.find((o) => o.id !== order);
  assert.equal(replacement.product_id, product);
  assert.equal(replacement.remaining, 2000);
  assert.equal(snapshot.data.preorders.find((o) => o.id === order).remaining, 0);
  await app.evaluate(({ ipcMain }) => {
    globalThis.auditFailContext = true;
    const snap = ipcMain._invokeHandlers.get('sc:snapshot'),
      lookup = ipcMain._invokeHandlers.get('sc:lookup');
    ipcMain.removeHandler('sc:snapshot');
    ipcMain.removeHandler('sc:lookup');
    ipcMain.handle('sc:snapshot', async (e, q) => {
      const r = await snap(e, q);
      if (globalThis.auditFailContext && q?.focusEntity === 'preorder' && r.ok)
        r.data.products = r.data.products.filter((p) => p.id !== 65);
      return r;
    });
    ipcMain.handle('sc:lookup', (e, q) =>
      globalThis.auditFailContext && q?.selected === 65
        ? { ok: false, error: 'Sentetik ürün yüklenemedi' }
        : lookup(e, q),
    );
  });
  await page
    .getByText('Ürün yükümlülükleri yükleniyor…', { exact: true })
    .waitFor({ state: 'hidden' });
  await editOrder();
  await page.getByRole('alert').filter({ hasText: 'Sentetik ürün yüklenemedi' }).waitFor();
  assert.equal(await page.getByLabel('Ürün', { exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  await app.evaluate(() => {
    globalThis.auditFailContext = false;
  });
  await app.evaluate(({ ipcMain }) => {
    globalThis.auditReports = 0;
    globalThis.auditAnnual = 0;
    for (const name of ['report', 'annual']) {
      const fn = ipcMain._invokeHandlers.get('sc:' + name);
      ipcMain.removeHandler('sc:' + name);
      ipcMain.handle('sc:' + name, (e, q) => {
        if (name === 'report') globalThis.auditReports++;
        else globalThis.auditAnnual++;
        return fn(e, q);
      });
    }
  });
  await nav('Müşteriler');
  const search = page.getByPlaceholder('Firma, yetkili veya telefon ara…');
  await search.click();
  await page.keyboard.type('Test yok uzun arama', { delay: 40 });
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await search.evaluate((e) => document.activeElement === e), true);
  assert.equal(await app.evaluate(() => globalThis.auditReports), 0);
  await nav('Finans ve Raporlar');
  await page.getByText('Dönem raporu yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await app.evaluate(() => globalThis.auditAnnual), 0);
  await page.getByRole('tab', { name: 'Yıllık karşılaştırma', exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-state="active"][role="tabpanel"]')?.textContent?.includes('2026'),
  );
  assert.equal(await app.evaluate(() => globalThis.auditAnnual), 1);
  assert.deepEqual(errors, []);
  console.log(
    `PASS audit Electron packaged=${packaged}: off-page65 product preserved through correction; failed context never opens wrong-value form; continuous/debounced search requests no unrelated reports; annual report loaded on demand; offline.`,
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(root).startsWith(prefix),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
