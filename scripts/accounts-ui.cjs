const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { shortcut, displayDay } = require('./ui-helpers.cjs');
const packaged = process.env.SUCUKCENTER_ACCOUNTS_PACKAGED === '1';
const rootPrefix = packaged ? 'sucukcenter-review-' : 'sucukcenter-accounts-ui-';
const root = mkdtempSync(path.join(os.tmpdir(), rootPrefix));
mkdirSync('artifacts/accounts', { recursive: true });
const env = { ...process.env, SUCUKCENTER_TEST: '1', SUCUKCENTER_TEST_DOCUMENTS: root };
if (packaged) env.SUCUKCENTER_REVIEW_ROOT = root;
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
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('heading', { name: 'İşletme Özeti', exact: true }).waitFor();
  await page.context().setOffline(true);
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), packaged);
}
async function run(c) {
  const r = await page.evaluate(
    (c) => window.desktop.execute(c),
    ['product', 'customer', 'supplier'].includes(c.type) ? c : { operationId: randomUUID(), ...c },
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
  await page.getByRole('button', { name: 'Hesabı aç', exact: true }).click();
  await page.getByRole('button', { name: 'Tahsilat al', exact: true }).waitFor();
}
async function form(action, title) {
  if (['Borç ekle', 'Alacak ekle'].includes(action)) {
    const d = page.locator('details.account-actions');
    if ((await d.getAttribute('open')) === null) await d.locator('summary').click();
  }
  await page.getByRole('button', { name: action, exact: true }).click();
  if (action === 'Alacak ekle')
    await page.getByRole('button', { name: 'Para alacağı', exact: true }).click();
  return page.getByRole('dialog', { name: title || action, exact: true });
}
async function save(d) {
  await d.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await d.waitFor({ state: 'hidden' });
}
async function expectBalance(value) {
  assert.equal((await snapshot()).customers[0].balance, value);
}
(async () => {
  await launch();
  const p = await run({
    type: 'product',
    name: 'Cari Test Sucuk',
    unit: 'Kg',
    price: 10000,
    critical: 0,
    active: true,
  });
  const s = await run({
    type: 'supplier',
    name: 'Cari Test Tedarikçi',
    address: '',
    phone: '',
    contact: '',
  });
  const c = await run({
    type: 'customer',
    name: 'Cari Test Büfe',
    address: '',
    phone: '',
    contact: '',
  });
  await run({
    type: 'purchase',
    supplierId: s,
    lines: [{ productId: p, quantity: 20000, price: 1000 }],
    paid: false,
    note: '',
    occurredOn: '2026-01-01',
  });
  await account();
  await shortcut(page, 'Tüm zamanlar');
  let d = await form('Borç ekle');
  await d.getByLabel('Tutar (TL)', { exact: true }).fill('1000');
  await d.getByLabel('İşlem tarihi', { exact: true }).fill(displayDay('2026-01-10'));
  await d.getByLabel('Açıklama', { exact: true }).fill('Geçiş borcu');
  await d.getByLabel('Belge / referans numarası', { exact: true }).fill('DEV-UI');
  await save(d);
  await expectBalance(100000);
  let snap = await snapshot();
  assert.equal(snap.summary.cash, 0);
  assert.equal(snap.summary.revenue, 0);
  assert.equal(snap.products[0].stock, 20000);
  d = await form('Tahsilat al', 'Tahsilat kaydet');
  await d.getByLabel('Tutar (TL)', { exact: true }).fill('1500');
  await d.getByText('+500,00 TL · Müşteri alacaklı', { exact: true }).waitFor();
  await d.getByText(/müşteri avansı olarak kalacak/).waitFor();
  await page.screenshot({ path: 'artifacts/accounts/advance-preview.png' });
  await save(d);
  await expectBalance(-50000);
  d = await form('Yeni satış', 'Yeni müşteri satışı');
  const product = d.getByRole('combobox', { name: 'Ürün 1', exact: true });
  await product.fill('Cari Test');
  await page.getByRole('option', { name: 'Cari Test Sucuk (Kg)', exact: true }).click();
  await d.getByLabel('Miktar (Kg)', { exact: true }).fill('2');
  await d.getByRole('button', { name: 'Satışı tamamla', exact: true }).click();
  await d.waitFor({ state: 'hidden' });
  await expectBalance(-30000);
  assert.equal((await snapshot()).products[0].stock, 18000);
  d = await form('Para iadesi yap', 'Müşteriye para iadesi');
  await d.getByLabel('Tutar (TL)', { exact: true }).fill('300');
  await d.getByLabel('Açıklama', { exact: true }).fill('Avansın kalanı');
  await save(d);
  await expectBalance(0);
  d = await form('Tahsilat al', 'Tahsilat kaydet');
  await d.getByLabel('Tutar (TL)', { exact: true }).fill('750');
  await d.getByText('+750,00 TL · Müşteri alacaklı', { exact: true }).waitFor();
  await save(d);
  await expectBalance(-75000);
  d = await form('Alacak ekle');
  await d.getByLabel('Tutar (TL)', { exact: true }).fill('400');
  await d.getByLabel('Açıklama', { exact: true }).fill('Doğrudan alacak');
  await save(d);
  await expectBalance(-115000);
  assert.equal((await snapshot()).summary.cash, 195000);
  // Open the actual statement detail and use the reasoned reversal dialog.
  await page.getByRole('button', { name: /^Cari alacak ekleme #/ }).click();
  d = page.getByRole('dialog', { name: 'Cari alacak ekleme bilgileri', exact: true });
  await d.getByRole('button', { name: 'İşlemi iptal et', exact: true }).click();
  const rev = page.getByRole('alertdialog');
  await rev.getByLabel('İptal / iade gerekçesi', { exact: true }).fill('Hatalı cari alacak');
  await rev.getByRole('button', { name: 'İptali onayla', exact: true }).click();
  await rev.waitFor({ state: 'hidden' });
  await expectBalance(-75000);
  // Duplicate delivery on IPC, historical period and CSV through real main-process handlers.
  const input = {
    type: 'customer_credit',
    customerId: c,
    amount: 40000,
    note: 'Tekrarlanabilir',
    occurredOn: '2026-02-02',
    operationId: randomUUID(),
  };
  const id = await run(input);
  assert.equal(await run(input), id);
  await expectBalance(-115000);
  const st = await page.evaluate(
    (customerId) =>
      window.desktop.statement({ customerId, range: { start: '2026-01-01', end: '2026-01-31' } }),
    c,
  );
  assert.ok(st.ok, st.error);
  assert.equal(st.data.closing, 100000);
  const csvFile = path.join(root, 'statement.csv');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, csvFile);
  const csv = await page.evaluate(
    (customerId) => window.desktop.exportCustomer({ customerId, range: {} }),
    c,
  );
  assert.ok(csv.ok, csv.error);
  assert.ok(require('node:fs').readFileSync(csvFile, 'utf8').includes('DEV-UI'));
  const backup = path.join(root, 'backup.db');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, backup);
  assert.ok((await page.evaluate(() => window.desktop.backup())).ok);
  await run({
    type: 'customer_debt',
    customerId: c,
    amount: 12345,
    category: 'other',
    note: 'Yedek sonrası',
  });
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBox = async () => ({ response: 1 });
  }, backup);
  const restored = await page.evaluate(() => window.desktop.restore());
  assert.ok(restored.ok, restored.error);
  await expectBalance(-115000);
  await app.close();
  app = null;
  await launch();
  await expectBalance(-115000);
  assert.deepEqual(errors, []);
  await account();
  await shortcut(page, 'Tüm zamanlar');
  await page.screenshot({ path: 'artifacts/accounts/statement.png' });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 640));
  await page.locator('details.account-actions summary').click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: 'artifacts/accounts/narrow-account.png' });
  const one = await run({
    type: 'customer_debt',
    customerId: c,
    amount: 10000,
    category: 'other',
    note: 'İptal testi',
  });
  await run({ type: 'reverse', entity: 'customer_debt', id: one, reason: 'Test borç iptali' });
  await expectBalance(-115000);
  const pay = await run({
    type: 'collection',
    customerId: c,
    amount: 10000,
    method: 'Nakit',
    note: 'İptal testi',
  });
  await run({ type: 'reverse', entity: 'collection', id: pay, reason: 'Test tahsilat iptali' });
  await expectBalance(-115000);
  let last;
  for (let i = 0; i < 55; i++)
    last = await run({
      type: 'customer',
      name: `AAA Lookup ${String(i).padStart(3, '0')}`,
      address: '',
      contact: '',
      phone: '',
    });
  await run({
    type: 'customer_debt',
    customerId: last,
    amount: 12300,
    category: 'other',
    note: 'Sayfalama dışı bakiye',
  });
  const lookup = await page.evaluate(
    (selected) => window.desktop.lookup({ kind: 'customers', search: '', selected }),
    last,
  );
  assert.ok(lookup.ok, lookup.error);
  assert.equal(lookup.data.find((p) => p.id === last)?.balance, 12300);
  assert.deepEqual(errors, []);
  console.log(
    `PASS: gerçek Electron packaged=${packaged} offline • cari formlar/avans önizleme/satış/iade • gerekçeli iptal • IPC mükerrer koruması • aylık ekstre/CSV • yedek/geri yükleme/yeniden açılış; renderer hatası 0`,
  );
})()
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
    if (page) await page.screenshot({ path: 'artifacts/accounts/failure.png' }).catch(() => {});
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(root).startsWith(rootPrefix),
    );
    rmSync(root, { recursive: true, force: true });
  });
