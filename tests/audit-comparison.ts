import { createRequire } from 'node:module';
import { mkdtempSync, copyFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
const [label, volume] = process.argv.slice(2);
if (!['before', 'after'].includes(label) || !['small', 'medium', 'large'].includes(volume))
  throw new Error('Ölçüm parametresi geçersiz');
const load = createRequire(__filename);
const modules = path.resolve(process.env.SUCUKCENTER_AUDIT_MODULES || 'dist-electron/electron');
const { Store } = load(path.join(modules, 'store.js'));
const { view } = load(path.join(modules, 'view.js'));
const { report, statement } = load(path.join(modules, 'reports.js'));
const { recordInfo } = load(path.join(modules, 'records.js'));
const { viewSchema } = load(path.join(modules, '../shared/contracts.js'));
const root = mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-audit-bench-'));
const file = path.join(root, 'bench.db');
copyFileSync(path.resolve('artifacts/audit/' + volume + '-after-measurement.db'), file);
let store: any;
const times: Record<string, any> = {};
const median = (a: number[]) => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
async function measure(name: string, fn: () => any, n = 5) {
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await fn();
    values.push(performance.now() - t);
  }
  times[name] = { medianMs: median(values), maxMs: Math.max(...values), samples: values };
}
(async () => {
  let t = performance.now();
  store = await Store.openMigrating(file);
  times.migrationAndOpenMs = performance.now() - t;
  const db = store.db;
  times.counts = {};
  for (const table of [
    'products',
    'customers',
    'suppliers',
    'sales',
    'sale_items',
    'purchases',
    'collections',
    'preorders',
    'preorder_events',
    'operations',
  ])
    times.counts[table] = (db.prepare('SELECT COUNT(*) n FROM ' + table).get() as any).n;
  const last = (db.prepare('SELECT MAX(id) id FROM sales').get() as any).id;
  await measure('home', () => view(db, file, viewSchema.parse({ page: 'home' })));
  await measure('salesPage', () =>
    view(
      db,
      file,
      viewSchema.parse({ page: 'sales', offset: Math.max(0, times.counts.sales - 50) }),
    ),
  );
  await measure('customerSearch', () =>
    view(db, file, viewSchema.parse({ page: 'customers', search: 'Sentetik Müşteri 00' })),
  );
  await measure('productSearch', () =>
    view(db, file, viewSchema.parse({ page: 'products', search: 'Sentetik Ürün' })),
  );
  await measure('formRecord', () => recordInfo(db, { entity: 'sale', id: last }));
  await measure('monthlyReport', () => report(db, { start: '2026-10-01', end: '2026-10-31' }));
  await measure('customerStatement', () =>
    statement(db, 1, { start: '2026-10-01', end: '2026-10-31' }),
  );
  const run = (c: any) => store.execute({ operationId: randomUUID(), ...c });
  await measure('purchaseSave', () =>
    run({
      type: 'purchase',
      supplierId: 1,
      lines: [{ productId: 1, quantity: 1000, price: 200 }],
      paid: false,
      note: 'Ölçüm',
    }),
  );
  await measure('saleSave', () =>
    run({
      type: 'sale',
      customerId: 1,
      lines: [{ productId: 1, quantity: 1000, price: 500 }],
      note: 'Ölçüm',
    }),
  );
  await measure('collectionSave', () =>
    run({ type: 'collection', customerId: 1, amount: 100, method: 'Nakit', note: 'Ölçüm' }),
  );
  const c = {
    type: 'purchase',
    operationId: randomUUID(),
    supplierId: 1,
    lines: [{ productId: 1, quantity: 100000000, price: 1000 }],
    paid: false,
    note: 'Geçmiş ölçüm',
    occurredOn: '2026-09-01',
  };
  let impact: any;
  await measure(
    'historicalPreview',
    () => {
      impact = store.preview(c);
    },
    3,
  );
  if (!impact.required) throw new Error('Geçmiş maliyet etkisi eksik');
  await measure('historicalCommit', () => store.execute(c, impact.token), 1);
  const backup = path.join(root, 'backup.db');
  await measure(
    'backupVerified',
    async () => {
      await store.backup(backup);
      Store.validateBackup(backup);
    },
    1,
  );
  await measure('restoreVerified', () => store.restore(backup), 1);
  store.close();
  store = null;
  t = performance.now();
  store = new Store(file);
  times.steadyOpenMs = performance.now() - t;
  times.environment = {
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    cpus: os.cpus().length,
    cpu: os.cpus()[0].model,
    memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
    windows: os.release(),
  };
  mkdirSync('artifacts/audit', { recursive: true });
  writeFileSync(
    'artifacts/audit/' + volume + '-' + label + '-comparison.json',
    JSON.stringify(times, null, 2),
  );
  console.log('PASS', label, volume, JSON.stringify(times));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    store?.close();
    if (
      path.dirname(root) !== path.resolve(os.tmpdir()) ||
      !path.basename(root).startsWith('sucukcenter-audit-bench-')
    )
      throw new Error('Güvensiz ölçüm temizliği');
    rmSync(root, { recursive: true, force: true });
  });
