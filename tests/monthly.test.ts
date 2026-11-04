import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../electron/store';
import { report, statement, annualReport, customerCSV } from '../electron/reports';
import { monthRange, turkeyDay, dayISO, dayBounds } from '../shared/dates';
import { view } from '../electron/view';
import { viewSchema } from '../shared/contracts';
import Database from 'better-sqlite3';
const directories: string[] = [];
after(() => {
  for (const folder of directories) {
    const resolved = path.resolve(folder);
    assert.ok(
      resolved.startsWith(path.resolve(tmpdir()) + path.sep) &&
        path.basename(resolved).startsWith('sucukcenter-monthly-'),
    );
    rmSync(resolved, { recursive: true, force: true });
  }
});
function fixture() {
  const folder = mkdtempSync(path.join(tmpdir(), 'sucukcenter-monthly-'));
  directories.push(folder);
  const store = new Store(path.join(folder, 'test.db'));
  const run = (c: any) =>
    store.execute(
      ['product', 'customer', 'supplier', 'settings'].includes(c.type)
        ? c
        : { operationId: randomUUID(), ...c },
    );
  const supplierId = run({
    type: 'supplier',
    name: 'Aylık Tedarikçi',
    address: '',
    contact: '',
    phone: '',
  });
  const customerId = run({
    type: 'customer',
    name: 'Aylık Müşteri',
    address: '',
    contact: '',
    phone: '',
  });
  const productId = run({
    type: 'product',
    name: 'Aylık Sucuk',
    unit: 'Kg',
    price: 10000,
    critical: 0,
    active: true,
  });
  const purchase = (day: string, price: number, quantity = 1000) =>
    run({
      type: 'purchase',
      supplierId,
      lines: [{ productId, price, quantity }],
      paid: false,
      note: '',
      occurredAt: dayISO(day),
    });
  const sale = (day: string, price: number, quantity = 1000) =>
    run({
      type: 'sale',
      customerId,
      lines: [{ productId, price, quantity }],
      note: '',
      occurredAt: dayISO(day),
    });
  const collect = (day: string, amount: number) =>
    run({
      type: 'collection',
      customerId,
      amount,
      method: 'Nakit',
      note: '',
      occurredAt: dayISO(day),
    });
  return { store, run, supplierId, customerId, productId, purchase, sale, collect };
}
test('aylık müşteri: devir100 + satış300 − tahsilat150 =250; Eylül sonrası güncel200', () => {
  const x = fixture();
  try {
    x.purchase('2026-07-01', 1000, 100000);
    x.sale('2026-07-20', 10000);
    x.sale('2026-08-15', 30000);
    x.collect('2026-08-20', 15000);
    x.collect('2026-09-01', 5000);
    const before = (x.store.db.prepare('SELECT total_changes() n').get() as { n: number }).n;
    const aug = statement(x.store.db, x.customerId, monthRange(2026, 8));
    assert.equal(aug.opening, 10000);
    assert.equal(aug.grossSales, 30000);
    assert.equal(aug.collections, 15000);
    assert.equal(aug.closing, 25000);
    assert.equal(aug.current, 20000);
    assert.equal(aug.rows.length, 2);
    assert.equal(aug.rows[0].items?.[0].product, 'Aylık Sucuk');
    const sep = statement(x.store.db, x.customerId, monthRange(2026, 9));
    assert.equal(sep.opening, 25000);
    assert.equal(sep.closing, 20000);
    assert.equal(sep.rows.length, 1);
    const other = x.run({
      type: 'customer',
      name: 'Başka müşteri',
      address: '',
      contact: '',
      phone: '',
    });
    assert.equal(statement(x.store.db, other, monthRange(2026, 8)).total, 0);
    const readStart = (x.store.db.prepare('SELECT total_changes() n').get() as { n: number }).n;
    const csv = customerCSV(x.store.db, x.customerId, monthRange(2026, 8));
    annualReport(x.store.db, 2026);
    assert.equal(
      (x.store.db.prepare('SELECT total_changes() n').get() as { n: number }).n,
      readStart,
    );
    assert.ok(csv.includes('Aylık Sucuk'));
    assert.ok(csv.includes('250,00'));
    assert.ok(before >= 0);
  } finally {
    x.store.close();
  }
});
test('aylık işletme: Ağustos10000/Ekim4000 alış; eski borca ödeme alışa eklenmez; boş ay sıfır', () => {
  const x = fixture();
  try {
    x.purchase('2026-08-15', 1000000);
    x.purchase('2026-10-15', 400000);
    x.run({
      type: 'supplier_payment',
      supplierId: x.supplierId,
      amount: 200000,
      method: 'Banka',
      note: 'Eski borç',
      occurredAt: dayISO('2026-10-20'),
    });
    const aug = report(x.store.db, monthRange(2026, 8)),
      oct = report(x.store.db, monthRange(2026, 10));
    assert.equal(aug.grossPurchases, 1000000);
    assert.equal(oct.purchases, 400000);
    assert.equal(oct.supplierPaid, 200000);
    assert.equal(oct.purchaseBreakdown[0].unit, 'Kg');
    const annual = annualReport(x.store.db, 2026);
    assert.equal(annual.length, 12);
    assert.equal(annual[1].report.purchases, 0);
    assert.equal(annual[7].report.purchases, 1000000);
    const historical = x.run({
      type: 'purchase',
      supplierId: x.supplierId,
      lines: [{ productId: x.productId, quantity: 1000, price: 100000 }],
      paid: true,
      note: '15 Ağustos 1.000 TL',
      occurredOn: '2026-08-15',
    });
    assert.equal(report(x.store.db, monthRange(2026, 8)).grossPurchases, 1100000);
    assert.equal(report(x.store.db, monthRange(2026, 10)).grossPurchases, 400000);
    const e = x.store.db
      .prepare(
        "SELECT d.occurred_on,e.recorded_at FROM event_days d JOIN event_meta e USING(entity,entity_id) WHERE d.entity='purchase' AND d.entity_id=?",
      )
      .get(historical) as any;
    assert.equal(e.occurred_on, '2026-08-15');
    assert.equal(turkeyDay(e.recorded_at).slice(0, 7), turkeyDay().slice(0, 7));
    for (const table of ['stock_movements', 'supplier_ledger'])
      assert.equal(
        (
          x.store.db
            .prepare(
              `SELECT d.occurred_on FROM ${table} m JOIN event_days d ON d.entity=m.kind AND d.entity_id=m.entity_id WHERE m.kind='purchase' AND m.entity_id=?`,
            )
            .get(historical) as any
        ).occurred_on,
        '2026-08-15',
      );
    assert.equal(
      (
        x.store.db
          .prepare(
            'SELECT d.occurred_on FROM cash_transactions c JOIN supplier_payments p ON p.id=c.entity_id AND c.kind=p.kind JOIN event_days d ON d.entity=p.kind AND d.entity_id=p.id WHERE p.purchase_id=?',
          )
          .get(historical) as any
      ).occurred_on,
      '2026-08-15',
    );
  } finally {
    x.store.close();
  }
});
test('ay sınırları, artık yıl, farklı yıl ve Türkiye gece yarısı', () => {
  assert.equal(monthRange(2024, 2, '2026-10-15').end, '2024-02-29');
  assert.equal(monthRange(2025, 2).end, '2025-02-28');
  assert.equal(monthRange(2026, 10, '2026-10-15').end, '2026-10-15');
  assert.equal(monthRange(2026, 9, '2026-10-15').end, '2026-09-30');
  assert.equal(turkeyDay('2026-09-30T21:00:00Z'), '2026-10-01');
  assert.equal(turkeyDay('2026-09-30T20:59:59Z'), '2026-09-30');
  assert.throws(() => dayISO('2025-02-29'));
  assert.throws(() => monthRange(2026, 13));
  assert.equal(dayBounds('2015-01-01', '2015-01-01').from, '2014-12-31T22:00:00.000Z');
  assert.equal(dayBounds('2026-10-01', '2026-10-01').from, '2026-09-30T21:00:00.000Z');
});
test('geçmiş alış: maliyet önizlemesi salt okunur, onay zorunlu, sürüm denetlenebilir ve tekrar güvenli', async () => {
  const x = fixture();
  try {
    x.purchase('2026-08-01', 1000, 10000);
    const sale = x.sale('2026-09-01', 3000, 4000);
    x.collect('2026-09-10', 4000);
    const original = x.store.db.prepare('SELECT * FROM sale_items WHERE document_id=?').get(sale);
    const recorded = x.store.db
      .prepare("SELECT * FROM event_meta WHERE entity='sale' AND entity_id=?")
      .get(sale);
    const command = {
      type: 'purchase',
      operationId: randomUUID(),
      occurredOn: '2026-08-15',
      supplierId: x.supplierId,
      lines: [{ productId: x.productId, quantity: 10000, price: 2000 }],
      note: 'Geçmiş alış',
      paid: true,
    } as const;
    const state = () =>
      JSON.stringify({
        products: x.store.db.prepare('SELECT * FROM products').all(),
        operations: x.store.db.prepare('SELECT * FROM operations').all(),
        meta: x.store.db.prepare('SELECT * FROM event_meta').all(),
        versions: x.store.db.prepare('SELECT * FROM movement_cost_versions').all(),
        cash: x.store.db.prepare('SELECT * FROM cash_transactions').all(),
        suppliers: x.store.db.prepare('SELECT * FROM supplier_ledger').all(),
        activity: x.store.db.prepare('SELECT * FROM activity').all(),
      });
    const before = state();
    const p = x.store.preview(command);
    assert.equal(state(), before);
    assert.equal(p.required, true);
    assert.equal(p.changes[0].month, '2026-09');
    assert.equal(p.changes[0].profitDelta, -2000);
    assert.throws(() => x.store.execute(command), /önizlemesini/);
    assert.equal(state(), before);
    const id = x.store.execute(command, p.token);
    assert.equal(x.store.execute(command, p.token), id);
    const s = x.store.snapshot();
    assert.equal(s.products[0].stock, 16000);
    assert.equal(s.products[0].cost, 24000);
    assert.equal(s.sales[0].total, 12000);
    assert.equal(s.sales[0].cost, 6000);
    assert.equal(s.customers[0].balance, 8000);
    assert.deepEqual(
      x.store.db.prepare('SELECT * FROM sale_items WHERE document_id=?').get(sale),
      original,
    );
    assert.deepEqual(
      x.store.db.prepare("SELECT * FROM event_meta WHERE entity='sale' AND entity_id=?").get(sale),
      recorded,
    );
    assert.equal(report(x.store.db, monthRange(2026, 9)).profit, 6000);
    assert.equal(report(x.store.db, monthRange(2026, 8)).grossPurchases, 30000);
    const dates = x.store.db
      .prepare(
        "SELECT e.entity,d.occurred_on,e.recorded_at FROM event_meta e JOIN event_days d USING(entity,entity_id) WHERE e.entity_id=? AND e.entity='purchase'",
      )
      .get(id) as any;
    assert.equal(dates.occurred_on, '2026-08-15');
    assert.equal(turkeyDay(dates.recorded_at), turkeyDay());
    const paid = x.store.db
      .prepare(
        'SELECT d.occurred_on FROM supplier_payments p JOIN event_days d ON d.entity=p.kind AND d.entity_id=p.id WHERE p.purchase_id=?',
      )
      .get(id) as any;
    assert.equal(paid.occurred_on, '2026-08-15');
    const gui = view(x.store.db, x.store.file, viewSchema.parse({ page: 'sales' }));
    assert.equal(gui.sales[0].cost, 6000);
    assert.equal(gui.saleItems[0].cost, 6000);
    const backup = path.join(path.dirname(x.store.file), 'verified.db');
    await x.store.backup(backup);
    Store.validateBackup(backup);
    const file = x.store.file;
    x.store.close();
    const reopened = new Store(file);
    try {
      assert.equal(reopened.snapshot().products[0].cost, 24000);
      assert.equal(report(reopened.db, monthRange(2026, 9)).profit, 6000);
    } finally {
      reopened.close();
    }
  } finally {
    if (x.store.db.open) x.store.close();
  }
});
test('geçmiş satış: bugünkü stok yeterliyken ara tarihte negatif stok açıklamalı ve atomik reddedilir', () => {
  const x = fixture();
  try {
    x.purchase('2026-08-01', 1000, 10000);
    x.sale('2026-08-10', 3000, 8000);
    x.purchase('2026-09-01', 2000, 10000);
    const command = {
      type: 'sale',
      operationId: randomUUID(),
      occurredOn: '2026-08-05',
      customerId: x.customerId,
      lines: [{ productId: x.productId, quantity: 3000, price: 3000 }],
      note: '',
    };
    const before = x.store.snapshot();
    const n = (t: string) => (x.store.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as any).n;
    const counts = [
      'operations',
      'event_meta',
      'event_days',
      'cost_revisions',
      'movement_cost_versions',
    ].map(n);
    assert.throws(() => x.store.preview(command), /10.08.2026.*eksik 1 Kg/);
    assert.throws(() => x.store.execute(command), /tarihsel stok/);
    assert.deepEqual(x.store.snapshot(), before);
    assert.deepEqual(
      ['operations', 'event_meta', 'event_days', 'cost_revisions', 'movement_cost_versions'].map(n),
      counts,
    );
    assert.throws(() => x.sale('2026-07-01', 3000, 1000), /2026-07-01.*eksik 1 Kg/);
  } finally {
    x.store.close();
  }
});
test('geçmiş satış kabulü, aynı günün sonuna ekleme, tarih anahtarın parçası ve gelecek gün reddi', () => {
  const x = fixture();
  try {
    x.purchase('2026-08-01', 1000, 10000);
    x.purchase('2026-09-01', 2000, 10000);
    const command = {
      type: 'sale',
      operationId: randomUUID(),
      occurredOn: '2026-08-15',
      customerId: x.customerId,
      lines: [{ productId: x.productId, quantity: 2000, price: 3000 }],
      note: '',
    };
    const id = x.store.execute(command);
    assert.equal(x.store.snapshot().sales[0].cost, 2000);
    assert.equal(x.store.execute(command), id);
    assert.throws(
      () => x.store.execute({ ...command, occurredOn: '2026-08-16' }),
      /farklı içerikle/,
    );
    const same = x.sale('2026-09-01', 3000, 1000);
    assert.equal(
      (x.store.db.prepare('SELECT cost FROM sales WHERE id=?').get(same) as any).cost,
      1556,
    );
    assert.throws(
      () => x.store.execute({ ...command, operationId: randomUUID(), occurredOn: '2099-01-01' }),
      /Gelecek/,
    );
    x.run({ type: 'expense', amount: 100, note: 'Bugün' });
    const d = x.store.db
      .prepare("SELECT occurred_on FROM event_days WHERE entity='expense'")
      .get() as any;
    assert.equal(d.occurred_on, turkeyDay());
  } finally {
    x.store.close();
  }
});
test('geçmiş alış satış iptali, fire ve tedarikçi iadesinin maliyetini uzlaştırır; sonraki ay iptal eski dönemi silmez', async () => {
  const x = fixture();
  try {
    const first = x.purchase('2026-07-01', 1000, 10000);
    const s = x.sale('2026-08-01', 3000, 2000);
    x.run({ type: 'reverse', entity: 'sale', id: s, reason: 'İade', occurredOn: '2026-09-01' });
    const item = (
      x.store.db.prepare('SELECT id FROM purchase_items WHERE document_id=?').get(first) as any
    ).id;
    const ret = x.run({
      type: 'supplier_return',
      purchaseId: first,
      lines: [{ itemId: item, quantity: 1000 }],
      note: 'İade',
      occurredOn: '2026-09-02',
    });
    x.run({
      type: 'reverse',
      entity: 'supplier_return',
      id: ret,
      reason: 'Geri alındı',
      occurredOn: '2026-09-03',
    });
    x.run({
      type: 'adjust',
      productId: x.productId,
      quantity: -1000,
      reason: 'Fire',
      occurredOn: '2026-09-04',
    });
    const c = {
      type: 'purchase',
      operationId: randomUUID(),
      supplierId: x.supplierId,
      lines: [{ productId: x.productId, quantity: 10000, price: 2000 }],
      note: '',
      paid: false,
      occurredOn: '2026-07-15',
    };
    const p = x.store.preview(c);
    assert.ok(p.changes.some((r) => r.month === '2026-08'));
    assert.ok(p.changes.some((r) => r.month === '2026-09'));
    x.store.execute(c, p.token);
    const aug = report(x.store.db, monthRange(2026, 8)),
      sep = report(x.store.db, monthRange(2026, 9));
    assert.equal(aug.revenue, 6000);
    assert.equal(aug.cogs, 3000);
    assert.equal(sep.revenue, -6000);
    assert.equal(sep.cogs, -3000);
    assert.equal(sep.fire, 1500);
    assert.equal(sep.returnVariance, 0);
    const backup = path.join(path.dirname(x.store.file), 'returns.db');
    await x.store.backup(backup);
    Store.validateBackup(backup);
  } finally {
    x.store.close();
  }
});
test('bayat maliyet onayı reddedilir, onaylı yazıda aktivite hatası maliyet sürümlerini de geri alır', () => {
  const x = fixture();
  try {
    x.purchase('2026-08-01', 1000, 10000);
    x.sale('2026-09-01', 3000, 4000);
    const c = {
      type: 'purchase',
      operationId: randomUUID(),
      supplierId: x.supplierId,
      lines: [{ productId: x.productId, quantity: 10000, price: 2000 }],
      note: '',
      paid: false,
      occurredOn: '2026-08-15',
    };
    const p = x.store.preview(c);
    x.run({ type: 'expense', amount: 100, note: 'Başka işlem' });
    assert.throws(() => x.store.execute(c, p.token), /önizlemesini/);
    const fresh = x.store.preview(c),
      before = x.store.snapshot();
    const versions = x.store.db.prepare('SELECT * FROM movement_cost_versions').all();
    x.store.db.exec(
      "CREATE TRIGGER fail_late_activity BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT,'forced historical failure'); END",
    );
    assert.throws(() => x.store.execute(c, fresh.token), /forced historical/);
    assert.deepEqual(x.store.snapshot(), before);
    assert.deepEqual(x.store.db.prepare('SELECT * FROM movement_cost_versions').all(), versions);
    x.store.db.exec(
      "DROP TRIGGER fail_late_activity;CREATE TRIGGER fail_after_cost BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT,'forced after cost revision'); END",
    );
    assert.throws(() => x.store.execute(c, fresh.token), /forced after cost/);
    assert.deepEqual(x.store.snapshot(), before);
    assert.deepEqual(x.store.db.prepare('SELECT * FROM movement_cost_versions').all(), versions);
  } finally {
    x.store.close();
  }
});
test('aylık ekstre bütün sayfalarda aynı toplam, boş ay ve ayrı müşteri', () => {
  const x = fixture();
  try {
    x.purchase('2026-07-01', 1000, 100000);
    for (let i = 0; i < 61; i++) x.sale('2026-08-15', 100, 1000);
    const a = statement(x.store.db, x.customerId, monthRange(2026, 8)),
      b = statement(x.store.db, x.customerId, monthRange(2026, 8), 50);
    assert.equal(a.total, 61);
    assert.equal(a.rows.length, 50);
    assert.equal(b.rows.length, 11);
    assert.equal(a.closing, b.closing);
    assert.equal(b.rows.at(-1)?.balance, a.closing);
    assert.equal(
      [...a.rows, ...b.rows].reduce((n, r) => n + r.amount, 0),
      a.sales,
    );
    assert.equal(statement(x.store.db, x.customerId, monthRange(2026, 9)).opening, 6100);
  } finally {
    x.store.close();
  }
});
test('v4-v5 geçişi gerçek kayıt zamanını ve özgün maliyeti korur; geçiş yedeği doğrulanır', async () => {
  const x = fixture();
  x.purchase('2026-08-15', 1000, 10000);
  x.sale('2026-09-01', 3000, 1000);
  const original = x.store.db.prepare('SELECT * FROM event_meta').all();
  x.store.db.exec(
    'DROP TABLE expense_details;DROP TABLE corrections;DROP TABLE deleted_records;ALTER TABLE customers DROP COLUMN active;ALTER TABLE suppliers DROP COLUMN active;DROP VIEW preorder_summary;DROP TABLE preorder_funding;DROP TABLE preorder_events;DROP TABLE preorders;DROP TABLE customer_adjustments;DROP VIEW effective_movements;DROP TABLE movement_cost_versions;DROP TABLE cost_revisions;DROP TABLE event_days;PRAGMA user_version=4',
  );
  x.store.close();
  const migrated = await Store.openMigrating(x.store.file);
  try {
    assert.equal(migrated.db.pragma('user_version', { simple: true }), 11);
    assert.deepEqual(migrated.db.prepare('SELECT * FROM event_meta').all(), original);
    const backup = path.join(path.dirname(x.store.file), 'migrated.db');
    await migrated.backup(backup);
    Store.validateBackup(backup);
    const readonly = new Database(backup, { readonly: true });
    try {
      assert.equal((readonly.prepare('SELECT COUNT(*) n FROM event_days').get() as any).n, 2);
    } finally {
      readonly.close();
    }
  } finally {
    migrated.close();
  }
});
test('sonraki hareketten sonra alış iptali: ortalama maliyet ve fark kendi döneminde', async () => {
  const x = fixture();
  try {
    const first = x.purchase('2026-08-01', 1000, 10000);
    x.purchase('2026-08-02', 2000, 10000);
    x.sale('2026-08-15', 3000, 4000);
    const before = report(x.store.db, monthRange(2026, 8));
    x.run({
      type: 'reverse',
      entity: 'purchase',
      id: first,
      reason: 'Alış iptal',
      occurredOn: '2026-09-01',
    });
    const aug = report(x.store.db, monthRange(2026, 8)),
      sep = report(x.store.db, monthRange(2026, 9));
    assert.equal(aug.profit, before.profit);
    assert.equal(aug.grossPurchases, 30000);
    assert.equal(sep.purchaseReturns, 10000);
    assert.equal(sep.returnVariance, -5000);
    assert.equal(x.store.snapshot().products[0].stock, 6000);
    assert.equal(x.store.snapshot().products[0].cost, 9000);
    const backup = path.join(path.dirname(x.store.file), 'cancel.db');
    await x.store.backup(backup);
    Store.validateBackup(backup);
  } finally {
    x.store.close();
  }
});
test('geçmiş maliyet revizyonundan sonra kaydedilen yeni satış iptali güncel maliyeti geri alır', async () => {
  const x = fixture();
  try {
    x.purchase('2026-07-01', 1000, 10000);
    const s = x.sale('2026-08-01', 3000, 4000);
    const c = {
      type: 'purchase',
      operationId: randomUUID(),
      supplierId: x.supplierId,
      lines: [{ productId: x.productId, quantity: 10000, price: 2000 }],
      note: '',
      paid: false,
      occurredOn: '2026-07-15',
    };
    x.store.execute(c, x.store.preview(c).token);
    x.run({ type: 'reverse', entity: 'sale', id: s, reason: 'Tam iade', occurredOn: '2026-09-01' });
    assert.equal(report(x.store.db, monthRange(2026, 8)).cogs, 6000);
    assert.equal(report(x.store.db, monthRange(2026, 9)).cogs, -6000);
    assert.equal(x.store.snapshot().products[0].cost, 30000);
    assert.equal(x.store.snapshot().products[0].stock, 20000);
    assert.equal(report(x.store.db, monthRange(2026, 8)).costRevisionCount, 1);
    const backup = path.join(path.dirname(x.store.file), 'after-recost.db');
    await x.store.backup(backup);
    Store.validateBackup(backup);
  } finally {
    x.store.close();
  }
});
