import { recordInfo } from '../electron/records';
import { Store } from '../electron/store';
import { view } from '../electron/view';
import { viewSchema } from '../shared/contracts';
import { canonical, contentHash } from '../electron/reconcile';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { statement, report } from '../electron/reports';
const root = path.resolve(process.argv[2]);
if (!path.basename(root).startsWith('sucukcenter-perf-'))
  throw new Error('İzole ölçüm klasörü gerekli.');
const file = path.join(root, 'SucukCenter', 'sucukcenter.db');
if (process.argv[3] === 'enable-auto') {
  const s = new Store(file);
  s.db.prepare("UPDATE settings SET value='true' WHERE key='autoBackup'").run();
  s.close();
  process.exit(0);
}
let store = new Store(file);
const count = Number(process.env.SUCUKCENTER_PERF_SALES || 50000);
const customers = Number(process.env.SUCUKCENTER_PERF_CUSTOMERS || 1000);
const products = Number(process.env.SUCUKCENTER_PERF_PRODUCTS || 20);
const orders = Number(process.env.SUCUKCENTER_PERF_ORDERS || 10);
store.execute({
  type: 'product',
  name: 'Sentetik Sucuk',
  unit: 'Kg',
  price: 200,
  critical: 0,
  active: true,
});
store.execute({
  type: 'supplier',
  name: 'Sentetik Tedarikçi',
  address: '',
  contact: '',
  phone: '',
});
store.db.transaction(() => {
  const customer = store.db.prepare(
    "INSERT INTO customers(id,name,address,contact,phone) VALUES(?,?,'','','')",
  );
  for (let i = 1; i <= customers; i++)
    customer.run(i, `Sentetik Müşteri ${String(i).padStart(4, '0')}`);
})();
store.execute({
  type: 'purchase',
  operationId: randomUUID(),
  supplierId: 1,
  lines: [{ productId: 1, quantity: 100000000, price: 100 }],
  paid: false,
  note: 'Sentetik ölçüm stoğu',
  occurredAt: '2026-10-01T09:00:00Z',
});
for (let i = 2; i <= products; i++)
  store.execute({
    type: 'product',
    name: 'Sentetik Ürün ' + String(i).padStart(4, '0'),
    unit: 'Kg',
    price: 200,
    critical: 0,
    active: true,
  });
const at = '2026-10-02T09:00:00.000Z';
const seedStart = performance.now();
store.db.transaction(() => {
  const sale = store.db.prepare(
    'INSERT INTO sales(id,party_id,total,cost,note,created_at) VALUES(?,?,200,100,?,?)',
  );
  const item = store.db.prepare(
    "INSERT INTO sale_items(document_id,product_id,product,unit,quantity,price,total,cost) VALUES(?,1,'Sentetik Sucuk','Kg',1000,200,200,100)",
  );
  const ledger = store.db.prepare(
    "INSERT INTO customer_ledger(customer_id,amount,kind,entity_id,created_at) VALUES(?,200,'sale',?,?)",
  );
  const movement = store.db.prepare(
    "INSERT INTO stock_movements(product_id,quantity,cost,kind,entity_id,note,created_at) VALUES(1,-1000,-100,'sale',?,'Sentetik ölçüm',?)",
  );
  const activity = store.db.prepare(
    "INSERT INTO activity(entity,entity_id,customer_id,description,created_at) VALUES('sale',?,?,'Sentetik ölçüm satışı',?)",
  );
  const meta = store.db.prepare(
    "INSERT INTO event_meta(entity,entity_id,occurred_at,recorded_at) VALUES('sale',?,?,?)",
  );
  const day = store.db.prepare("INSERT INTO event_days VALUES('sale',?,'2026-10-02')");
  const am = store.db.prepare('INSERT INTO activity_meta VALUES(?,?,?)');
  const op = store.db.prepare(
    'INSERT INTO operations(operation_id,content_hash,request_json,result,recorded_at) VALUES(?,?,?,?,?)',
  );
  for (let i = 1; i <= count; i++) {
    const customerId = ((i - 1) % customers) + 1;
    const command = {
      type: 'sale',
      customerId,
      lines: [{ productId: 1, quantity: 1000, price: 200 }],
      note: 'Sentetik ölçüm',
    };
    sale.run(i, customerId, command.note, at);
    item.run(i);
    ledger.run(customerId, i, at);
    movement.run(i, at);
    const id = Number(activity.run(i, customerId, at).lastInsertRowid);
    meta.run(i, at, at);
    day.run(i);
    am.run(id, at, at);
    const json = canonical(command);
    op.run(randomUUID(), contentHash(json), json, i, at);
  }
  store.db
    .prepare('UPDATE products SET stock=stock-?,cost=cost-? WHERE id=1')
    .run(count * 1000, count * 100);
  store.db.prepare("UPDATE settings SET value='false' WHERE key='autoBackup'").run();
})();
for (let i = 0; i < orders; i++) {
  const order = store.execute({
    type: 'preorder',
    operationId: randomUUID(),
    customerId: (i % customers) + 1,
    productId: 1,
    quantity: 1000,
    price: 200,
    source: 'prepaid',
    note: 'Sentetik sipariş',
    occurredOn: '2026-10-03',
  });
  store.execute({
    type: 'preorder_allocate',
    operationId: randomUUID(),
    orderId: order,
    amount: 200,
    mode: 'new',
    method: 'Nakit',
    note: 'Sentetik avans',
    occurredOn: '2026-10-03',
  });
  store.execute({
    type: 'preorder_delivery',
    operationId: randomUUID(),
    orderId: order,
    quantity: 500,
    note: 'Sentetik kısmi teslim',
    occurredOn: '2026-10-03',
  });
}
const seedMs = performance.now() - seedStart;
store.close();
const openStart = performance.now();
store = new Store(file);
const openMs = performance.now() - openStart;
const queryStart = performance.now();
const home = view(store.db, file, viewSchema.parse({ page: 'home' }));
const homeMs = performance.now() - queryStart;
const salesStart = performance.now();
const page = view(store.db, file, viewSchema.parse({ page: 'sales', offset: count - 50 }));
const salesMs = performance.now() - salesStart;
const searches: number[] = [];
for (let i = 0; i < 5; i++) {
  const start = performance.now();
  view(store.db, file, viewSchema.parse({ page: 'customers', search: 'Sentetik Müşteri 00' }));
  searches.push(performance.now() - start);
}
const statementStart = performance.now();
statement(store.db, 1, { start: '2026-10-01', end: '2026-10-31' });
const statementMs = performance.now() - statementStart;
const recordStart = performance.now();
recordInfo(store.db, { entity: 'sale', id: count });
const recordMs = performance.now() - recordStart;
const reportStart = performance.now();
report(store.db, {});
const reportMs = performance.now() - reportStart;
if (
  home.counts?.customers !== customers ||
  page.sales.length !== 50 ||
  page.pagination?.total !== count + orders
)
  throw new Error('Ölçüm veri toplamı yanlış.');
