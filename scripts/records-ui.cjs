const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { randomUUID } = require('node:crypto');
const packaged = process.env.SUCUKCENTER_RECORDS_PACKAGED === '1';
const prefix = packaged ? 'sucukcenter-review-' : 'sucukcenter-records-ui-';
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
fs.mkdirSync('artifacts/records', { recursive: true });
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
  return r.data;
}
async function nav(name) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
}
async function settled() {
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
}
async function assertFocus(input, value) {
  assert.deepEqual(
    await input.evaluate((e) => ({ value: e.value, focused: document.activeElement === e })),
    { value, focused: true },
  );
}
async function menu(row, name, mode = 'button') {
  if (mode === 'right') await row.click({ button: 'right' });
  else if (mode === 'keyboard') {
    await row.focus();
    await page.keyboard.press('Shift+F10');
  } else await row.getByRole('button', { name: 'Kayıt işlemleri', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
async function discard() {
  await page.getByRole('dialog').getByRole('button', { name: 'Vazgeç', exact: true }).click();
  const guard = page.getByRole('alertdialog', { name: 'Değişiklikler kaydedilmedi', exact: true });
  if (await guard.isVisible())
    await guard.getByRole('button', { name: 'Değişiklikleri bırak', exact: true }).click();
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
    timeout: 30000,
  });
  page = await require('./electron-test-window.cjs').mainWindow(app);
  page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.error('RENDERER', e.message);
  });
  await page.getByRole('heading', { name: 'İşletme Özeti', exact: true }).waitFor();
  await page.context().setOffline(true);
  const p = await run({
    type: 'product',
    name: 'Sahte Sucuk',
    unit: 'Kg',
    price: 3500,
    critical: 0,
    active: true,
  });
  const customer = await run({
    type: 'customer',
    name: 'Ahmet Test',
    address: 'Test Adresi',
    contact: 'Ahmet',
    phone: '000',
  });
  await run({ type: 'customer', name: 'İkinci Test', address: '', contact: '', phone: '' });
  const supplier = await run({
    type: 'supplier',
    name: 'Test Tedarikçi',
    address: '',
    contact: '',
    phone: '',
  });
  await run({
    type: 'purchase',
    supplierId: supplier,
    lines: [{ productId: p, quantity: 20000, price: 2500 }],
    paid: false,
    note: '',
  });
  await run({
    type: 'sale',
    customerId: customer,
    lines: [{ productId: p, quantity: 10000, price: 3500 }],
    note: 'UI satış',
  });
  await run({
    type: 'collection',
    customerId: customer,
    amount: 10000,
    method: 'Nakit',
    note: 'UI tahsilat',
  });
  // Wrap the existing trusted IPC handler in the isolated test process only. Pinned Electron's test hook deliberately returns old snapshots late.
  await app.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('sc:snapshot');
    if (typeof original !== 'function') throw new Error('Pinned Electron IPC test hook changed');
    ipcMain.removeHandler('sc:snapshot');
    ipcMain.handle('sc:snapshot', async (e, q) => {
      const r = await original(e, q);
      await new Promise((resolve) => setTimeout(resolve, q?.search === 'Ahmet' ? 700 : 120));
      return r;
    });
  });
  await nav('Müşteriler');
  let search = page.getByPlaceholder('Firma, yetkili veya telefon ara…');
  await search.click();
  await page.keyboard.type('Ahmet uzun firma adi ve bosluklar', { delay: 40 });
  await page.keyboard.insertText(' Çığ ŞİÖÜ ı');
  const text = 'Ahmet uzun firma adi ve bosluklar Çığ ŞİÖÜ ı';
  await settled();
  await assertFocus(search, text);
  assert.ok(await page.getByText('Aramanızla eşleşen kayıt yok', { exact: true }).isVisible());
  await search.press('Home');
  await search.press('ArrowRight');
  await page.keyboard.type('X', { delay: 20 });
  await assertFocus(search, 'AXhmet uzun firma adi ve bosluklar Çığ ŞİÖÜ ı');
  assert.equal(await search.evaluate((e) => e.selectionStart), 2);
  await settled();
  assert.equal(await search.evaluate((e) => e.selectionStart), 2);
  await search.press('Control+A');
  await page.keyboard.insertText('Ahmet');
  await page.waitForTimeout(220);
  await search.press('Control+A');
  await page.keyboard.insertText('İkinci');
  await settled();
  await page.waitForTimeout(750);
  await assertFocus(search, 'İkinci');
  assert.ok(await page.getByRole('row').filter({ hasText: 'İkinci Test' }).isVisible());
  assert.equal(await page.getByRole('row').filter({ hasText: 'Ahmet Test' }).count(), 0);
  await search.press('Control+A');
  await page.keyboard.insertText('Ahmet');
  await page.getByLabel('Arşivlenenleri göster').click();
  await page.waitForTimeout(850);
  assert.equal(await search.evaluate((e) => document.activeElement === e), false);
  await page.getByLabel('Arşivlenenleri göster').uncheck();
  await search.fill('');
  await settled();
  for (const [screen, placeholder] of [
    ['Ürün Yönetimi', 'Ürün adı ile ara…'],
    ['Gelen Siparişler', 'Firma adı ile ara…'],
    ['Müşteri Satışları', 'Müşteri veya satış numarası ara…'],
    ['Tahsilatlar', 'Müşteri veya açıklama ara…'],
  ]) {
    await nav(screen);
    const i = page.getByPlaceholder(placeholder);
    await i.click();
    await page.keyboard.type('Kesintisiz uzun arama ve bosluk', { delay: 20 });
    await settled();
    await assertFocus(i, 'Kesintisiz uzun arama ve bosluk');
    await i.fill('');
    await settled();
  }
  await nav('Gelen Siparişler');
  await page.getByRole('tab', { name: 'Tedarikçiler', exact: true }).click();
  search = page.getByPlaceholder('Firma adı ile ara…');
  await search.click();
  await page.keyboard.type('Tedarik arama uzun metin', { delay: 20 });
  await settled();
  await assertFocus(search, 'Tedarik arama uzun metin');
  await search.fill('');
  await settled();
  await nav('Müşteriler');
  let row = page.getByRole('row').filter({ hasText: 'Ahmet Test' });
  await menu(row, 'Düzelt', 'right');
  await page.getByLabel('Firma adı', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Firma adı', { exact: true }).inputValue(), 'Ahmet Test');
  await page.getByLabel('Firma adı', { exact: true }).fill('Ahmet Test Güncel');
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  row = page.getByRole('row').filter({ hasText: 'Ahmet Test Güncel' });
  await row.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menu').waitFor();
  await page.keyboard.press('End');
  await page.keyboard.press('Home');
  await page.keyboard.press('Escape');
  assert.equal(await row.evaluate((e) => document.activeElement === e), true);
  await menu(row, 'Sil / Kaldır');
  await page
    .getByRole('button', { name: 'Geçmiş kayıtları koruyarak arşivle', exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Hareketsiz kaydı kalıcı sil', exact: true }).count(),
    0,
  );
  await page
    .getByRole('button', { name: 'Geçmiş kayıtları koruyarak arşivle', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('row').filter({ hasText: 'Ahmet Test Güncel' }).count(), 0);
  await page.getByLabel('Arşivlenenleri göster').check();
  await settled();
  row = page.getByRole('row').filter({ hasText: 'Ahmet Test Güncel' });
  await menu(row, 'Yeniden etkinleştir', 'keyboard');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Yeniden etkinleştir', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const unused = await run({
    type: 'product',
    name: 'Hareketsiz Test',
    unit: 'Kg',
    price: 100,
    critical: 0,
    active: true,
  });
  await nav('Ürün Yönetimi');
  row = page.getByRole('row').filter({ hasText: 'Hareketsiz Test' });
  await menu(row, 'Sil / Kaldır', 'right');
  await page.getByRole('button', { name: 'Hareketsiz kaydı kalıcı sil', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(
    (await snap()).products.some((p) => p.id === unused),
    false,
  );
  await nav('Tahsilatlar');
  row = page.getByRole('row').filter({ hasText: 'Ahmet Test Güncel' });
  await menu(row, 'Düzelt');
  await page.getByLabel('Tutar (TL)', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Tutar (TL)', { exact: true }).inputValue(), '100');
  await page.getByLabel('Tutar (TL)', { exact: true }).fill('150');
  await page.getByLabel('Düzeltme gerekçesi').fill('UI yanlış tutar');
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Düzeltmeyi karşılaştırın', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Düzeltmeyi onayla', exact: true }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal((await snap()).summary.cash, 15000);
  assert.equal((await snap()).customers.find((c) => c.id === customer).balance, 20000);
  await nav('Müşteri Satışları');
  row = page.getByRole('row').filter({ hasText: 'Ahmet Test Güncel' });
  await menu(row, 'Düzelt', 'right');
  await page.getByRole('textbox', { name: 'Miktar (Kg)', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Miktar (Kg)', exact: true }).fill('8');
  await page.getByLabel('Düzeltme gerekçesi').fill('UI miktar düzeltmesi');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Satışı tamamla', exact: true })
    .click();
  await page.getByRole('button', { name: 'Düzeltmeyi onayla', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal((await snap()).products.find((x) => x.id === p).stock, 12000);
  assert.equal((await snap()).customers.find((c) => c.id === customer).balance, 13000);
  // Invalid replacement keeps both the original transaction and the draft values.
  row = page
    .getByRole('row')
    .filter({ hasText: 'Ahmet Test Güncel' })
    .filter({ hasText: 'Tamamlandı' });
  await menu(row, 'Düzelt');
  await page.getByRole('textbox', { name: 'Miktar (Kg)', exact: true }).fill('999');
  await page.getByLabel('Düzeltme gerekçesi').fill('Yetersiz stok testi');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Satışı tamamla', exact: true })
    .click();
  await page.getByRole('alert').filter({ hasText: /stok/i }).waitFor();
  assert.equal(
    await page.getByRole('textbox', { name: 'Miktar (Kg)', exact: true }).inputValue(),
    '999',
  );
  assert.equal((await snap()).products.find((x) => x.id === p).stock, 12000);
  await discard();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 640));
  await nav('Müşteriler');
  row = page.getByRole('row').filter({ hasText: 'Ahmet Test Güncel' });
  const box = await row.boundingBox();
  await row.click({ button: 'right', position: { x: box.width - 8, y: box.height - 8 } });
  const m = await page.getByRole('menu').boundingBox();
  const v = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  assert.ok(m && m.x >= 0 && m.y >= 0 && m.x + m.width <= v.w && m.y + m.height <= v.h);
  await page.screenshot({ path: 'artifacts/records/menu.png' });
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log(
    `PASS records Electron packaged=${packaged}: continuous real keyboard, Turkish/paste/middle selection, slow & stale IPC, no focus stealing, six list searches, context/visible/keyboard menu, archive/restore/delete, collection100→150, sale10→8, invalid draft retained, viewport bounds, offline.`,
  );
})()
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
    if (page) await page.screenshot({ path: 'artifacts/records/failure.png' }).catch(() => {});
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(root).startsWith(prefix),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
