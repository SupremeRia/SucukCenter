const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-review-'));
const env = { ...process.env, SUCUKCENTER_REVIEW_ROOT: root };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = path.resolve(
  'review-builds/runtime-test/win-unpacked/SucukCenterReview.exe',
);
let app;
let page;
async function launch() {
  app = await _electron.launch({ executablePath, env, timeout: 30000 });
  page = await require('./electron-test-window.cjs').mainWindow(app);
  page.setDefaultTimeout(20000);
  await page.getByRole('heading', { name: 'İşletme Özeti' }).waitFor();
  const runtime = await app.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    documents: app.getPath('documents'),
  }));
  assert.equal(runtime.packaged, true);
  assert.equal(runtime.documents, root);
  await page.context().setOffline(true);
}
async function command(c) {
  const r = await page.evaluate(
    (c) => window.desktop.execute(c),
    ['product', 'customer', 'supplier', 'settings'].includes(c.type)
      ? c
      : { ...c, operationId: require('node:crypto').randomUUID() },
  );
  assert.ok(r.ok, r.error);
  return r.data;
}
async function snapshot() {
  const r = await page.evaluate(() => window.desktop.snapshot());
  assert.ok(r.ok, r.error);
  assert.ok(r.data.dbPath.startsWith(root));
  return r.data;
}
async function chooseBackup(file, confirm = true) {
  await app.evaluate(
    ({ dialog }, { file, confirm }) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      dialog.showMessageBox = async () => ({ response: confirm ? 1 : 0, checkboxChecked: false });
    },
    { file, confirm },
  );
  return page.evaluate(() => window.desktop.restore());
}
(async () => {
  await launch();
  const product = await command({
    type: 'product',
    name: 'Sentetik Sucuk',
    unit: 'Kg',
    price: 3500,
    critical: 0,
    active: true,
  });
  const supplier = await command({
    type: 'supplier',
    name: 'Sentetik Tedarikçi',
    address: '',
    contact: '',
    phone: '',
  });
  const customer = await command({
    type: 'customer',
    name: 'Sentetik Ahmet Büfe',
    address: '',
    contact: '',
    phone: '',
  });
  await command({
    type: 'purchase',
    supplierId: supplier,
    lines: [{ productId: product, quantity: 5000000, price: 2500 }],
    paid: false,
    note: '',
  });
  await command({
    type: 'sale',
    customerId: customer,
    lines: [{ productId: product, quantity: 3000, price: 3500 }],
    note: '',
  });
  const backup = path.join(root, 'manual.db');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, backup);
  assert.ok((await page.evaluate(() => window.desktop.backup())).ok);
  await command({
    type: 'collection',
    customerId: customer,
    amount: 4000,
    method: 'Nakit',
    note: '',
  });
  let s = await snapshot();
  assert.equal(s.products[0].stock, 4997000);
  assert.equal(s.summary.profit, 3000);
  assert.equal(s.summary.debt, 6500);
  await app.close();
  app = null;
  await launch();
  assert.equal((await snapshot()).summary.debt, 6500);
  assert.equal((await chooseBackup(backup, false)).data, null);
  const restored = await chooseBackup(backup);
  assert.ok(restored.ok, restored.error);
  assert.equal((await snapshot()).summary.debt, 10500);
  assert.ok((await chooseBackup(restored.data)).ok);
  assert.equal((await snapshot()).summary.debt, 6500);
  const bad = path.join(root, 'corrupt.db');
  writeFileSync(bad, 'invalid');
  assert.equal((await chooseBackup(bad)).ok, false);
  assert.equal((await snapshot()).summary.debt, 6500);
  for (const label of [
    'Ürün Yönetimi',
    'Depo ve Stok',
    'Gelen Siparişler',
    'Müşteriler',
    'Müşteri Satışları',
    'Tahsilatlar',
    'Finans ve Raporlar',
    'İşlem Geçmişi',
    'Ayarlar',
    'Ana Sayfa',
  ])
    await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();
  const historical = {
    type: 'purchase',
    operationId: require('node:crypto').randomUUID(),
    supplierId: supplier,
    lines: [{ productId: product, quantity: 5000000, price: 5000 }],
    paid: false,
    note: 'Sentetik geçmiş alış',
    occurredOn: '2026-09-01',
  };
  const preview = await page.evaluate((c) => window.desktop.preview(c), historical);
  assert.ok(preview.ok, preview.error);
  assert.equal(preview.data.required, true);
  const rejected = await page.evaluate((c) => window.desktop.execute(c), historical);
  assert.equal(rejected.ok, false);
  const accepted = await page.evaluate(({ c, token }) => window.desktop.execute(c, token), {
    c: historical,
    token: preview.data.token,
  });
  assert.ok(accepted.ok, accepted.error);
  assert.equal((await snapshot()).sales[0].cost, 11250);
  const monthly = await page.evaluate(() =>
    window.desktop.report({ start: '2026-09-01', end: '2026-09-30' }),
  );
  assert.ok(monthly.ok, monthly.error);
  assert.equal(monthly.data.grossPurchases, 25000000);
  const annual = await page.evaluate(() => window.desktop.annual(2026));
  assert.ok(annual.ok, annual.error);
  assert.equal(annual.data.length, 12);
  await app.close();
  app = null;
  await launch();
  assert.equal((await snapshot()).sales[0].cost, 11250);
  assert.equal((await snapshot()).summary.debt, 6500);
  await page.screenshot({ path: path.resolve('artifacts/07-paketli-inceleme.png') });
  console.log(
    'PASS: Paketlenmiş ayrı inceleme uygulaması: gerçek Electron/better-sqlite3, satış/tahsilat, yeniden açılış, yedek, onay/vazgeçme, geri dönüş yedeği, bozuk yedek, aylık/yıllık rapor, geçmiş maliyet önizleme/onay/red/kalıcılık, 10 ekran, çevrimdışı. Gerçek Belgeler yolu açılmadı.',
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    const target = path.resolve(root);
    assert.ok(
      target.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(target).startsWith('sucukcenter-review-'),
    );
    rmSync(target, { recursive: true, force: true });
  });
