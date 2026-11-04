const { _electron } = require('playwright');
const {
  setMonth,
  shortcut,
  periodPopup,
  expectSummary,
  discard,
  displayDay,
} = require('./ui-helpers.cjs');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, rmSync, readFileSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const root = mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-monthly-ui-'));
const artifacts = path.resolve('artifacts');
mkdirSync(artifacts, { recursive: true });
const env = { ...process.env, SUCUKCENTER_TEST: '1', SUCUKCENTER_TEST_DOCUMENTS: root };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
async function launch() {
  app = await _electron.launch({
    executablePath: require('electron'),
    args: [path.resolve('.')],
    env,
    timeout: 30000,
  });
  page = await require('./electron-test-window.cjs').mainWindow(app);
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('heading', { name: 'İşletme Özeti' }).waitFor();
  await page.context().setOffline(true);
}
async function nav(name) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
}
async function run(c) {
  const input = ['product', 'customer', 'supplier'].includes(c.type)
    ? c
    : { ...c, operationId: randomUUID() };
  const r = await page.evaluate((c) => window.desktop.execute(c), input);
  assert.ok(r.ok, r.error);
  return r.data;
}
async function choose(label, value) {
  const i = page.getByRole('combobox', { name: label, exact: true });
  await i.fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
}
async function snap() {
  const r = await page.evaluate(() => window.desktop.snapshot());
  assert.ok(r.ok, r.error);
  return r.data;
}
(async () => {
  await launch();
  const p = await run({
    type: 'product',
    name: 'Rapor Sucuk',
    unit: 'Kg',
    price: 10000,
    critical: 0,
    active: true,
  });
  const supplier = await run({
    type: 'supplier',
    name: 'Rapor Tedarikçi',
    address: '',
    contact: '',
    phone: '',
  });
  const customer = await run({
    type: 'customer',
    name: 'Rapor Müşteri',
    address: '',
    contact: '',
    phone: '',
  });
  await run({
    type: 'purchase',
    supplierId: supplier,
    lines: [{ productId: p, quantity: 100000, price: 1000 }],
    paid: false,
    note: '',
    occurredOn: '2026-07-01',
  });
  await run({
    type: 'sale',
    customerId: customer,
    lines: [{ productId: p, quantity: 1000, price: 10000 }],
    note: '',
    occurredOn: '2026-07-15',
  });
  await run({
    type: 'sale',
    customerId: customer,
    lines: [{ productId: p, quantity: 3000, price: 10000 }],
    note: '',
    occurredOn: '2026-08-15',
  });
  await run({
    type: 'collection',
    customerId: customer,
    amount: 15000,
    method: 'Nakit',
    note: '',
    occurredOn: '2026-08-20',
  });
  await run({
    type: 'collection',
    customerId: customer,
    amount: 5000,
    method: 'Nakit',
    note: '',
    occurredOn: '2026-09-01',
  });
  await nav('Müşteriler');
  await page.getByRole('button', { name: 'Hesabı aç', exact: true }).click();
  await setMonth(page, '2026-08');
  await expectSummary(page, 'Dönem sonu bakiye', '250,00 TL · Müşteri borçlu');
  await expectSummary(page, 'Bugünkü güncel bakiye', '200,00 TL · Müşteri borçlu');
  await page.getByText('Rapor Sucuk · 3 Kg', { exact: false }).waitFor();
  await page.screenshot({ path: path.join(artifacts, '09-aylik-musteri.png') });
  const csv = path.join(root, 'aylik.csv');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, csv);
  await page.getByRole('button', { name: 'CSV müşteri ekstresi', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'CSV ekstresi kaydedildi.' }).waitFor();
  const text = readFileSync(csv, 'utf8');
  assert.ok(text.includes('Rapor Müşteri'));
  assert.ok(text.includes('Rapor Sucuk'));
  assert.ok(text.includes('"Kapanış bakiyesi";"250,00"'));
  assert.ok(text.includes('"Bugünkü güncel bakiye";"200,00"'));
  await setMonth(page, '2026-09');
  await expectSummary(page, 'Dönem başı bakiye', '250,00 TL · Müşteri borçlu');
  await expectSummary(page, 'Dönem sonu bakiye', '200,00 TL · Müşteri borçlu');
  await shortcut(page, 'Bu ay');
  await page.getByText('Ay devam ediyor', { exact: true }).waitFor();
  await nav('Gelen Siparişler');
  await page.getByRole('button', { name: 'Gelen sipariş ekle', exact: true }).click();
  const dialog = page.getByRole('dialog');
  assert.equal(
    await dialog.getByLabel('İşlem tarihi', { exact: true }).inputValue(),
    displayDay(
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date()),
    ),
  );
  await choose('Tedarikçi', 'Rapor Tedarikçi');
  await choose('Ürün 1', 'Rapor Sucuk (Kg)');
  await dialog.getByLabel('Miktar (Kg)', { exact: true }).fill('10');
  await dialog.getByLabel('Birim fiyat (TL)', { exact: true }).fill('20');
  await dialog.getByLabel('İşlem tarihi', { exact: true }).fill('01.08.2026');
  const before = await snap();
  await dialog.getByRole('button', { name: 'Depoya giriş yap', exact: true }).click();
  await page.getByRole('heading', { name: 'Geçmiş tarihli işlemin maliyet etkisi' }).waitFor();
  await page.screenshot({ path: path.join(artifacts, '10-gecmis-maliyet-onayi.png') });
  await page.getByRole('button', { name: 'Kaydetmeden geri dön', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'onaylanmadı' }).waitFor();
  assert.equal(await dialog.getByLabel('İşlem tarihi', { exact: true }).inputValue(), '01.08.2026');
  assert.equal((await snap()).products[0].stock, before.products[0].stock);
  await dialog.getByRole('button', { name: 'Depoya giriş yap', exact: true }).click();
  await page
    .getByRole('button', { name: 'Maliyet etkisini onayla ve kaydet', exact: true })
    .click();
  await dialog.waitFor({ state: 'hidden' });
  let s = await snap();
  assert.equal(s.products[0].stock, 106000);
  assert.equal(s.purchases.length, 2);
  assert.equal(s.customers[0].balance, 20000);
  assert.equal(s.sales.find((d) => d.id === 2).cost, 3275);
  await nav('Finans ve Raporlar');
  await setMonth(page, '2026-08');
  await expectSummary(page, 'Mal alış bedeli', '₺200,00');
  await page.getByRole('tab', { name: 'Maliyet revizyonları', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Son 50 onaylı maliyet revizyonu', exact: true })
    .waitFor();
  await page.getByRole('tab', { name: 'Yıllık karşılaştırma', exact: true }).click();
  await page.getByRole('heading', { name: '2026 · Ocak–Aralık özeti', exact: true }).waitFor();
  const july = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Temmuz', exact: true }) });
  await july.getByRole('button', { name: 'Ayrıntı', exact: true }).click();
  await page.getByRole('button', { name: 'Dönem seç: Temmuz 2026', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Aylık özet', exact: true }).click();
  await expectSummary(page, 'Mal alış bedeli', '₺1.000,00');
  await setMonth(page, '2024-02');
  const period = await periodPopup(page);
  await period.getByRole('button', { name: 'Tarih aralığı', exact: true }).click();
  assert.equal(await period.getByLabel('Bitiş tarihi', { exact: true }).inputValue(), '29.02.2024');
  await period.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  await setMonth(page, '2024-01');
  await page.getByRole('button', { name: 'Dönem seç: Ocak 2024', exact: true }).waitFor();
  await setMonth(page, '2024-02');
  await page.getByRole('button', { name: 'Dönem seç: Şubat 2024', exact: true }).waitFor();
  await setMonth(page, '2026-08');
  await page.screenshot({ path: path.join(artifacts, '11-aylik-finans.png') });
  await nav('Müşteri Satışları');
  await page.getByRole('button', { name: 'Yeni satış', exact: true }).click();
  await choose('Müşteri', 'Rapor Müşteri');
  await choose('Ürün 1', 'Rapor Sucuk (Kg)');
  await dialog.getByLabel('İşlem tarihi', { exact: true }).fill('15.06.2026');
  await dialog.getByRole('button', { name: 'Satışı tamamla', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'tarihsel stok' }).waitFor();
  assert.equal(await dialog.getByLabel('İşlem tarihi', { exact: true }).inputValue(), '15.06.2026');
  await page.screenshot({ path: path.join(artifacts, '12-tarihsel-stok-hatasi.png') });
  await discard(page);
  await app.close();
  app = null;
  await launch();
  s = await snap();
  assert.equal(s.products[0].stock, 106000);
  assert.equal(s.customers[0].balance, 20000);
  assert.ok(s.dbPath.startsWith(root));
  assert.deepEqual(errors, []);
  console.log(
    'PASS: gerçek Electron • aylık müşteri devir250/güncel200 • CSV • ay/yıl/artık yıl • yıllık ayrıntı • tarih varsayılanı • maliyet onayı/vazgeçme/tarih koruma • stok hata geri alma • yeniden açılış • offline',
  );
})()
  .catch(async (e) => {
    console.error(e);
    if (page)
      await page.screenshot({ path: path.join(artifacts, 'monthly-failure.png') }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    const safe = path.resolve(root);
    assert.ok(
      safe.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(safe).startsWith('sucukcenter-monthly-ui-'),
    );
    rmSync(safe, { recursive: true, force: true });
  });
