const { _electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
const packaged = process.env.SUCUKCENTER_CALENDAR_PACKAGED === '1';
const prefix = packaged ? 'sucukcenter-review-' : 'sucukcenter-calendar-focus-';
const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
  env = {
    ...process.env,
    SUCUKCENTER_TEST: '1',
    SUCUKCENTER_TEST_DOCUMENTS: root,
    SUCUKCENTER_REVIEW_ROOT: root,
  };
delete env.ELECTRON_RUN_AS_NODE;
let app;
(async () => {
  app = await _electron.launch({
    executablePath: packaged
      ? path.resolve('review-builds/runtime-test/win-unpacked/SucukCenterReview.exe')
      : require('electron'),
    args: packaged ? [] : [path.resolve('.')],
    env,
  });
  const page = await require('./electron-test-window.cjs').mainWindow(app);
  page.setDefaultTimeout(10000);
  const p = await page.evaluate(() =>
    window.desktop.execute({
      type: 'product',
      name: 'Odak ürünü',
      unit: 'Kg',
      price: 3500,
      critical: 0,
      active: true,
    }),
  );
  assert.ok(p.ok);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Müşteri Satışları', exact: true })
    .click();
  await page.getByRole('button', { name: 'Yeni satış', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Yeni müşteri satışı', exact: true });
  await form.getByRole('button', { name: 'İşlem tarihi: takvimi aç', exact: true }).click();
  await page.getByRole('dialog', { name: 'İşlem tarihi takvimi', exact: true }).waitFor();
  await page.evaluate(() => {
    const original = window.setTimeout.bind(window);
    window.focusTimerHits = 0;
    window.setTimeout = (callback, ms, ...args) => {
      if (
        ms === 0 &&
        typeof callback === 'function' &&
        /dispatchEvent/.test(String(callback)) &&
        /removeEventListener/.test(String(callback))
      ) {
        window.focusTimerHits++;
        return original(callback, 180, ...args);
      }
      return original(callback, ms, ...args);
    };
  });
  await page.keyboard.press('Escape');
  const input = form.getByRole('combobox', { name: 'Ürün 1', exact: true });
  await input.fill('Odak');
  await page.waitForTimeout(250);
  const state = await input.evaluate((e) => ({
    value: e.value,
    focused: document.activeElement === e,
    active: document.activeElement?.getAttribute('aria-label'),
    timerHits: window.focusTimerHits,
  }));
  console.log(JSON.stringify(state));
  assert.ok(state.timerHits >= 1, 'Radix unmount timer probe must match pinned dependency');
  assert.equal(state.focused, true, 'Takvimin gecikmeli odak dönüşü yeni arama alanını ezmemeli.');
  assert.equal(state.value, 'Odak');
  await page.getByRole('option', { name: 'Odak ürünü (Kg)', exact: true }).click();
  console.log('PASS delayed calendar close preserves newer product search focus and selection');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(root).startsWith(prefix),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
