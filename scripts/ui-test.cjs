const { _electron } = require('playwright');
const { setRange, shortcut } = require('./ui-helpers.cjs');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const root = mkdtempSync(path.join(tmpdir(), 'sucukcenter-ui-'));
const artifacts = path.resolve('artifacts');
mkdirSync(artifacts, { recursive: true });
const executable = require('electron');
const env = { ...process.env, SUCUKCENTER_TEST: '1', SUCUKCENTER_TEST_DOCUMENTS: root };
delete env.ELECTRON_RUN_AS_NODE;
let app;
let page;
const errors = [];
let diagnostics = '';
async function launch() {
  app = await _electron.launch({
    executablePath: executable,
    args: [path.resolve('.')],
    env,
    timeout: 30000,
  });
  app.process().stderr.on('data', (chunk) => {
    diagnostics = (diagnostics + String(chunk)).slice(-5000);
  });
  page = await require('./electron-test-window.cjs').mainWindow(app);
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('heading', { name: 'İşletme Özeti' }).waitFor();
  await page.context().setOffline(true);
}
async function choose(label, value) {
  const input = page.getByRole('combobox', { name: label, exact: true });
  await input.fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
}
async function nav(label) {
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();
}
async function submit(label = 'Kaydet') {
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
async function snap() {
  return page.evaluate(async () => {
    const r = await window.desktop.snapshot();
    if (!r.ok) throw new Error(r.error);
    return r.data;
  });
}
async function workflow() {
  await launch();
  assert.equal((await snap()).products.length, 0, 'İlk açılış boş olmalı');
  await page.screenshot({ path: path.join(artifacts, '01-ilk-acilis.png') });
  const isolation = await page.evaluate(() => ({
    require: typeof window.require,
    process: typeof window.process,
    keys: Object.keys(window.desktop).sort(),
  }));
  assert.equal(isolation.require, 'undefined');
  assert.equal(isolation.process, 'undefined');
  assert.deepEqual(
    isolation.keys,
    [
      'annual',
      'autoBackup',
      'backup',
      'execute',
      'exportCustomer',
      'lookup',
      'openFolder',
      'preview',
      'record',
      'report',
      'restore',
      'snapshot',
      'statement',
      'supplierStatement',
    ].sort(),
  );
  await nav('Ürün Yönetimi');
  await page.getByRole('button', { name: 'Ürün ekle', exact: true }).click();
  await page.getByLabel('Ürün adı', { exact: true }).fill('Sucuk');
  await page.getByLabel('Satış birim fiyatı (TL)', { exact: true }).fill('35');
  await page.getByLabel('Kritik stok miktarı', { exact: true }).fill('10');
  await submit();
  await nav('Gelen Siparişler');
  await page.getByRole('button', { name: 'Tedarikçi ekle', exact: true }).click();
  await page.getByLabel('Firma adı', { exact: true }).fill('ABC Gıda');
  await submit();
  await page.getByRole('button', { name: 'Gelen sipariş ekle', exact: true }).click();
  await choose('Tedarikçi', 'ABC Gıda');
  await page.setViewportSize({ width: 900, height: 720 });
  const productChoice = page.getByRole('combobox', { name: 'Ürün 1', exact: true });
  await productChoice.fill('Sucuk');
  await productChoice.press('ArrowDown');
  await productChoice.press('Enter');
  await page.screenshot({ path: path.join(artifacts, '06-alis-formu-klavye.png') });
  assert.equal(
    await page.getByLabel('Birim fiyat (TL)', { exact: true }).inputValue(),
    '',
    'Alış maliyeti satış fiyatından doldurulmamalı',
  );
  await page.getByLabel('Miktar (Kg)', { exact: true }).fill('5000');
  await page.getByLabel('Birim fiyat (TL)', { exact: true }).fill('25');
  await submit('Depoya giriş yap');
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal((await snap()).products[0].stock, 5000000);
  await nav('Müşteriler');
  await page.getByRole('button', { name: 'Müşteri ekle', exact: true }).click();
  await page.getByLabel('Firma adı', { exact: true }).fill('Ahmet Büfe');
  await page
    .getByLabel('Firma adresi', { exact: true })
    .fill('Örnek Mahallesi (otomatik test verisi)');
  await page.getByLabel('Firma yetkilisi', { exact: true }).fill('Ahmet Test');
  await submit();
  await nav('Müşteri Satışları');
  await page.getByRole('button', { name: 'Yeni satış', exact: true }).click();
  await choose('Müşteri', 'Ahmet Büfe');
  await choose('Ürün 1', 'Sucuk (Kg)');
  await page.getByLabel('Miktar (Kg)', { exact: true }).fill('3');
  await app.evaluate(({ ipcMain }) => {
    const prior = ipcMain._invokeHandlers.get('sc:execute');
    let lost = false;
    ipcMain.removeHandler('sc:execute');
    ipcMain.handle('sc:execute', async (event, c) => {
      const result = await prior(event, c);
      if (c.type === 'sale' && result.ok && !lost) {
        lost = true;
        return {
          ok: false,
          error: 'Test: kayıt başarılı, yanıt kayboldu. Aynı formu tekrar gönderin.',
        };
      }
      return result;
    });
  });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Satışı tamamla', exact: true })
    .click();
  await page.getByRole('alert').filter({ hasText: 'yanıt kayboldu' }).waitFor();
  await submit('Satışı tamamla');
  let s = await snap();
  assert.equal(s.products[0].stock, 4997000);
  assert.equal(s.summary.revenue, 10500);
  assert.equal(s.summary.profit, 3000);
  assert.equal(s.summary.debt, 10500);
  assert.equal(s.sales.length, 1, 'Kaybolan yanıtta tekrar gönderim mükerrer satış oluşturmamalı');
  await page.getByPlaceholder('Müşteri veya satış numarası ara…').fill('#S-0001');
  assert.equal(await page.getByRole('button', { name: 'Görüntüle', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Görüntüle', exact: true }).click();
  await page.getByRole('dialog').getByText('Brüt kâr', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Müşteri cari hesabını aç', exact: true }).click();
  await page.getByRole('heading', { name: 'Ahmet Büfe', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Tahsilat al', exact: true }).click();
  await page.getByLabel('Tutar (TL)', { exact: true }).fill('40');
  await submit();
  s = await snap();
  assert.equal(s.customers[0].balance, 6500);
  assert.equal(s.summary.collected, 4000);
  await page.getByRole('tab', { name: 'Siparişler', exact: true }).click();
  await page.getByRole('tab', { name: 'Tahsilatlar', exact: true }).click();
  const csvFile = path.join(root, 'ekstre.csv');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, csvFile);
  await page.getByRole('button', { name: 'CSV müşteri ekstresi', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'CSV ekstresi kaydedildi.' }).waitFor();
  assert.ok(
    require('node:fs').readFileSync(csvFile, 'utf8').includes('"Kapanış bakiyesi";"65,00"'),
  );
  await nav('Ana Sayfa');
  await page.screenshot({ path: path.join(artifacts, '02-dashboard-koyu.png') });
  await nav('İşlem Geçmişi');
  await setRange(page, '2099-01-01', '2099-01-01');
  await page.getByRole('heading', { name: 'Bu tarihlerde işlem bulunmuyor' }).waitFor();
  await shortcut(page, 'Tüm zamanlar');
  await nav('Ayarlar');
  const backup = path.join(root, 'explicit-backup.db');
  await app.evaluate(({ dialog }, backup) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: backup });
  }, backup);
  await page.getByRole('button', { name: 'Yedek Oluştur', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Yedek oluşturuldu:' }).waitFor();
  await page.getByRole('button', { name: 'Temayı değiştir' }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
  await nav('Ana Sayfa');
  await page.screenshot({ path: path.join(artifacts, '03-dashboard-acik.png') });
  await page.setViewportSize({ width: 900, height: 720 });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'Küçük pencerede yatay taşma',
  );
  await page.screenshot({ path: path.join(artifacts, '04-dar-pencere.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await app.close();
  app = null;
  await launch();
  s = await snap();
  assert.equal(s.products[0].stock, 4997000);
  assert.equal(s.customers[0].balance, 6500);
  assert.equal(s.settings.theme, 'light');
  assert.ok(s.dbPath.startsWith(root), 'Gerçek Belgeler veritabanına dokunulmamalı');
  await nav('Ayarlar');
  await app.evaluate(({ dialog }, backup) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [backup] });
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  }, backup);
  await page.getByRole('button', { name: 'Yedekten Geri Yükle', exact: true }).click();
  await page
    .getByRole('button', { name: 'Yedekten Geri Yükle', exact: true })
    .waitFor({ state: 'visible' });
  await page.waitForFunction(async () => {
    const r = await window.desktop.snapshot();
    return r.ok;
  });
  assert.equal((await snap()).settings.theme, 'light', 'Vazgeçildiğinde geri yüklenmemeli');
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  await page.getByRole('button', { name: 'Yedekten Geri Yükle', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Geri yükleme tamamlandı.' }).waitFor();
  assert.equal((await snap()).settings.theme, 'dark');
  // Exercise the correction buttons as well as the primary acceptance workflow.
  await nav('Finans ve Raporlar');
  await page.getByRole('button', { name: 'Gider ekle', exact: true }).click();
  await page.getByLabel('Tutar (TL)', { exact: true }).fill('10');
  await page.getByLabel('Giderin adı', { exact: true }).fill('Test nakliye');
  await submit();
  assert.equal((await snap()).summary.expenses, 1000);
  await page
    .getByRole('row')
    .filter({ hasText: 'Test nakliye' })
    .getByRole('button', { name: 'Görüntüle', exact: true })
    .click();
  await page.getByRole('button', { name: 'Gideri iptal et', exact: true }).click();
  await page.getByLabel('İptal / iade gerekçesi').fill('Hatalı gider');
  await page.getByRole('button', { name: 'İptali onayla', exact: true }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  assert.equal((await snap()).summary.expenses, 0);
  await nav('Müşteri Satışları');
  await page.getByRole('button', { name: 'Görüntüle', exact: true }).click();
  await page.getByRole('button', { name: 'Tam iade / iptal', exact: true }).click();
  await page.getByLabel('İptal / iade gerekçesi').fill('Müşteri ürünleri iade etti');
  await page.getByRole('button', { name: 'İptali onayla', exact: true }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  s = await snap();
  assert.equal(s.products[0].stock, 5000000);
  assert.equal(s.customers[0].balance, -4000);
  assert.equal(s.summary.profit, 0);
  await nav('Tahsilatlar');
  await page.getByRole('button', { name: 'Para iadesi yap', exact: true }).click();
  await choose('Müşteri', 'Ahmet Büfe');
  await page.getByLabel('Tutar (TL)', { exact: true }).fill('40');
  await page.getByLabel('Açıklama', { exact: true }).fill('Müşterinin alacağı ödendi');
  await submit();
  assert.equal((await snap()).customers[0].balance, 0);
  await nav('Gelen Siparişler');
  await page.getByRole('tab', { name: 'Tedarikçiler', exact: true }).click();
  await page.getByRole('button', { name: 'Cari hesap', exact: true }).click();
  await page.getByRole('button', { name: 'Tedarikçiye ödeme yap', exact: true }).click();
  await page.getByLabel('Tutar (TL)', { exact: true }).fill('40');
  await submit();
  assert.equal((await snap()).suppliers[0].balance, 12496000);
  await page.getByRole('button', { name: 'Cari hesap', exact: true }).click();
  await page.getByRole('button', { name: 'Ödemeyi iptal et', exact: true }).click();
  await page.getByLabel('İptal / iade gerekçesi').fill('Test ödeme iptali');
  await page.getByRole('button', { name: 'İptali onayla', exact: true }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  assert.equal((await snap()).suppliers[0].balance, 12500000);
  await page.getByRole('tab', { name: 'Gelen siparişler', exact: true }).click();
  await page.getByRole('button', { name: 'Görüntüle', exact: true }).click();
  await page.getByRole('button', { name: 'Tedarikçiye İade', exact: true }).click();
  await page.getByLabel('İade miktarı 1', { exact: true }).fill('1');
  await page.getByLabel('İade gerekçesi / not', { exact: true }).fill('Test tedarikçi iadesi');
  await submit('İadeyi kaydet');
  assert.equal((await snap()).products[0].stock, 4999000);
  await nav('Ayarlar');
  await page.getByRole('button', { name: 'Otomatik yedeği şimdi oluştur', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Otomatik yedek doğrulandı.' }).waitFor();
  assert.ok((await snap()).settings.autoBackupLastAt);
  await page.evaluate(async () => {
    for (let i = 0; i < 61; i++) {
      const r = await window.desktop.execute({
        type: 'customer',
        name: 'Sentetik Arama ' + String(i).padStart(3, '0'),
        address: '',
        contact: '',
        phone: '',
      });
      if (!r.ok) throw new Error(r.error);
    }
  });
  await nav('Müşteriler');
  await page.getByRole('button', { name: 'Sonraki sayfa', exact: true }).click();
  await page.getByRole('button', { name: 'Önceki sayfa', exact: true }).waitFor();
  await nav('Müşteri Satışları');
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Yeni satış', exact: true }).click();
  const distant = page.getByRole('combobox', { name: 'Müşteri', exact: true });
  await distant.fill('Sentetik Arama 060');
  await page.getByRole('option', { name: 'Sentetik Arama 060', exact: true }).waitFor();
  await distant.press('ArrowDown');
  await distant.press('Enter');
  await choose('Ürün 1', 'Sucuk (Kg)');
  await page.getByLabel('Birim fiyat (TL)', { exact: true }).fill('0');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Satışı tamamla', exact: true })
    .click();
  await page.getByRole('alert').filter({ hasText: 'Bedelsiz' }).waitFor();
  await page.screenshot({ path: path.join(artifacts, '08-dogrulama-hatasi.png') });
  await page.getByLabel('Birim fiyat (TL)', { exact: true }).fill('35');
  await submit('Satışı tamamla');
  const invalid = await page.evaluate(() =>
    window.desktop.execute({ type: 'expense', amount: -10, note: 'invalid' }),
  );
  assert.equal(invalid.ok, false);
  assert.deepEqual(errors, [], 'Renderer hatasız çalışmalı');
  console.log(
    'PASS: Electron UI • ürün • tedarikçi • stok • müşteri • satış • tahsilat • cari/tarih filtreleri • açık/koyu tema • dar pencere • yeniden başlatma • güvenli yedek • onaylı/vazgeçilen geri yükleme • gider/iptal • satış iadesi • para iadesi • IPC doğrulama • offline',
  );
}
workflow()
  .catch(async (e) => {
    console.error(e);
    console.error(diagnostics);
    if (page) await page.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    const resolved = path.resolve(root);
    assert.ok(
      resolved.startsWith(path.resolve(tmpdir()) + path.sep) &&
        path.basename(resolved).startsWith('sucukcenter-ui-'),
    );
    rmSync(resolved, { recursive: true, force: true });
  });
