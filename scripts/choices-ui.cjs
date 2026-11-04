const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const packaged = process.env.SUCUKCENTER_CHOICES_PACKAGED === '1';
const prefix = packaged ? 'sucukcenter-review-' : 'sucukcenter-choices-ui-';
const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
fs.mkdirSync('artifacts/choices', { recursive: true });
const env = {
  ...process.env,
  SUCUKCENTER_TEST: '1',
  SUCUKCENTER_TEST_DOCUMENTS: root,
  SUCUKCENTER_REVIEW_ROOT: root,
};
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [];
async function nav(name) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await page.getByText('Kayıtlar yükleniyor…', { exact: true }).waitFor({ state: 'hidden' });
}
async function run(c) {
  const r = await page.evaluate((c) => window.desktop.execute(c), c);
  assert.ok(r.ok, r.error);
  return r.data;
}
async function geometry(input, list) {
  const a = await input.boundingBox(),
    b = await list.boundingBox();
  assert.ok(a && b);
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  assert.ok(
    b.x >= -1 &&
      b.y >= -1 &&
      b.x + b.width <= viewport.width + 1 &&
      b.y + b.height <= viewport.height + 1,
    JSON.stringify({ a, b, viewport }),
  );
  assert.ok(Math.abs(a.width - b.width) < 3, 'List width must match anchor');
  assert.ok(
    Math.abs(b.y - (a.y + a.height)) < 16 || Math.abs(b.y + b.height - a.y) < 16,
    'List must remain anchored',
  );
  assert.ok(
    await list.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + Math.min(20, r.height / 2),
      );
      return !!hit && el.contains(hit);
    }),
    'List must be above the dialog',
  );
}
async function inspect(label) {
  const input = page.getByRole('combobox', { name: label, exact: true });
  await input.click();
  const list = page.getByRole('listbox', { name: label + ' seçenekleri', exact: true });
  await list.waitFor();
  await geometry(input, list);
  await input.click();
  await list.waitFor();
  await geometry(input, list);
  return { input, list };
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
      `--force-device-scale-factor=${process.env.SUCUKCENTER_CHOICES_SCALE || '1'}`,
    ],
    env,
    timeout: 30000,
  });
  page = await require('./electron-test-window.cjs').mainWindow(app);
  page.setDefaultTimeout(5000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('heading', { name: 'İşletme Özeti', exact: true }).waitFor();
  await page.context().setOffline(true);
  for (let i = 0; i < 65; i++) {
    const name = String(i).padStart(3, '0');
    await run({
      type: 'product',
      name: `Seçim Ürünü ${name}`,
      unit: 'Kg',
      price: 10000,
      critical: 0,
      active: true,
    });
    await run({
      type: 'customer',
      name: `Seçim Müşterisi ${name}`,
      address: '',
      contact: '',
      phone: '',
    });
    await run({
      type: 'supplier',
      name: `Seçim Tedarikçisi ${name}`,
      address: '',
      contact: '',
      phone: '',
    });
  }
  if (process.env.SUCUKCENTER_CHOICES_THEME === 'light')
    await run({ type: 'settings', theme: 'light', company: 'SucukCenter' });
  await nav('Bekleyen Teslimatlar');
  await page.getByRole('button', { name: 'Ürün alacağı / ön sipariş ekle', exact: true }).click();
  let c = await inspect('Ürün');
  await page.screenshot({ path: 'artifacts/choices/product-open.png' });
  await c.input.press('End');
  await page.getByRole('option').last().waitFor();
  assert.ok(
    await page
      .getByRole('option')
      .last()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        const p = el.parentElement.getBoundingClientRect();
        return r.top >= p.top - 1 && r.bottom <= p.bottom + 1;
      }),
    'Keyboard End must scroll the active option into view',
  );
  await c.input.press('Home');
  await page.waitForFunction(
    (id) => {
      const list = document.getElementById(id);
      const first = list?.querySelector('[role="option"]');
      if (!list || !first) return false;
      const r = first.getBoundingClientRect(),
        p = list.getBoundingClientRect();
      return r.top >= p.top - 1 && r.bottom <= p.bottom + 1;
    },
    await c.list.getAttribute('id'),
  );
  await c.input.press('Escape');
  await page.getByRole('dialog', { name: 'Ürün alacağı / ön sipariş', exact: true }).waitFor();
  await c.input.click();
  await c.list.waitFor();
  await c.list.hover();
  const before = await c.list.evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 300);
  await page.waitForFunction(
    ({ id, top }) => {
      const el = document.getElementById(id);
      return el && el.scrollTop > top;
    },
    { id: await c.list.getAttribute('id'), top: before },
  );
  assert.ok(
    await c.list.evaluate((el, before) => el.scrollTop > before, before),
    'Wheel must scroll dropdown inside modal',
  );
  await c.list.waitFor();
  const box = await c.list.boundingBox();
  const gutter = await c.list.evaluate((el) => el.offsetWidth - el.clientWidth);
  if (gutter > 2 && box) {
    await page.mouse.move(box.x + box.width - gutter / 2, box.y + box.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - gutter / 2, box.y + box.height * 0.85, { steps: 8 });
    await page.mouse.up();
    await c.list.waitFor();
  }
  await c.input.fill('Seçim Ürünü 064');
  await page.getByRole('option', { name: 'Seçim Ürünü 064 (Kg)', exact: true }).click();
  await c.list.waitFor({ state: 'hidden' });
  assert.equal(await c.input.inputValue(), 'Seçim Ürünü 064 (Kg)');
  for (const [width, height] of [
    [1366, 768],
    [860, 640],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, { width, height }) =>
        BrowserWindow.getAllWindows()[0].setSize(width, height),
      { width, height },
    );
    c = await inspect('Müşteri');
    await geometry(c.input, c.list);
    await c.input.press('Escape');
    c = await inspect('Ürün');
    await geometry(c.input, c.list);
    await page.screenshot({ path: `artifacts/choices/viewport-${width}.png` });
    await c.input.press('Tab');
    await c.list.waitFor({ state: 'hidden' });
  }
  await discard();
  await nav('Müşteri Satışları');
  await page.getByRole('button', { name: 'Yeni satış', exact: true }).click();
  c = await inspect('Müşteri');
  await c.input.press('Escape');
  c = await inspect('Ürün 1');
  await c.input.press('Escape');
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'Kalem ekle', exact: true }).click();
  c = await inspect('Ürün 6');
  await page.screenshot({ path: 'artifacts/choices/lower-row.png' });
  await c.input.press('Escape');
  await discard();
  await nav('Gelen Siparişler');
  await page.getByRole('button', { name: 'Gelen sipariş ekle', exact: true }).click();
  c = await inspect('Tedarikçi');
  await c.input.press('Escape');
  await discard();
  await nav('Ürün Yönetimi');
  await page.getByRole('button', { name: 'Ürün ekle', exact: true }).click();
  c = await inspect('Varsayılan tedarikçi (isteğe bağlı)');
  await c.input.press('Escape');
  await discard();
  await nav('Tahsilatlar');
  await page.getByRole('button', { name: 'Tahsilat al', exact: true }).first().click();
  c = await inspect('Müşteri');
  await c.input.press('Escape');
  await discard();
  assert.deepEqual(errors, []);
  console.log(
    `PASS: Electron packaged=${packaged} scale=${process.env.SUCUKCENTER_CHOICES_SCALE || '1'} • click/repeated click with no typing • anchor/viewport/layer checks • modal wheel/scrollbar/keyboard scroll • Escape/Tab/select • remote options beyond first 50 • product/customer/supplier • three window sizes • offline`,
  );
})()
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
    if (page) await page.screenshot({ path: 'artifacts/choices/failure.png' }).catch(() => {});
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(root).startsWith(prefix),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
