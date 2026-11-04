import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Store } from '../electron/store';
import { report, statement, customerCSV } from '../electron/reports';
import { customerBalance } from '../shared/money';
import { view } from '../electron/view';
import { viewSchema } from '../shared/contracts';
function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'sucukcenter-accounts-'));
  let store = new Store(path.join(root, 'sucukcenter.db'));
  const run = (c: any) =>
    store.execute(
      ['customer', 'supplier', 'product', 'settings'].includes(c.type)
        ? c
        : { operationId: randomUUID(), ...c },
    );
  const c = run({ type: 'customer', name: 'Cari Test Büfe', address: '', phone: '', contact: '' });
  const p = run({
    type: 'product',
    name: 'Test Sucuk',
    unit: 'Kg',
    price: 10000,
    critical: 0,
    active: true,
  });
  const s = run({ type: 'supplier', name: 'Test Tedarikçi', address: '', phone: '', contact: '' });
  run({
    type: 'purchase',
    supplierId: s,
    lines: [{ productId: p, quantity: 20000, price: 1000 }],
    paid: false,
    note: '',
    occurredOn: '2026-01-01',
  });
  return {
    root,
    run,
    c,
    p,
    get store() {
      return store;
    },
    reopen() {
      store.close();
      store = new Store(store.file);
    },
    cleanup() {
      store.close();
      assert.ok(path.basename(root).startsWith('sucukcenter-accounts-'));
      rmSync(root, { recursive: true, force: true });
    },
  };
}
test('cari 1000 borç → 1500 tahsilat → 200 satış → 300 iade; avans ve doğrudan alacak; yedek/yeniden açma', async () => {
  const x = setup();
  try {
    const before = x.store.snapshot();
    x.run({
      type: 'customer_debt',
      customerId: x.c,
      amount: 100000,
      category: 'carry',
      note: 'Devir',
      reference: 'DEV-1',
      occurredOn: '2026-01-10',
    });
    const debt = x.store.snapshot();
    assert.equal(x.store.balance(x.c), 100000);
    for (const k of ['cash', 'revenue', 'cogs', 'profit'] as const)
      assert.equal(debt.summary[k], before.summary[k]);
    assert.deepEqual(debt.products, before.products);
    x.run({
      type: 'collection',
      customerId: x.c,
      amount: 150000,
      method: 'Nakit',
      note: 'Avans dahil',
      occurredOn: '2026-02-01',
    });
    assert.equal(x.store.balance(x.c), -50000);
    assert.equal(x.store.snapshot().summary.cash, 150000);
    x.run({
      type: 'sale',
      customerId: x.c,
      lines: [{ productId: x.p, quantity: 2000, price: 10000 }],
      note: '',
      occurredOn: '2026-02-02',
    });
    assert.equal(x.store.balance(x.c), -30000);
    assert.equal(x.store.snapshot().products[0].stock, 18000);
    x.run({
      type: 'refund',
      customerId: x.c,
      amount: 30000,
      method: 'Banka',
      note: 'Avans iadesi',
      occurredOn: '2026-02-03',
    });
    assert.equal(x.store.balance(x.c), 0);
    assert.equal(x.store.snapshot().summary.cash, 120000);
    const advance = x.run({
      type: 'collection',
      customerId: x.c,
      amount: 75000,
      method: 'Nakit',
      note: 'Sıfır bakiyede avans',
    });
    assert.equal(x.store.balance(x.c), -75000);
    const cash = x.store.snapshot().summary.cash;
    const credit = x.run({
      type: 'customer_credit',
      customerId: x.c,
      amount: 40000,
      note: 'Mutabakat alacağı',
    });
    assert.equal(x.store.balance(x.c), -115000);
    assert.equal(x.store.snapshot().summary.cash, cash);
    const backup = path.join(x.root, 'backup.db');
    await x.store.backup(backup);
    Store.validateBackup(backup);
    x.reopen();
    assert.equal(x.store.balance(x.c), -115000);
    x.run({ type: 'reverse', entity: 'customer_credit', id: credit, reason: 'Hatalı mutabakat' });
    assert.equal(x.store.balance(x.c), -75000);
    assert.equal(x.store.snapshot().summary.cash, cash);
    x.run({ type: 'reverse', entity: 'collection', id: advance, reason: 'Yanlış tahsilat' });
    assert.equal(x.store.balance(x.c), 0);
    assert.equal(x.store.snapshot().summary.cash, 120000);
    const recovery = await x.store.restore(backup);
    assert.equal(x.store.balance(x.c), -115000);
    Store.validateBackup(recovery);
    await x.store.restore(recovery);
    assert.equal(x.store.balance(x.c), 0);
  } finally {
    x.cleanup();
  }
});
test('cari atomiklik, mükerrer anahtar, gerekçe, tekrar iptal ve değiştirilemez kaynak', async () => {
  const x = setup();
  try {
    const c = {
      type: 'customer_debt',
      customerId: x.c,
      amount: 100000,
      category: 'other',
      note: 'Cari borç',
      operationId: randomUUID(),
      occurredOn: '2026-01-01',
    };
    const id = x.run(c);
    const before = x.store.snapshot();
    assert.equal(x.run(c), id);
    assert.deepEqual(x.store.snapshot(), before);
    assert.throws(() => x.run({ ...c, amount: 200000 }), /farklı içerik/);
    assert.throws(() => x.run({ ...c, operationId: randomUUID(), note: '   ' }));
    assert.throws(() => x.run({ ...c, operationId: randomUUID(), customerId: 999 }));
    assert.throws(() => x.run({ ...c, operationId: randomUUID(), amount: 0 }));
    assert.throws(() => x.store.db.exec('DELETE FROM customer_adjustments'), /silinemez/);
    assert.throws(
      () => x.store.db.exec('UPDATE customer_adjustments SET amount=1'),
      /ters hareket/,
    );
    assert.throws(() => x.run({ type: 'reverse', entity: 'customer_debt', id, reason: '' }));
    assert.throws(
      () =>
        x.run({
          type: 'reverse',
          entity: 'customer_debt',
          id,
          reason: 'Erken iptal',
          occurredOn: '2025-12-31',
        }),
      /önce/,
    );
    const rev = {
      type: 'reverse',
      entity: 'customer_debt',
      id,
      reason: 'Düzeltme',
      occurredOn: '2026-02-01',
      operationId: randomUUID(),
    };
    x.run(rev);
    assert.equal(x.store.balance(x.c), 0);
    const n = x.store.db.prepare('SELECT COUNT(*) n FROM customer_ledger').get();
    x.run(rev);
    assert.deepEqual(x.store.db.prepare('SELECT COUNT(*) n FROM customer_ledger').get(), n);
    assert.throws(() => x.run({ ...rev, operationId: randomUUID() }), /zaten iptal/);
    // Force the last write to fail: source, ledger and activity must all roll back.
    const state = x.store.snapshot();
    x.store.db.exec(
      "CREATE TRIGGER test_fail_operation BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT,'fault injection'); END;",
    );
    assert.throws(
      () => x.run({ type: 'customer_credit', customerId: x.c, amount: 40000, note: 'Rollback' }),
      /fault injection/,
    );
    x.store.db.exec('DROP TRIGGER test_fail_operation');
    assert.deepEqual(x.store.snapshot(), state);
    await x.store.backup(path.join(x.root, 'valid.db'));
  } finally {
    x.cleanup();
  }
});
test('geçmiş cari kayıtlar: ay devri, CSV, ayrı borç/alacak toplamları, faaliyet ve detay', () => {
  const x = setup();
  try {
    const id = x.run({
      type: 'customer_debt',
      customerId: x.c,
      amount: 100000,
      category: 'carry',
      note: 'Eski borç',
      reference: 'DEV-99',
      occurredOn: '2026-01-10',
    });
    x.run({
      type: 'customer_credit',
      customerId: x.c,
      amount: 40000,
      note: 'Alacak',
      occurredOn: '2026-02-10',
    });
    x.run({
      type: 'reverse',
      entity: 'customer_debt',
      id,
      reason: 'Yanlış devir',
      occurredOn: '2026-03-01',
    });
    const january = statement(x.store.db, x.c, { start: '2026-01-01', end: '2026-01-31' });
    assert.equal(january.closing, 100000);
    assert.equal(january.adjustments, 100000);
    assert.equal(january.sales, 0);
    assert.equal(january.collections, 0);
    const feb = statement(x.store.db, x.c, { start: '2026-02-01', end: '2026-02-28' });
    assert.equal(feb.opening, 100000);
    assert.equal(feb.closing, 60000);
    assert.equal(
      statement(x.store.db, x.c, { start: '2026-03-01', end: '2026-03-31' }).closing,
      -40000,
    );
    const csv = customerCSV(x.store.db, x.c, {});
    assert.ok(csv.includes('DEV-99'));
    assert.ok(csv.includes('customer_debt'));
    assert.ok(csv.includes('Müşteri alacaklı'));
    const c2 = x.run({
      type: 'customer',
      name: 'Borçlu Test',
      address: '',
      contact: '',
      phone: '',
    });
    x.run({
      type: 'customer_debt',
      customerId: c2,
      amount: 10000,
      category: 'other',
      note: 'Borç',
    });
    assert.equal(x.store.snapshot().summary.debt, 10000);
    assert.equal(x.store.snapshot().summary.credit, 40000);
    const r = report(x.store.db, {});
    assert.equal(r.endingDebt, 10000);
    assert.equal(r.endingCredit, 40000);
    assert.equal(r.revenue, 0);
    assert.equal(r.collected, 0);
    const v = view(
      x.store.db,
      x.store.file,
      viewSchema.parse({
        page: 'customers',
        customerId: x.c,
        focusEntity: 'customer_debt',
        focusId: id,
      }),
    );
    assert.equal(v.customerAdjustments?.find((a) => a.id === id)?.reference, 'DEV-99');
    assert.ok(v.activities.some((a) => a.entity === 'customer_debt' && a.customer_id === x.c));
    assert.equal(customerBalance(-50000), '+500,00 TL · Müşteri alacaklı');
    assert.equal(customerBalance(50000), '500,00 TL · Müşteri borçlu');
    assert.equal(customerBalance(0), 'Hesap kapalı / bakiye sıfır');
  } finally {
    x.cleanup();
  }
});
test('şema 5 → 6 doğrulanmış yedek ve bakiye koruma', async () => {
  const x = setup();
  let migrated: Store | undefined;
  try {
    x.run({
      type: 'sale',
      customerId: x.c,
      lines: [{ productId: x.p, quantity: 1000, price: 10000 }],
      note: '',
    });
    x.run({ type: 'collection', customerId: x.c, amount: 4000, method: 'Nakit', note: '' });
    x.run({
      type: 'settings',
      company: 'Eski Firma',
      theme: 'light',
      autoBackup: false,
      retention: 5,
    });
    const before = x.store.snapshot();
    x.store.db.exec(
      'DROP TABLE expense_details;DROP TABLE corrections;DROP TABLE deleted_records;ALTER TABLE customers DROP COLUMN active;ALTER TABLE suppliers DROP COLUMN active;DROP VIEW preorder_summary;DROP TABLE preorder_funding;DROP TABLE preorder_events;DROP TABLE preorders;DROP TABLE customer_adjustments',
    );
    x.store.db.pragma('user_version=5');
    const file = x.store.file;
    x.store.close();
    assert.throws(() => new Store(file), /doğrulanmış/);
    migrated = await Store.openMigrating(file);
    assert.equal(migrated.balance(x.c), 6000);
    assert.deepEqual(migrated.snapshot().customers, before.customers);
    assert.deepEqual(migrated.snapshot().settings, before.settings);
    assert.equal(migrated.db.pragma('user_version', { simple: true }), 11);
    const backups = readdirSync(path.join(x.root, 'yedekler')).filter((f) => f.endsWith('.db'));
    assert.equal(backups.length, 1);
    Store.validateBackup(path.join(x.root, 'yedekler', backups[0]));
    await migrated.restore(path.join(x.root, 'yedekler', backups[0]));
    assert.equal(migrated.balance(x.c), 6000);
  } finally {
    migrated?.close();
    x.cleanup();
  }
});
test('migration hatasında sürüm ve eski bakiyeler korunur; geri dönüş yedeği doğrulanır', async () => {
  const x = setup();
  try {
    x.run({
      type: 'sale',
      customerId: x.c,
      lines: [{ productId: x.p, quantity: 1000, price: 10000 }],
      note: '',
    });
    x.store.db.exec(
      'DROP TABLE corrections;DROP TABLE deleted_records;ALTER TABLE customers DROP COLUMN active;ALTER TABLE suppliers DROP COLUMN active;DROP VIEW preorder_summary;DROP TABLE preorder_funding;DROP TABLE preorder_events;DROP TABLE preorders;DROP TABLE customer_adjustments;CREATE TABLE customer_adjustments(blocker INTEGER) STRICT;PRAGMA user_version=5',
    );
    const file = x.store.file;
    x.store.close();
    await assert.rejects(() => Store.openMigrating(file), /already exists/);
    const Database = (await import('better-sqlite3')).default;
    const check = new Database(file, { readonly: true });
    try {
      assert.equal(check.pragma('user_version', { simple: true }), 5);
      assert.equal(
        (
          check
            .prepare('SELECT SUM(amount) n FROM customer_ledger WHERE customer_id=?')
            .get(x.c) as any
        ).n,
        10000,
      );
    } finally {
      check.close();
    }
    for (const b of readdirSync(path.join(x.root, 'yedekler')).filter((f) => f.endsWith('.db')))
      Store.validateBackup(path.join(x.root, 'yedekler', b));
  } finally {
    x.cleanup();
  }
});
