const { _electron } = require('playwright');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { randomUUID } = require('node:crypto');
const { setMonth, shortcut, expectSummary, discard } = require('./ui-helpers.cjs');
const packaged = process.env.SUCUKCENTER_EXPENSES_PACKAGED === '1';
const prefix = packaged ? 'sucukcenter-review-' : 'sucukcenter-expenses-ui-';
const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const env = {
  ...process.env,
  SUCUKCENTER_TEST: '1',
  SUCUKCENTER_TEST_DOCUMENTS: root,
  SUCUKCENTER_REVIEW_ROOT: root,
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
async function launch() {
  app = await _electron.launch({
    executablePath: packaged
      ? path.resolve('review-builds/runtime-test/win-unpacked/SucukCenterReview.exe')
      : require('electron'),
    args: [
      ...(packaged ? [] : [path.resolve('.')]),
      '--force-device-scale-factor=' + (process.env.SUCUKCENTER_EXPENSES_SCALE || '1'),
    ],
    env,
    timeout: 30000,
  });
  page = await require('./electron-test-window.cjs').mainWindow(app);
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('heading', { name: 'İşletme Özeti', exact: true }).waitFor();
  await page.context().setOffline(true);
}
async function run(c) {
  const r = await page.evaluate(
    (c) => window.desktop.execute(c),
    ['product', 'customer', 'supplier'].includes(c.type) ? c : { operationId: randomUUID(), ...c },
  );
  assert.ok(r.ok, r.error);
  return r.data;
}
async function snap() {
  const r = await page.evaluate(() => window.desktop.snapshot());
  assert.ok(r.ok, r.error);
  assert.ok(r.data.dbPath.startsWith(root));
  return r.data;
}
async function settled() {
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByText('Dönem raporu yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
}
async function nav(name) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await settled();
}
async function menu(row, name, right = false) {
  if (right) await row.click({ button: 'right' });
  else await row.getByRole('button', { name: 'Kayıt işlemleri', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
async function add(name, amount, method = 'Nakit') {
  await page.getByRole('button', { name: 'Gider ekle', exact: true }).click();
  await page.getByLabel('Giderin adı', { exact: true }).fill(name);
  await page.getByLabel('Tutar (TL)', { exact: true }).fill(amount);
  await page.getByLabel('Ödeme yöntemi', { exact: true }).selectOption(method);
  await page.getByLabel('İşlem tarihi', { exact: true }).fill('15.10.2026');
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await settled();
}
function metric(label) {
  return page
    .locator('.metric')
    .filter({ has: page.locator('.metric-head').getByText(label, { exact: true }) })
    .locator('strong');
}
(async () => {
  await launch();
  const p = await run({
    type: 'product',
    name: 'Sahte ürün',
    unit: 'Kg',
    price: 5000000,
    critical: 0,
    active: true,
  });
  const c = await run({
    type: 'customer',
    name: 'Sahte müşteri',
    address: '',
    contact: '',
    phone: '',
  });
  const t = await run({
    type: 'supplier',
    name: 'Sahte tedarikçi',
    address: '',
    contact: '',
    phone: '',
  });
  await run({
    type: 'purchase',
    supplierId: t,
    lines: [{ productId: p, quantity: 2000, price: 3000000 }],
    paid: false,
    note: '',
    occurredOn: '2026-10-01',
  });
  await run({
    type: 'sale',
    customerId: c,
    lines: [{ productId: p, quantity: 1000, price: 5000000 }],
    note: '',
    occurredOn: '2026-10-02',
  });
  const before = await snap();
  await nav('Giderler');
  await setMonth(page, '2026-10');
  await settled();
  await add('Kira', '8000');
  await add('Elektrik', '1500', 'Banka');
  await add('Su', '500');
  await add('Araç mazotu', '2000', 'Kart');
  assert.equal((await snap()).summary.expenses, 1200000);
  assert.deepEqual((await snap()).products, before.products);
  assert.deepEqual((await snap()).customers, before.customers);
  await metric('Seçili dönem gideri').getByText('₺12.000,00', { exact: true }).waitFor();
  // Real IPC replies deliberately arrive out of order in this isolated process.
  await app.evaluate(({ ipcMain }) => {
    const snapshot = ipcMain._invokeHandlers.get('sc:snapshot');
    ipcMain.removeHandler('sc:snapshot');
    ipcMain.handle('sc:snapshot', async (e, q) => {
      const r = await snapshot(e, q);
      if (q?.page === 'expenses')
        await new Promise((resolve) => setTimeout(resolve, q.search === 'Kira' ? 800 : 100));
      return r;
    });
    const report = ipcMain._invokeHandlers.get('sc:report');
    ipcMain.removeHandler('sc:report');
    ipcMain.handle('sc:report', async (e, q) => {
      if (q?.start === '2025-01-01') return { ok: false, error: 'Sentetik rapor hatası' };
      const r = await report(e, q);
      if (q?.start === '2026-09-01') await new Promise((resolve) => setTimeout(resolve, 1000));
      return r;
    });
  });
  const delayedSearch = page.getByRole('textbox', { name: 'Gider adına göre ara…', exact: true });
  await delayedSearch.fill('Kira');
  await page.waitForTimeout(220);
  await delayedSearch.fill('Su');
  await settled();
  await page.waitForTimeout(900);
  assert.ok(await page.getByRole('row').filter({ hasText: 'Su' }).isVisible());
  assert.equal(await page.getByRole('row').filter({ hasText: 'Kira' }).count(), 0);
  assert.ok(await delayedSearch.evaluate((e) => document.activeElement === e));
  await metric('Seçili dönem gideri').getByText('₺500,00', { exact: true }).waitFor();
  await delayedSearch.fill('');
  await settled();
  await nav('Ana Sayfa');
  await metric('Net kâr').getByText('+₺8.000,00', { exact: true }).waitFor();
  await nav('Finans ve Raporlar');
  await expectSummary(page, 'Net kâr', '+₺8.000,00');
  await expectSummary(page, 'Net kâr/zarar marjı', '16%');
  await setMonth(page, '2025-01');
  await page.getByRole('alert').filter({ hasText: 'Sentetik rapor hatası' }).waitFor();
  assert.equal(await page.locator('.summary-grid:visible').count(), 0);
  await setMonth(page, '2026-09');
  await setMonth(page, '2026-10');
  await settled();
  await page.waitForTimeout(1100);
  await expectSummary(page, 'Net kâr', '+₺8.000,00');

  await nav('Giderler');
  await add('Tamir', '10000');
  await nav('Ana Sayfa');
  await metric('Net zarar').getByText('-₺2.000,00', { exact: true }).waitFor();
  await nav('Giderler');
  const search = page.getByRole('textbox', { name: 'Gider adına göre ara…', exact: true });
  await search.focus();
  await page.keyboard.type('Araç', { delay: 180 });
  await settled();
  assert.equal(await search.inputValue(), 'Araç');
  assert.ok(await search.evaluate((e) => document.activeElement === e));
  assert.equal(await page.getByRole('row').filter({ hasText: 'Araç mazotu' }).count(), 1);
  let row = page.getByRole('row').filter({ hasText: 'Araç mazotu' });
  await menu(row, 'Düzelt', true);
  await page.getByLabel('Giderin adı', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Giderin adı', { exact: true }).inputValue(), 'Araç mazotu');
  assert.equal(await page.getByLabel('Ödeme yöntemi', { exact: true }).inputValue(), 'Kart');
  await page.getByLabel('Tutar (TL)', { exact: true }).fill('1500');
  await page.getByLabel('Düzeltme gerekçesi').fill('Fiş tutarı hatalı');
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.getByRole('button', { name: 'Düzeltmeyi onayla', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await settled();
  assert.equal((await snap()).summary.expenses, 2150000);
  await search.fill('');
  await settled();
  row = page.getByRole('row').filter({ hasText: 'Elektrik' }).filter({ hasText: 'Ödendi' });
  await menu(row, 'Görüntüle');
  await page.getByRole('dialog').getByText('Ödeme yöntemi: Banka', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  row = page.getByRole('row').filter({ hasText: 'Tamir' }).filter({ hasText: 'Ödendi' });
  await menu(row, 'İptal et');
  await page.getByRole('alertdialog').getByLabel('İptal / iade gerekçesi').fill('Yanlış gider');
  await page.getByRole('button', { name: 'İptali onayla', exact: true }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  await settled();
  assert.equal((await snap()).summary.expenses, 1150000);
  row = page.getByRole('row').filter({ hasText: 'Kira' }).filter({ hasText: 'Ödendi' });
  await menu(row, 'Gider iadesi al');
  await page.getByLabel('İade tarihi', { exact: true }).fill('01.11.2026');
  await page.getByLabel('İade gerekçesi', { exact: true }).fill('Kira geri ödendi');
  await page.getByRole('button', { name: 'İadeyi kaydet', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await settled();
  await setMonth(page, '2026-11');
  await settled();
  await metric('Seçili dönem gideri').getByText('-₺8.000,00', { exact: true }).waitFor();
  await page
    .getByRole('row')
    .filter({ hasText: 'Gider iadesi' })
    .getByText('Kira', { exact: true })
    .waitFor();
  await nav('Finans ve Raporlar');
  await expectSummary(page, 'Net kâr/zarar marjı', 'Hesaplanamıyor');
  await expectSummary(page, 'Net kâr', '+₺8.000,00');
  await page.getByRole('tab', { name: 'Yıllık karşılaştırma', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Ekim' }).waitFor();
  await nav('Giderler');
  await setMonth(page, '2026-10');
  await settled();
  // Draft survives a rejected request; reopening starts empty; sync lock prevents double dispatch.
  await page.getByRole('button', { name: 'Gider ekle', exact: true }).click();
  await page.getByLabel('Giderin adı', { exact: true }).fill('Hata taslağı');
  await page.getByLabel('Tutar (TL)', { exact: true }).fill('0');
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Giderin adı', { exact: true }).inputValue(), 'Hata taslağı');
  await discard(page);
  await page.getByRole('button', { name: 'Gider ekle', exact: true }).click();
  assert.equal(await page.getByLabel('Giderin adı', { exact: true }).inputValue(), '');
  await page.getByLabel('Giderin adı', { exact: true }).fill('Çift gönderim');
  await page.getByLabel('Tutar (TL)', { exact: true }).fill('10');
  await page
    .getByRole('dialog')
    .locator('form')
    .evaluate((f) => {
      f.requestSubmit();
      f.requestSubmit();
    });
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal((await snap()).summary.expenses, 351000);
  for (const [w, h] of [
    [860, 640],
    [1280, 800],
    [1600, 1000],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size),
      [w, h],
    );
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.getByRole('button', { name: 'Gider ekle', exact: true }).click();
    await page.getByLabel('Giderin adı', { exact: true }).fill('Çok uzun gider adı '.repeat(10));
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Kaydet', exact: true })
      .scrollIntoViewIfNeeded();
    const box = await page.getByRole('dialog').boundingBox();
    const screen = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= screen.w + 1 &&
        box.y + box.height <= screen.h + 1,
    );
    await discard(page);
  }
  const backup = path.join(root, 'expense-backup.db');
  await nav('Ayarlar');
  await app.evaluate(({ dialog }, backup) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: backup });
  }, backup);
  await page.getByRole('button', { name: 'Yedek Oluştur', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Yedek oluşturuldu:' }).waitFor();
  const saved = await snap();
  await run({ type: 'expense', name: 'Yedekten sonra', amount: 1000, method: 'Nakit', note: '' });
  await app.evaluate(({ dialog }, backup) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [backup] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, backup);
  await page.getByRole('button', { name: 'Yedekten Geri Yükle', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Geri yükleme tamamlandı.' }).waitFor();
  assert.deepEqual((await snap()).summary, saved.summary);
  await app.close();
  app = null;
  await launch();
  assert.deepEqual((await snap()).summary, saved.summary);
  await nav('Giderler');
  await shortcut(page, 'Tüm zamanlar');
  await settled();
  assert.deepEqual(errors, []);
  fs.mkdirSync('artifacts/expenses', { recursive: true });
  await page.screenshot({
    path:
      'artifacts/expenses/final-' +
      (packaged ? 'packaged' : 'source') +
      '-' +
      (process.env.SUCUKCENTER_EXPENSES_SCALE || '1') +
      '.png',
  });
  console.log(
    'PASS expenses real Electron packaged=' +
      packaged +
      ': offline forms, 50k/30k/12k/8k16%, loss, context edit/cancel, dated refund, annual, focus, error draft, double submit, 3 sizes, backup/restore/reopen; fake Documents only',
  );
})()
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
    fs.mkdirSync('artifacts/expenses', { recursive: true });
    if (page) await page.screenshot({ path: 'artifacts/expenses/failure.png' }).catch(() => {});
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(root).startsWith(prefix),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
