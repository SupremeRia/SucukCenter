const { _electron } = require('playwright');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { randomUUID } = require('node:crypto');
const { discard } = require('./ui-helpers.cjs');
const packaged = process.env.SUCUKCENTER_APPEARANCE_PACKAGED === '1',
  prefix = packaged ? 'sucukcenter-review-' : 'sucukcenter-appearance-';
const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
  env = {
    ...process.env,
    SUCUKCENTER_TEST: '1',
    SUCUKCENTER_TEST_DOCUMENTS: root,
    SUCUKCENTER_REVIEW_ROOT: root,
  };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
const { themes } = require('../dist-electron/shared/themes.js');
const scale = process.env.SUCUKCENTER_APPEARANCE_SCALE || '1';
async function launch() {
  app = await _electron.launch({
    executablePath: packaged
      ? path.resolve('review-builds/runtime-test/win-unpacked/SucukCenterReview.exe')
      : require('electron'),
    args: [...(packaged ? [] : [path.resolve('.')]), '--force-device-scale-factor=' + scale],
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
    ['product', 'customer', 'supplier', 'settings'].includes(c.type)
      ? c
      : { operationId: randomUUID(), ...c },
  );
  assert.ok(r.ok, r.error);
  return r.data;
}
async function nav(name) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
}
async function appearance() {
  await nav('Ayarlar');
  await page.getByRole('tab', { name: 'Görünüm', exact: true }).click();
}
async function bounds(locator) {
  const b = await locator.boundingBox(),
    v = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  assert.ok(
    b && b.x >= 0 && b.y >= 0 && b.x + b.width <= v.w + 2 && b.y + b.height <= v.h + 2,
    JSON.stringify({ b, v }),
  );
}
(async () => {
  await launch();
  await run({
    type: 'product',
    name: 'Tema ürünü',
    unit: 'Kg',
    price: 3500,
    critical: 0,
    active: true,
  });
  const customer = await run({
    type: 'customer',
    name: 'Tema Müşteri Çok Uzun Firma Ünvanı ve Yöresel Gıda Ticaret İşletmesi',
    address: '',
    contact: 'Yetkili',
    phone: '000',
  });
  await run({
    type: 'customer_debt',
    customerId: customer,
    amount: 1000000000000,
    category: 'carry',
    note: 'Sentetik büyük tutar',
  });
  await appearance();
  await page.getByRole('button', { name: 'Okyanus', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-appearance'), 'ocean');
  await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-appearance'), 'classic');
  fs.mkdirSync('docs/media', { recursive: true });
  for (const theme of themes) {
    await appearance();
    await page.getByRole('button', { name: theme.name, exact: true }).click();
    if (await page.getByRole('button', { name: 'Uygula', exact: true }).isEnabled())
      await page.getByRole('button', { name: 'Uygula', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Kaydedilmiş tema' }).waitFor();
    assert.equal(await page.locator('html').getAttribute('data-appearance'), theme.id);
    await nav('Müşteriler');
    const row = page.getByRole('row').filter({ hasText: 'Tema Müşteri' });
    await row.click({ button: 'right' });
    await bounds(page.getByRole('menu'));
    await page.keyboard.press('Escape');
    await nav('Müşteri Satışları');
    await page.getByRole('button', { name: 'Yeni satış', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Yeni müşteri satışı', exact: true });
    await bounds(form);
    const search = form.getByRole('combobox', { name: 'Müşteri', exact: true });
    await search.fill('Tema');
    await page.getByRole('listbox').waitFor();
    await bounds(page.getByRole('listbox'));
    await page.getByRole('option').filter({ hasText: 'Tema Müşteri' }).click();
    const date = form.getByLabel('İşlem tarihi', { exact: true });
    await date.fill('15.10.2026');
    await form.getByRole('button', { name: 'İşlem tarihi: takvimi aç', exact: true }).click();
    await bounds(page.getByRole('dialog', { name: 'İşlem tarihi takvimi', exact: true }));
    await page.keyboard.press('Escape');
    const product = form.getByRole('combobox', { name: 'Ürün 1', exact: true });
    assert.equal(
      await product.evaluate((e) => window.getComputedStyle(e, '::placeholder').opacity),
      '1',
    );
    await product.fill('Tema');
    await page.getByRole('option', { name: 'Tema ürünü (Kg)', exact: true }).click();
    const quantity = form.getByLabel('Miktar (Kg)', { exact: true });
    await quantity.fill('1,125');
    await quantity.focus();
    // A theme write applies without recreating an open form, search, caret, or period.
    if (theme.id === 'ocean') {
      await run({ type: 'settings', company: 'SucukCenter', theme: 'dark', appearance: 'purple' });
      await page
        .getByRole('button', { name: 'Temayı değiştir', exact: true, includeHidden: true })
        .evaluate((e) => e.click());
      await page.waitForTimeout(150);
      assert.equal(await quantity.inputValue(), '1,125');
      assert.equal(await date.inputValue(), '15.10.2026');
      assert.ok(await quantity.evaluate((e) => document.activeElement === e));
    }
    if (['classic', 'discord', 'mint', 'aurora'].includes(theme.id))
      await page.screenshot({ path: 'docs/media/theme-' + theme.id + '.png' });
    await discard(page);
  }
  await appearance();
  await page.getByRole('button', { name: 'Okyanus', exact: true }).click();
  await page.getByRole('button', { name: 'Uygula', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Kaydedilmiş tema' }).waitFor();
  await page.emulateMedia({ colorScheme: null });
  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = 'light';
  });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('html').getAttribute('data-appearance'), 'ocean');
  await page.getByLabel('Sistem temasını takip et', { exact: true }).check();
  await page.getByRole('button', { name: 'Uygula', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Kaydedilmiş tema' }).waitFor();
  assert.equal(await page.locator('html').evaluate((e) => e.classList.contains('dark')), false);
  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = 'dark';
  });
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await page.getByRole('button', { name: 'Okyanus', exact: true }).click();
  await page.getByRole('button', { name: 'Uygula', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Kaydedilmiş tema' }).waitFor();
  for (const size of [
    [1920, 1080],
    [1366, 768],
    [860, 640],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setSize(...s),
      size,
    );
    await bounds(page.getByRole('button', { name: 'Uygula', exact: true }));
    await page.getByRole('button', { name: 'Modül menüsünü aç / kapat', exact: true }).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.getByRole('button', { name: 'Modül menüsünü aç / kapat', exact: true }).click();
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 940));
  await appearance();
  await page.screenshot({ path: 'docs/media/theme-gallery.png', fullPage: true });
  await app.close();
  app = null;
  await launch();
  assert.equal(await page.locator('html').getAttribute('data-appearance'), 'ocean');
  const background = await (await app.browserWindow(page)).evaluate((w) => w.getBackgroundColor());
  assert.equal(background.toLowerCase(), '#0d1b2a');
  assert.deepEqual(errors, []);
  console.log(
    'PASS appearance 20 themes × table/form/calendar/context/search choice; preview/apply/cancel; open draft/focus/period; system and explicit selection; persistence/background; 3 sizes; packaged=' +
      packaged +
      ' scale=' +
      scale,
  );
})()
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
    fs.mkdirSync('artifacts/desktop', { recursive: true });
    if (page)
      await page.screenshot({ path: 'artifacts/desktop/appearance-failure.png' }).catch(() => {});
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(root).startsWith(prefix),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