const writes: number[] = [];
for (let i = 0; i < 20; i++) {
  const start = performance.now();
  store.execute({
    type: 'sale',
    operationId: randomUUID(),
    customerId: 1,
    lines: [{ productId: 1, quantity: 1000, price: 200 }],
    note: 'Ölçülen gerçek transaction',
  });
  writes.push(performance.now() - start);
}
writes.sort((a, b) => a - b);
const historical = {
  type: 'purchase',
  operationId: randomUUID(),
  supplierId: 1,
  lines: [{ productId: 1, quantity: 100000000, price: 300 }],
  note: 'Sentetik geçmiş maliyet ölçümü',
  paid: false,
  occurredOn: '2026-09-15',
};
const previewStart = performance.now();
const impact = store.preview(historical);
const historicalPreviewMs = performance.now() - previewStart;
if (!impact.required || impact.changedMovements < count + 20)
  throw new Error('Büyük geçmiş maliyet etkisi yanlış.');
const commitStart = performance.now();
store.execute(historical, impact.token);
const historicalCommitMs = performance.now() - commitStart;
store.close();
mkdirSync('artifacts', { recursive: true });
const data = {
  sales: count,
  customers,
  products,
  orders,
  searchMedianMs: searches.sort((a, b) => a - b)[2],
  statementMs,
  recordMs,
  seedMs,
  openMs,
  homeQueryMs: homeMs,
  lastSalesPageMs: salesMs,
  fullPeriodReportMs: reportMs,
  writeMedianMs: writes[10],
  writeP95Ms: writes[19],
  historicalPreviewMs,
  historicalCommitMs,
  historicalChangedMovements: impact.changedMovements,
  homePayloadBytes: Buffer.byteLength(JSON.stringify(home)),
  salesPayloadBytes: Buffer.byteLength(JSON.stringify(page)),
  databaseBytes: statSync(file).size,
  electron: process.versions.electron,
  node: process.versions.node,
};
async function finish() {
  const target = path.join(root, 'measurement-backup.db');
  const open = new Store(file);
  const backupStart = performance.now();
  await open.backup(target);
  Store.validateBackup(target);
  const backupMs = performance.now() - backupStart;
  const restoreStart = performance.now();
  await open.restore(target);
  const restoreMs = performance.now() - restoreStart;
  open.close();
  writeFileSync(
    process.env.SUCUKCENTER_PERF_OUTPUT || 'artifacts/audit-performance.json',
    JSON.stringify({ ...data, backupMs, restoreMs }, null, 2),
  );
  console.log(JSON.stringify({ ...data, backupMs, restoreMs }));
}
finish().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
