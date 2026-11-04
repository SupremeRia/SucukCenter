// Runtime/data upgrade using genuine previous packaged code and isolated Documents.
// Does not invoke NSIS or modify a real installation.
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-upgrade-data-'));
const version = process.env.SUCUKCENTER_BASELINE_VERSION || '1.7.0';
const legacy = path.resolve('artifacts/legacy-' + version + '-runtime');
const env = { ...process.env, SUCUKCENTER_TEST: '1', SUCUKCENTER_TEST_DOCUMENTS: root };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
async function launch(args) {
  app = await _electron.launch({ executablePath: require('electron'), args, env, timeout: 30000 });
  page = await require('./electron-test-window.cjs').mainWindow(app);
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
async function snap() {
  const r = await page.evaluate(() => window.desktop.snapshot());
  assert.ok(r.ok, r.error);
  assert.ok(r.data.dbPath.startsWith(root));
  return r.data;
}
(async () => {
  const asar = await import('@electron/asar');
  const archive = path.resolve(
    process.env.SUCUKCENTER_BASELINE_ASAR || 'artifacts/upgrade-baselines/' + version + '.asar',
  );
  assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, version);
  fs.mkdirSync(legacy, { recursive: true });
  for (const f of asar.listPackage(archive)) {
    const rel = f.replace(/^[\\/]/, '').replaceAll('\\', '/');
    if (
      !/^(dist\/|dist-electron\/(electron|shared)\/)/.test(rel) ||
      asar.statFile(archive, path.normalize(rel)).files
    )
      continue;
    const dest = path.join(legacy, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, asar.extractFile(archive, path.normalize(rel)));
  }
  await launch([path.join(legacy, 'dist-electron/electron/main.js')]);
  const p = await run({
    type: 'product',
    name: 'Eski Sürüm Test',
    unit: 'Kg',
    price: 3500,
    critical: 1000,
    active: true,
  });
  const c = await run({
    type: 'customer',
    name: 'Eski Test Müşteri',
    address: 'Test Adres',
    contact: 'Test',
    phone: '000',
  });
  const supplier = await run({
    type: 'supplier',
    name: 'Eski Test Tedarikçi',
    address: '',
    contact: '',
    phone: '',
  });
  await run({
    type: 'purchase',
    supplierId: supplier,
    lines: [{ productId: p, quantity: 20000, price: 2500 }],
    paid: false,
    note: 'Eski alış',
  });
  await run({
    type: 'sale',
    customerId: c,
    lines: [{ productId: p, quantity: 1000, price: 10000 }],
    note: 'Eski satış',
  });
  const collection = await run({
    type: 'collection',
    customerId: c,
    amount: 4000,
    method: 'Nakit',
    note: 'Eski tahsilat',
  });
  await run({
    type: 'settings',
    company: 'Eski Test Firma',
    theme: 'light',
    autoBackup: false,
    retention: 7,
  });
  let order;
  if (version.startsWith('1.5') || version.startsWith('1.6') || version.startsWith('1.7')) {
    order = await run({
      type: 'preorder',
      customerId: c,
      productId: p,
      quantity: 1000,
      price: 3500,
      source: 'prepaid',
      note: 'Bağlı kısmi teslim',
    });
    await run({
      type: 'preorder_allocate',
      orderId: order,
      mode: 'new',
      amount: 3500,
      method: 'Nakit',
      note: 'Eski avans',
    });
    await run({ type: 'preorder_delivery', orderId: order, quantity: 300, note: 'Eski teslim' });
  }
  const expense = await run({
    type: 'expense',
    amount: 12345,
    note: 'Eski kira açıklaması',
    occurredOn: '2026-10-15',
  });
  const cancelledExpense = await run({
    type: 'expense',
    amount: 900,
    note: 'Eski iptal gideri',
    occurredOn: '2026-10-15',
  });
  await run({
    type: 'reverse',
    entity: 'expense',
    id: cancelledExpense,
    reason: 'Eski hatalı gider',
    occurredOn: '2026-10-15',
  });
  const before = await snap();
  await app.close();
  app = null;
  await launch([path.resolve('.')]);
  const after = await snap();
  for (const key of [
    'products',
    'customers',
    'suppliers',
    'sales',
    'collections',
    'settings',
    'summary',
    'preorders',
  ]) {
    if (before[key] === undefined) continue;
    const normalized = Array.isArray(after[key])
      ? after[key].map((r, i) =>
          Object.fromEntries(Object.keys(before[key][i]).map((k) => [k, r[k]])),
        )
      : key === 'settings'
        ? Object.fromEntries(Object.keys(before.settings).map((k) => [k, after.settings[k]]))
        : after[key];
    assert.deepEqual(normalized, before[key], key);
  }
  assert.ok(
    after.customers.every((c) => c.active === 1) && after.suppliers.every((c) => c.active === 1),
  );
  if (order) {
    const o = after.preorders.find((o) => o.id === order);
    assert.equal(o.remaining, 700);
    assert.equal(o.paid, 3500);
    assert.equal(o.reserved, 2450);
  }
  assert.equal(after.settings.appearance, 'gray');
  const expenses = await page.evaluate(() =>
    window.desktop.snapshot({ page: 'expenses', range: {} }),
  );
  assert.ok(expenses.ok, expenses.error);
  const migratedExpense = expenses.data.expenses.find((e) => e.id === expense);
  assert.equal(migratedExpense.name, 'Eski kira açıklaması');
  assert.equal(migratedExpense.description, 'Eski kira açıklaması');
  assert.equal(migratedExpense.method, null);
  assert.equal(migratedExpense.amount, 12345);
  assert.equal(expenses.data.expenses.find((e) => e.id === cancelledExpense).status, 'cancelled');
  await page.getByRole('navigation').getByRole('button', { name: 'Giderler', exact: true }).click();
  await require('./ui-helpers.cjs').shortcut(page, 'Tüm zamanlar');
  const expenseRow = page.getByRole('row').filter({ hasText: 'Eski kira açıklaması' });
  await expenseRow.getByText('Bilinmiyor (eski kayıt)', { exact: true }).waitFor();
  await expenseRow.getByRole('button', { name: 'Kayıt işlemleri', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Düzelt', exact: true }).click();
  await page.getByLabel('Giderin adı', { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('Giderin adı', { exact: true }).inputValue(),
    'Eski kira açıklaması',
  );
  assert.equal(await page.getByLabel('Ödeme yöntemi', { exact: true }).inputValue(), '');
  await page.keyboard.press('Escape');
  const backups = fs
    .readdirSync(path.join(root, 'SucukCenter', 'yedekler'))
    .filter(
      (f) =>
        f.startsWith(
          'gecis-v' +
            (version.startsWith('1.7')
              ? 10
              : version === '1.6.1'
                ? 9
                : version.startsWith('1.6')
                  ? 8
                  : version.startsWith('1.5')
                    ? 7
                    : 6) +
            '-',
        ) && f.endsWith('.db'),
    );
  assert.equal(backups.length, 1);
  const info = await page.evaluate((ref) => window.desktop.record(ref), {
    entity: 'collection',
    id: collection,
  });
  assert.ok(info.ok, info.error);
  const corrected = await run({
    type: 'correct',
    entity: 'collection',
    id: collection,
    expected: info.data.expected,
    reason: 'Yükseltme sonrası düzeltme',
    replacement: { ...info.data.original, operationId: undefined, amount: 5000 },
  });
  assert.equal((await snap()).customers[0].balance, before.customers[0].balance - 1000);
  assert.equal((await snap()).summary.cash, before.summary.cash + 1000);
  await app.close();
  app = null;
  const oldStore = path.join(legacy, 'dist-electron/electron/store.js');
  const code = `const assert=require('node:assert/strict');const {Store}=require(${JSON.stringify(oldStore)});assert.throws(()=>new Store(${JSON.stringify(before.dbPath)}),/daha yeni/);console.log('PASS old schema guard');`;
  const checked = spawnSync(require('electron'), ['-e', code], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(checked.status, 0, checked.stderr);
  assert.ok(checked.stdout.includes('PASS'));
  await launch([path.resolve('.')]);
  assert.equal((await snap()).customers[0].balance, before.customers[0].balance - 1000);
  const i = await page.evaluate((ref) => window.desktop.record(ref), {
    entity: 'collection',
    id: corrected,
  });
  assert.ok(i.ok);
  assert.equal(i.data.corrections.length, 1);
  console.log(
    `PASS genuine ${version} ASAR → current Electron; schema migration verified backup; cards/balances/settings/funded partial delivery preserved; correction survives restart; genuine previous code refuses schema11; legacy expense name/description/unknown method preserved. NSIS physical installation NOT tested.`,
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(root).startsWith('sucukcenter-upgrade-data-'),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
