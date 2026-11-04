const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const packaged = process.env.SUCUKCENTER_PREORDERS_PACKAGED === '1';
const prefix = packaged ? 'sucukcenter-review-' : 'sucukcenter-preorders-ui-';
const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
fs.mkdirSync('artifacts/preorders', { recursive: true });
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
    args: packaged ? [] : [path.resolve('.')],
    env,
    timeout: 30000,
  });
  page = await require('./electron-test-window.cjs').mainWindow(app);
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('heading', { name: 'İşletme Özeti', exact: true }).waitFor();
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), packaged);
  await page.context().setOffline(true);
}
async function run(c) {
  const r = await page.evaluate(
    (c) => window.desktop.execute(c),
    ['customer', 'product', 'supplier'].includes(c.type) ? c : { operationId: randomUUID(), ...c },
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
async function nav(name) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
}
async function account() {
  await nav('Müşteriler');
  await page
    .getByRole('row')
    .filter({ hasText: 'Ahmet Ön Sipariş' })
    .getByRole('button', { name: 'Hesabı aç', exact: true })
    .click();
  await page
    .locator('.preorders-panel')
    .getByRole('button', { name: 'Ürün alacağı / ön sipariş ekle', exact: true })
    .waitFor();
}
async function choose(d, label, value) {
  const input = d.getByRole('combobox', { name: label, exact: true });
  await input.fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
}
async function save(d) {
  await d.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await d.waitFor({ state: 'hidden' });
  await page
    .getByText('Ürün yükümlülükleri yükleniyor…', { exact: true })
    .waitFor({ state: 'hidden' });
}
async function newOrder(qty, price, other = false, viaCredit = false) {
  if (viaCredit) {
    const menu = page.locator('details.account-actions');
    if ((await menu.getAttribute('open')) === null) await menu.locator('summary').click();
    await menu.getByRole('button', { name: 'Alacak ekle', exact: true }).click();
    await page
      .getByRole('button', { name: 'Ürün alacağı — müşteriye teslim edilecek ürün', exact: true })
      .click();
  } else
    await page
      .locator('.preorders-panel')
      .getByRole('button', { name: 'Ürün alacağı / ön sipariş ekle', exact: true })
      .click();
  const d = page.getByRole('dialog', { name: 'Ürün alacağı / ön sipariş', exact: true });
  await choose(d, 'Ürün', 'UI Ön Sipariş Sucuk (Kg)');
  await d.getByLabel('Miktar', { exact: true }).fill(String(qty));
  if (other) await d.getByLabel('Kaynak', { exact: true }).selectOption('other');
  else await d.getByLabel('Anlaşılan birim fiyat (TL)', { exact: true }).fill(String(price));
  await d
    .getByLabel('Açıklama', { exact: true })
    .fill(other ? 'Diğer ürün borcu UI' : 'Sabit fiyat anlaşması UI');
  await d.getByLabel('Belge / referans numarası', { exact: true }).fill(`UI-${qty}-${price}`);
  await save(d);
}
function row(id) {
  return page
    .locator('.preorders-panel tbody tr')
    .filter({ has: page.getByRole('cell', { name: new RegExp(`^#${id} · Ahmet`) }) });
}
async function pay(id, amount, mode = 'new', collectionId) {
  await row(id).getByRole('button', { name: 'Ödeme bağla', exact: true }).click();
  const d = page.getByRole('dialog', { name: 'Siparişe ödeme bağla', exact: true });
  await d.getByLabel('Ödeme yolu', { exact: true }).selectOption(mode);
  if (mode === 'collection')
    await d.getByLabel('Mevcut tahsilat', { exact: true }).selectOption(String(collectionId));
  await d.getByLabel('Ödeme tutarı (TL)', { exact: true }).fill(String(amount));
  await d.getByLabel('Açıklama', { exact: true }).fill('Sipariş ödemesi UI');
  await save(d);
}
async function deliver(id, qty, note) {
  await row(id).getByRole('button', { name: 'Ürün teslim et', exact: true }).click();
  const d = page.getByRole('dialog', { name: 'Ürün teslim et', exact: true });
  await d.getByLabel('Teslim edilecek miktar', { exact: true }).fill(String(qty));
  await d.getByLabel('Açıklama', { exact: true }).fill(note);
  await save(d);
}
(async () => {
  await launch();
  const c = await run({
    type: 'customer',
    name: 'Ahmet Ön Sipariş',
    address: '',
    phone: '',
    contact: 'Ahmet',
  });
  const b = await run({
    type: 'customer',
    name: 'Zorlu Büfe',
    address: '',
    phone: '222',
    contact: 'Zeki',
  });
  const cc = await run({
    type: 'customer',
    name: 'Çınar Büfe',
    address: '',
    phone: '111',
    contact: 'Çiğdem',
  });
  await run({
    type: 'customer_debt',
    customerId: b,
    amount: 100000,
    category: 'other',
    note: 'Sıralama borcu',
  });
  await run({
    type: 'customer_debt',
    customerId: cc,
    amount: 300000,
    category: 'other',
    note: 'Sıralama borcu',
  });
  const p = await run({
    type: 'product',
    name: 'UI Ön Sipariş Sucuk',
    unit: 'Kg',
    price: 25000,
    critical: 0,
    active: true,
  });
  const supplier = await run({
    type: 'supplier',
    name: 'UI Ön Sipariş Tedarikçi',
    address: '',
    phone: '',
    contact: '',
  });
  await nav('Müşteriler');
  await page
    .getByRole('columnheader')
    .getByRole('button', { name: /^Kalan borç/ })
    .click();
  await page
    .getByRole('columnheader', { name: /Kalan borç/ })
    .filter({ has: page.locator('button') })
    .waitFor();
  await page.getByText('Borç: büyükten küçüğe', { exact: false }).waitFor();
  await page.locator('tbody tr').first().getByText('Çınar Büfe', { exact: true }).waitFor();
  await page
    .getByRole('columnheader')
    .getByRole('button', { name: /^Kalan borç/ })
    .click();
  await page.getByText('Borç: küçükten büyüğe', { exact: false }).waitFor();
  await page.locator('tbody tr').first().getByText('Ahmet Ön Sipariş', { exact: true }).waitFor();
  await page
    .getByRole('columnheader')
    .getByRole('button', { name: /^Firma adı/ })
    .click();
  await page.locator('th[aria-sort="ascending"]').waitFor();
  await page
    .getByRole('columnheader')
    .getByRole('button', { name: /^Firma adı/ })
    .click();
  await page.locator('th[aria-sort="descending"]').waitFor();
  await page.locator('tbody tr').first().getByText('Zorlu Büfe', { exact: true }).waitFor();
  for (const field of ['Yetkili', 'Telefon']) {
    await page
      .getByRole('columnheader')
      .getByRole('button', { name: new RegExp('^' + field) })
      .click();
    await page.locator('th[aria-sort="ascending"]').waitFor();
    await page
      .getByRole('columnheader')
      .getByRole('button', { name: new RegExp('^' + field) })
      .click();
    await page.locator('th[aria-sort="descending"]').waitFor();
  }
  await account();
  await newOrder(100, 250, false, true);
  await pay(1, 25000);
  let s = await snapshot();
  assert.equal(s.products[0].stock, 0);
  assert.equal(s.customers.find((p) => p.id === c).balance, 0);
  assert.equal(s.summary.cash, 2500000);
  assert.equal(s.summary.revenue, 0);
  await row(1).getByText('Ödendi', { exact: true }).waitFor();
  await page.screenshot({ path: 'artifacts/preorders/zero-stock-prepaid.png' });
  await run({
    type: 'product',
    id: p,
    name: 'UI Ön Sipariş Sucuk',
    unit: 'Kg',
    price: 30000,
    critical: 0,
    active: true,
  });
  await run({
    type: 'purchase',
    supplierId: supplier,
    lines: [{ productId: p, quantity: 100000, price: 10000 }],
    paid: false,
    note: '100kg geldi',
  });
  assert.equal((await snapshot()).products[0].stock, 100000);
  await nav('Bekleyen Teslimatlar');
  await row(1).getByRole('cell').filter({ hasText: '₺250,00/Kg' }).waitFor();
  await row(1).getByRole('cell').nth(2).getByText('100 Kg', { exact: true }).waitFor();
  await deliver(1, 40, 'UI40');
  s = await snapshot();
  assert.equal(s.products[0].stock, 60000);
  assert.equal(s.summary.cash, 2500000);
  assert.equal(s.customers.find((p) => p.id === c).balance, 0);
  await row(1).getByText('Kısmen teslim edildi', { exact: true }).waitFor();
  await page.screenshot({ path: 'artifacts/preorders/partial-delivery.png' });
  await deliver(1, 60, 'UI60');
  assert.equal((await snapshot()).summary.revenue, 2500000);
  await account();
  await newOrder(5, 0, true);
  s = await snapshot();
  assert.equal(s.customers.find((p) => p.id === c).balance, 0);
  assert.equal(s.summary.cash, 2500000);
  await run({
    type: 'purchase',
    supplierId: supplier,
    lines: [{ productId: p, quantity: 25000, price: 10000 }],
    paid: false,
    note: 'Diğer stok',
  });
  await account();
  await deliver(2, 5, 'Diğer ürün UI');
  assert.equal((await snapshot()).summary.revenue, 2500000);
  await newOrder(10, 300);
  await pay(3, 1000);
  await row(3).getByText('Kısmen ödendi', { exact: true }).waitFor();
  const existingCollection = await run({
    type: 'collection',
    customerId: c,
    amount: 200000,
    method: 'Nakit',
    note: 'Mevcut avans',
  });
  await account();
  const cash = (await snapshot()).summary.cash;
  await pay(3, 2000, 'advance');
  assert.equal((await snapshot()).summary.cash, cash);
  await deliver(3, 1, 'Üçüncü sipariş');
  await row(3).getByRole('button', { name: 'Kalanı iptal et', exact: true }).click();
  let d = page.getByRole('dialog', { name: 'Teslim edilmemiş kısmı iptal et', exact: true });
  await d.getByLabel('Açıklama', { exact: true }).fill('Kalan 9kg iptal');
  await save(d);
  assert.equal((await snapshot()).customers.find((p) => p.id === c).balance, -270000);
  await row(1).getByRole('button', { name: 'Sipariş hareketleri', exact: true }).click();
  await page
    .locator('.preorder-event')
    .filter({ hasText: 'UI40' })
    .getByRole('button', { name: 'Fiziksel iade', exact: true })
    .click();
  d = page.getByRole('dialog', { name: 'Teslimatı fiziksel iadeyle geri al', exact: true });
  await d.getByLabel('Ürün fiziksel olarak geri alındı', { exact: true }).check();
  await d.getByLabel('Açıklama', { exact: true }).fill('Gerçek ürün geri döndü UI');
  await save(d);
  s = await snapshot();
  assert.equal(s.products[0].stock, 59000);
  assert.equal(s.summary.revenue, 1530000);
  const backup = path.join(root, 'preorders-backup.db');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, backup);
  const backupResult = await page.evaluate(() => window.desktop.backup());
  assert.ok(backupResult.ok, backupResult.error);
  await run({
    type: 'preorder',
    customerId: c,
    productId: p,
    quantity: 1000,
    price: 30000,
    source: 'other',
    note: 'Yedek sonrası',
  });
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBox = async () => ({ response: 1 });
  }, backup);
  const restored = await page.evaluate(() => window.desktop.restore());
  assert.ok(restored.ok, restored.error);
  await app.close();
  app = null;
  await launch();
  const reopened = await snapshot();
  assert.deepEqual(reopened.preorders, s.preorders);
  assert.deepEqual(reopened.products, s.products);
  assert.equal(reopened.customers.find((p) => p.id === c).balance, -270000);
  await account();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 640));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: 'artifacts/preorders/narrow-customer.png' });
  await newOrder(1, 300);
  const beforeLink = await snapshot();
  await pay(4, 300, 'collection', existingCollection);
  const linked = await snapshot();
  assert.equal(linked.summary.cash, beforeLink.summary.cash);
  assert.equal(linked.customers.find((p) => p.id === c).balance, -240000);
  assert.deepEqual(errors, []);
  console.log(
    `PASS: gerçek Electron packaged=${packaged} • başlık sıralaması • ürün alacağı seçimi • stoksuz ön ödeme/fiyat sabitleme/40+60 teslim • diğer ürün borcu • kısmi ödeme/mevcut avans • kalan iptali/fiziksel iade • backup/restore/restart • dar pencere • offline; renderer errors=0`,
  );
})()
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
    if (page) await page.screenshot({ path: 'artifacts/preorders/failure.png' }).catch(() => {});
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(root).startsWith(prefix),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
