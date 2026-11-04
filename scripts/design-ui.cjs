const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { randomUUID } = require('node:crypto');
const {
  periodPopup,
  setMonth,

  shortcut,
  discard,
  displayDay,
} = require('./ui-helpers.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-design-ui-'));
const output = path.resolve('artifacts/redesign/after');
fs.mkdirSync(output, { recursive: true });
let app, page;
const errors = [],
  results = [];
async function launch(scale) {
  const env = {
    ...process.env,
    SUCUKCENTER_TEST: '1',
    SUCUKCENTER_TEST_DOCUMENTS: path.join(root, String(scale)),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({
    executablePath: require('electron'),
    args: [path.resolve('.'), `--force-device-scale-factor=${scale}`],
    env,
    timeout: 30000,
  });
  page = await require('./electron-test-window.cjs').mainWindow(app);
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('heading', { name: 'İşletme Özeti', exact: true }).waitFor();
  await page.context().setOffline(true);
}
async function nav(name) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByText('Dönem raporu yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
}
async function run(c) {
  const r = await page.evaluate(
    (c) => window.desktop.execute(c),
    ['product', 'customer', 'supplier', 'settings'].includes(c.type)
      ? c
      : { ...c, operationId: randomUUID() },
  );
  assert.ok(r.ok, r.error);
  return r.data;
}
async function choose(label, value) {
  const i = page.getByRole('combobox', { name: label, exact: true });
  await i.fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
}
async function capture(name) {
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
}
async function bounds(locator, name) {
  const box = await locator.boundingBox();
  const v = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  assert.ok(
    box &&
      box.x >= -1 &&
      box.y >= -1 &&
      box.x + box.width <= v.w + 1 &&
      box.y + box.height <= v.h + 1,
    `${name} görünür pencerede kalmalı: ${JSON.stringify({ box, v })}`,
  );
}
async function noOverflow() {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'Sayfa çapında yatay taşma olmamalı',
  );
}
async function seed() {
  const supplier = await run({
    type: 'supplier',
    name: 'Sentetik Tedarikçi · Çığ Gıda',
    address: 'Test adresi',
    contact: 'Örnek Yetkili',
    phone: '',
  });
  const customer = await run({
    type: 'customer',
    name: 'Sentetik Şirket · Çok Uzun Firma Ünvanı ve Yöresel Gıda Ticaret İşletmesi',
    address: 'Sentetik test adresi',
    contact: 'Çağrı Öztürk (sentetik)',
    phone: '',
  });
  const products = [];
  for (const [name, unit, price] of [
    ['Sentetik Kangal Sucuk', 'Kg', 450000],
    ['Sentetik Zeytinyağı', 'Litre', 35000],
    ['Sentetik Kutu', 'Adet', 4500],
  ]) {
    const id = await run({ type: 'product', name, unit, price, critical: 10000, active: true });
    products.push({ id, name, unit, price });
  }
  await run({
    type: 'purchase',
    supplierId: supplier,
    lines: [
      { productId: products[0].id, quantity: 5000000, price: 250000 },
      { productId: products[1].id, quantity: 120000, price: 15000 },
      { productId: products[2].id, quantity: 100000, price: 1000 },
    ],
    paid: false,
    note: 'Sentetik tasarım testi',
    occurredOn: '2026-08-01',
  });
  await run({
    type: 'sale',
    customerId: customer,
    lines: [{ productId: products[0].id, quantity: 3000, price: 450000 }],
    note: 'Sentetik satış',
    occurredOn: '2026-09-15',
  });
  await run({
    type: 'settings',
    theme: 'dark',
    company: 'Örnek İşletme · Sentetik Görsel Test',
    autoBackup: false,
    retention: 7,
  });
  return { supplier, customer, products };
}
async function interactions() {
  const unbroken = 'ÇĞİŞÜÖ'.repeat(30);
  await run({ type: 'customer', name: unbroken, address: '', contact: '', phone: '' });
  await nav('Müşteriler');
  for (const name of [
    'Sentetik Şirket · Çok Uzun Firma Ünvanı ve Yöresel Gıda Ticaret İşletmesi',
    unbroken,
  ]) {
    const text = page.locator('.table-name strong').getByText(name, { exact: true });
    await text.waitFor();
    assert.ok(
      await text.evaluate((e) => {
        const b = e.getBoundingClientRect(),
          cell = e.closest('td').getBoundingClientRect();
        return b.right <= cell.right - 8 && b.left >= cell.left;
      }),
      'Firma adı kendi sütununun dışına taşmamalı',
    );
  }
  await capture('long-company-names');
  const companyRow = page.getByRole('row').filter({
    hasText: 'Sentetik Şirket · Çok Uzun Firma Ünvanı ve Yöresel Gıda Ticaret İşletmesi',
  });
  await companyRow.getByRole('button', { name: 'Hesabı aç', exact: true }).click();
  await bounds(
    page.getByRole('heading', {
      name: 'Sentetik Şirket · Çok Uzun Firma Ünvanı ve Yöresel Gıda Ticaret İşletmesi',
      exact: true,
    }),
    'Uzun firma başlığı',
  );
  await capture('customer-long-name');
  await nav('Müşteri Satışları');
  await shortcut(page, 'Tüm zamanlar');
  const oldCaption = await page
    .getByRole('button', { name: /^Dönem seç:/ })
    .getAttribute('aria-label');
  const popup = await periodPopup(page);
  await popup.getByRole('button', { name: 'Ay', exact: true }).click();
  await popup.getByLabel('Dönem yılı', { exact: true }).fill('2025');
  await popup.getByRole('button', { name: 'Ağustos', exact: true }).click();
  assert.equal(
    await page
      .getByRole('button', { name: /^Dönem seç:/, includeHidden: true })
      .getAttribute('aria-label'),
    oldCaption,
    'Uygulamadan dönem değişmemeli',
  );
  await popup.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  assert.equal(
    await page.getByRole('button', { name: /^Dönem seç:/ }).getAttribute('aria-label'),
    oldCaption,
  );
  const invalid = await periodPopup(page);
  await invalid.getByRole('button', { name: 'Tarih aralığı', exact: true }).click();
  await invalid.getByLabel('Başlangıç tarihi', { exact: true }).fill('20.08.2026');
  await invalid.getByLabel('Bitiş tarihi', { exact: true }).fill('10.08.2026');
  assert.equal(
    await invalid.getByRole('button', { name: 'Uygula', exact: true }).isDisabled(),
    true,
  );
  await invalid.getByRole('alert').filter({ hasText: 'Bitiş tarihi' }).waitFor();
  await invalid.getByLabel('Bitiş tarihi', { exact: true }).fill('31.08.2026');
  await capture('period-range');
  await invalid.getByRole('button', { name: 'Uygula', exact: true }).click();
  await page.getByRole('button', { name: 'Yeni satış', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Yeni müşteri satışı', exact: true });
  assert.equal(
    await form.getByLabel('İşlem tarihi', { exact: true }).inputValue(),
    displayDay(
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date()),
    ),
  );
  await form.getByLabel('İşlem tarihi', { exact: true }).fill('31.02.2026');
  assert.equal(
    await form.getByLabel('İşlem tarihi', { exact: true }).getAttribute('aria-invalid'),
    'true',
  );
  assert.equal(await form.getByLabel('İşlem tarihi', { exact: true }).inputValue(), '31.02.2026');
  await form.getByLabel('İşlem tarihi', { exact: true }).fill('15.08.2026');
  await form.getByRole('button', { name: 'İşlem tarihi: takvimi aç', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'İşlem tarihi takvimi', exact: true });
  await bounds(calendar, 'Takvim');
  await calendar.getByRole('gridcell', { name: /15 Ağustos 2026/ }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  assert.equal(await form.getByLabel('İşlem tarihi', { exact: true }).inputValue(), '16.08.2026');
  assert.equal(await form.isVisible(), true);
  await form.getByRole('button', { name: 'İşlem tarihi: takvimi aç', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await form.isVisible(), true);
  assert.ok(
    await form
      .getByRole('button', { name: 'İşlem tarihi: takvimi aç', exact: true })
      .evaluate((e) => document.activeElement === e),
    'Odak tarih düğmesine dönmeli',
  );
  await choose(
    'Müşteri',
    'Sentetik Şirket · Çok Uzun Firma Ünvanı ve Yöresel Gıda Ticaret İşletmesi',
  );
  await choose('Ürün 1', 'Sentetik Kangal Sucuk (Kg)');
  await form.getByLabel('Miktar (Kg)', { exact: true }).fill('0');
  await form.getByRole('button', { name: 'Satışı tamamla', exact: true }).click();
  assert.equal(
    await form.getByLabel('Miktar (Kg)', { exact: true }).getAttribute('aria-invalid'),
    'true',
  );
  await form.getByRole('alert').filter({ hasText: 'sıfırdan büyük' }).waitFor();
  await form.getByLabel('Miktar (Kg)', { exact: true }).fill('1');
  assert.equal(await form.getByLabel('Bedelsiz işlem gerekçesi', { exact: true }).count(), 0);
  await form.getByLabel('Bedelsiz işlem (sıfır fiyat)', { exact: true }).check();
  await form.getByLabel('Bedelsiz işlem gerekçesi', { exact: true }).fill('Sentetik numune');
  await form.getByLabel('Bedelsiz işlem (sıfır fiyat)', { exact: true }).uncheck();
  assert.equal(await form.getByLabel('Bedelsiz işlem gerekçesi', { exact: true }).count(), 0);
  for (let i = 0; i < 8; i++)
    await form.getByRole('button', { name: 'Kalem ekle', exact: true }).click();
  await bounds(
    form.getByRole('button', { name: 'Satışı tamamla', exact: true }),
    'Sabit kaydet düğmesi',
  );
  await bounds(form.getByRole('button', { name: 'Vazgeç', exact: true }), 'Sabit vazgeç düğmesi');
  await capture('multi-line-form');
  await form.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  const warning = page.getByRole('alertdialog', {
    name: 'Değişiklikler kaydedilmedi',
    exact: true,
  });
  await warning.getByRole('button', { name: 'Düzenlemeye devam et', exact: true }).click();
  assert.equal(await form.getByLabel('İşlem tarihi', { exact: true }).inputValue(), '16.08.2026');
  await discard(page);
  await nav('Gelen Siparişler');
  await page.getByRole('button', { name: 'Gelen sipariş ekle', exact: true }).click();
  const purchase = page.getByRole('dialog', { name: 'Yeni gelen sipariş', exact: true });
  assert.equal(await purchase.getByLabel('Ödeme yöntemi', { exact: true }).count(), 0);
  await purchase.getByLabel('Tedarikçiye ödendi', { exact: false }).check();
  await purchase.getByLabel('Ödeme yöntemi', { exact: true }).selectOption('Banka');
  await purchase.getByLabel('Tedarikçiye ödendi', { exact: false }).uncheck();
  assert.equal(await purchase.getByLabel('Ödeme yöntemi', { exact: true }).count(), 0);
  await discard(page);
  await nav('Finans ve Raporlar');
  await setMonth(page, '2026-08');
  await page.getByRole('tab', { name: 'Alış dökümü', exact: true }).click();
  await page.getByRole('cell', { name: 'Sentetik Zeytinyağı', exact: true }).waitFor();
  await capture('purchase-breakdown');
  await page.getByRole('tab', { name: 'Yıllık karşılaştırma', exact: true }).click();
  await page.getByRole('button', { name: 'Tüm sütunları göster', exact: true }).click();
  await page.getByRole('columnheader', { name: 'İade farkı', exact: true }).waitFor();
  assert.equal(
    await page
      .locator('.sticky-first th')
      .first()
      .evaluate((e) => window.getComputedStyle(e).position),
    'sticky',
  );
  await noOverflow();
  await capture('annual-expanded');
  await nav('Ürün Yönetimi');
  await page.getByPlaceholder('Ürün adı ile ara…').fill('eşleşmeyecek-test');
  await page.getByRole('heading', { name: 'Aramanızla eşleşen kayıt yok', exact: true }).waitFor();
  await page.getByPlaceholder('Ürün adı ile ara…').fill('');
  await nav('Ana Sayfa');
  await page.getByRole('button', { name: 'Menüyü daralt', exact: true }).click();
  assert.equal(await page.locator('.brand-copy').isVisible(), false);
  await capture('collapsed-sidebar');
  await page.getByRole('button', { name: 'Modül menüsünü aç / kapat', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const animation = await page
    .locator('body')
    .evaluate((e) => window.getComputedStyle(e).animationName);
  assert.equal(animation, 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}
(async () => {
  for (const scale of [1, 1.25, 1.5]) {
    await launch(scale);
    await nav('Ürün Yönetimi');
    await page.getByRole('heading', { name: 'Henüz kayıt yok', exact: true }).waitFor();
    const x = await seed();
    await nav('Ana Sayfa');
    await setMonth(page, '2026-09');
    await page.evaluate(() => document.fonts.ready);
    assert.ok(
      await page.evaluate(() => document.fonts.check('15px "Inter Variable"', 'ÇĞİÖŞÜçğıöşü')),
    );
    if (scale === 1) await interactions(x);
    for (const size of [
      [1920, 1080],
      [1366, 768],
      [860, 640],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setSize(s[0], s[1]),
        size,
      );
      await nav('Ana Sayfa');
      for (const theme of ['dark', 'light']) {
        const r = await run({
          type: 'settings',
          theme,
          company: 'Örnek İşletme · Sentetik Görsel Test',
          autoBackup: false,
          retention: 7,
        });
        assert.ok(r >= 0);
        await nav('Ürün Yönetimi');
        await nav('Ana Sayfa');
        await noOverflow();
        await capture(`home-${theme}-${size.join('x')}-${scale}`);
      }
      await nav('Müşteriler');
      const longName=page.locator('.table-name strong').getByText('Sentetik Şirket · Çok Uzun Firma Ünvanı ve Yöresel Gıda Ticaret İşletmesi',{exact:true});
      await longName.waitFor();
      assert.ok(await longName.evaluate(e=>e.getBoundingClientRect().right<=e.closest('td').getBoundingClientRect().right-8),'Her ölçek/boyutta firma adı sütununda kalmalı');
      await noOverflow();
      await capture(`company-${size.join('x')}-${scale}`);
      await nav('Müşteri Satışları');
      await page.getByRole('button', { name: 'Yeni satış', exact: true }).click();
      const form = page.getByRole('dialog', { name: 'Yeni müşteri satışı', exact: true });
      await choose('Müşteri','Sentetik Şirket · Çok Uzun Firma Ünvanı ve Yöresel Gıda Ticaret İşletmesi');
      await form.locator('.choice-selected-label').getByText('Sentetik Şirket · Çok Uzun Firma Ünvanı ve Yöresel Gıda Ticaret İşletmesi',{exact:true}).waitFor();
      await bounds(form, 'Form');
      await bounds(
        form.getByRole('button', { name: 'Satışı tamamla', exact: true }),
        'Alt işlem düğmesi',
      );
      await form.getByRole('button', { name: 'İşlem tarihi: takvimi aç', exact: true }).click();
      const cal = page.getByRole('dialog', { name: 'İşlem tarihi takvimi', exact: true });
      await bounds(cal, 'Modal içi takvim');
      await capture(`calendar-form-${size.join('x')}-${scale}`);
      await page.keyboard.press('Escape');
      await discard(page);
      results.push({
        scale,
        outer: size,
        viewport: await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
        })),
      });
    }
    if (scale === 1) {
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1440, 940),
      );
      for (const name of [
        'Ana Sayfa',
        'Ürün Yönetimi',
        'Depo ve Stok',
        'Gelen Siparişler',
        'Müşteriler',
        'Müşteri Satışları',
        'Tahsilatlar',
        'Finans ve Raporlar',
        'İşlem Geçmişi',
        'Ayarlar',
      ]) {
        await nav(name);
        await capture(`screen-${name.replaceAll(' ', '-')}`);
      }
    }
    await app.close();
    app = null;
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.resolve('artifacts/redesign/verification.json'),
    JSON.stringify(
      {
        results,
        errors,
        note: 'Chromium force-device-scale-factor; OS-wide DPI preferences were not changed.',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: gerçek Electron • 3 pencere boyutu ×3 ölçek ×2 tema • tarih/klavye/odak • uygula/vazgeç • geçersiz tarih/aralık • çok kalemli sabit form • değişiklik koruma • koşullu alanlar • tablo/rapor/marka/font • offline',
  );
})()
  .catch(async (e) => {
    console.error(e);
    if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    const safe = path.resolve(root);
    assert.ok(
      safe.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(safe).startsWith('sucukcenter-design-ui-'),
    );
    fs.rmSync(safe, { recursive: true, force: true });
  });
