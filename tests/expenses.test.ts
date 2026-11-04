import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../electron/store';
import { recordInfo } from '../electron/records';
import { report, annualReport } from '../electron/reports';
import { view } from '../electron/view';
import { viewSchema } from '../shared/contracts';
import { monthRange } from '../shared/dates';
import { netResult, netMargin } from '../shared/profit';
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sucukcenter-expenses-'));
  const s = new Store(path.join(root, 'data.db'));
  const run = (c: any) =>
    s.execute(
      ['product', 'customer', 'supplier'].includes(c.type)
        ? c
        : { operationId: randomUUID(), ...c },
    );
  const expense = (name: string, amount: number, day = '2026-10-15') =>
    run({ type: 'expense', name, amount, method: 'Nakit', note: '', occurredOn: day });
  return {
    root,
    s,
    run,
    expense,
    close() {
      s.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
test('gider kabul hesabı: 50.000 satış, 30.000 maliyet, 12.000 gider → 8.000/%16; tamir ile −2.000/−%4', () => {
  const x = fixture();
  try {
    const p = x.run({
      type: 'product',
      name: 'Sentetik ürün',
      unit: 'Kg',
      price: 5000000,
      critical: 0,
      active: true,
    });
    const c = x.run({
      type: 'customer',
      name: 'Sahte müşteri',
      address: '',
      phone: '',
      contact: '',
    });
    const t = x.run({
      type: 'supplier',
      name: 'Sahte tedarikçi',
      address: '',
      phone: '',
      contact: '',
    });
    x.run({
      type: 'purchase',
      supplierId: t,
      lines: [{ productId: p, quantity: 1000, price: 3000000 }],
      paid: false,
      note: '',
      occurredOn: '2026-10-01',
    });
    x.run({
      type: 'sale',
      customerId: c,
      lines: [{ productId: p, quantity: 1000, price: 5000000 }],
      note: '',
      occurredOn: '2026-10-02',
    });
    const before = x.s.snapshot();
    const ids = [
      x.expense('Kira', 800000),
      x.expense('Elektrik', 150000),
      x.expense('Su', 50000),
      x.expense('Mazot', 200000),
    ];
    let r = report(x.s.db, monthRange(2026, 10));
    assert.equal(r.revenue, 5000000);
    assert.equal(r.cogs, 3000000);
    assert.equal(r.profit, 2000000);
    assert.equal(r.expenses, 1200000);
    assert.equal(netResult(r), 800000);
    assert.equal(netMargin(r), 16);
    assert.deepEqual(x.s.snapshot().products, before.products);
    assert.deepEqual(x.s.snapshot().customers, before.customers);
    assert.equal(x.s.snapshot().summary.cash, before.summary.cash - 1200000);
    x.expense('Tamir', 1000000);
    r = report(x.s.db, monthRange(2026, 10));
    assert.equal(r.expenses, 2200000);
    assert.equal(netResult(r), -200000);
    assert.equal(netMargin(r), -4);
    const info = recordInfo(x.s.db, { entity: 'expense', id: ids[3] });
    const cmd = {
      type: 'correct',
      entity: 'expense',
      id: ids[3],
      expected: info.expected,
      reason: 'Tutar hatası',
      operationId: randomUUID(),
      replacement: { ...info.original, operationId: undefined, amount: 150000 },
    };
    const corrected = x.run(cmd);
    assert.equal(x.run(cmd), corrected);
    r = report(x.s.db, monthRange(2026, 10));
    assert.equal(r.expenses, 2150000);
    assert.equal(netResult(r), -150000);
    assert.equal(x.s.snapshot().summary.cash, -2150000);
    assert.throws(() => x.run({ ...cmd, operationId: randomUUID() }), /değişti|iptal|düzeltilmiş/);
  } finally {
    x.close();
  }
});
test('gider iptali özgün ayda; gerçek iade kendi ayında; yıllık/liste/genel toplam, sıfır satış ve negatif satış marjı', async () => {
  const x = fixture();
  try {
    const id = x.expense('Ekim kirası', 800000);
    const wrong = x.expense('Yanlış kayıt', 200000);
    x.run({
      type: 'reverse',
      entity: 'expense',
      id: wrong,
      reason: 'Gerçekleşmedi',
      occurredOn: '2026-11-01',
    });
    let r = report(x.s.db, monthRange(2026, 10));
    assert.equal(r.expenses, 800000);
    assert.equal(netResult(r), -800000);
    assert.equal(netMargin(r), null);
    const cmd = {
      type: 'expense_refund',
      expenseId: id,
      occurredOn: '2026-11-01',
      note: 'Gerçek ödeme iadesi',
      operationId: randomUUID(),
    };
    assert.equal(x.run(cmd), id);
    assert.equal(x.run(cmd), id);
    assert.equal(report(x.s.db, monthRange(2026, 10)).expenses, 800000);
    r = report(x.s.db, monthRange(2026, 11));
    assert.equal(r.expenses, -800000);
    assert.equal(r.cash, 800000);
    assert.equal(netResult(r), 800000);
    assert.equal(netMargin({ ...r, revenue: -100 }), null);
    const annual = annualReport(x.s.db, 2026);
    assert.equal(
      annual.reduce((n, m) => n + m.report.expenses, 0),
      0,
    );
    const v = view(
      x.s.db,
      x.s.file,
      viewSchema.parse({ page: 'expenses', range: monthRange(2026, 11), search: 'kira' }),
    );
    assert.equal(v.expenseTotal, -800000);
    assert.equal(v.expenses?.length, 1);
    assert.equal(v.expenses?.[0].effectKind, 'expense_refund');
    assert.equal(v.summary.expenses, 0);
    assert.equal(
      view(x.s.db, x.s.file, viewSchema.parse({ page: 'expenses', range: monthRange(2025, 1) }))
        .expenseTotal,
      0,
    );
    assert.throws(() => x.run({ ...cmd, operationId: randomUUID() }), /zaten/);
    assert.throws(
      () => x.run({ type: 'reverse', entity: 'expense', id, reason: 'İkinci ters kayıt' }),
      /zaten/,
    );
    const backup = path.join(x.root, 'refund-backup.db');
    await x.s.backup(backup);
    Store.validateBackup(backup);
    await x.s.restore(backup);
    assert.equal(report(x.s.db, monthRange(2026, 11)).expenses, -800000);
    assert.throws(
      () => x.s.db.prepare("UPDATE expense_details SET name='Değişti' WHERE cash_id=?").run(id),
      /değiştirilemez/,
    );
  } finally {
    x.close();
  }
});
test('gider çift gönderim ve hata rollback: gider/kasa/geçmiş/anahtar tek transaction, düzeltme ve iade de atomik', () => {
  const x = fixture();
  try {
    const cmd = {
      type: 'expense',
      name: 'Mazot',
      amount: 200000,
      method: 'Kart',
      note: 'Fiş',
      occurredOn: '2026-10-15',
      operationId: randomUUID(),
    };
    const id = x.run(cmd);
    assert.equal(x.run(cmd), id);
    assert.equal(
      x.s.db.prepare("SELECT COUNT(*) n FROM cash_transactions WHERE kind='expense'").get() &&
        (x.s.db.prepare('SELECT COUNT(*) n FROM expense_details').get() as any).n,
      1,
    );
    const counts = () =>
      [
        'cash_transactions',
        'expense_details',
        'operations',
        'event_meta',
        'activity',
        'corrections',
      ].map((t) => (x.s.db.prepare('SELECT COUNT(*) n FROM ' + t).get() as any).n);
    const before = counts();
    x.s.db.exec(
      "CREATE TRIGGER fail_expense BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT,'sentetik gider hatası'); END;",
    );
    assert.throws(() => x.run({ ...cmd, operationId: randomUUID() }), /sentetik/);
    assert.deepEqual(counts(), before);
    const info = recordInfo(x.s.db, { entity: 'expense', id });
    assert.throws(
      () =>
        x.run({
          type: 'correct',
          operationId: randomUUID(),
          entity: 'expense',
          id,
          expected: info.expected,
          reason: 'Test',
          replacement: { ...info.original, amount: 150000 },
        }),
      /sentetik/,
    );
    assert.deepEqual(counts(), before);
    assert.throws(
      () =>
        x.run({
          type: 'expense_refund',
          expenseId: id,
          note: 'Test iade',
          occurredOn: '2026-11-01',
        }),
      /sentetik/,
    );
    assert.deepEqual(counts(), before);
    x.s.db.exec('DROP TRIGGER fail_expense');
    assert.throws(() => x.expense('', 200));
    assert.throws(() => x.expense('Sıfır', 0));
    assert.throws(
      () =>
        x.run({ type: 'expense_refund', expenseId: id, note: 'Erken', occurredOn: '2026-10-01' }),
      /önce/,
    );
    assert.deepEqual(counts(), before);
  } finally {
    x.close();
  }
});
test('gider tarih/ad araması ve sayfalama sınırlı; büyük tutar ve uzun ad; kapat/aç, doğrulanmış yedek ve geri dönüş', async () => {
  const x = fixture();
  let reopened: Store | undefined;
  try {
    for (let i = 0; i < 65; i++)
      x.expense('Araç ' + i, 100 + i, i % 2 ? '2026-10-15' : '2026-10-16');
    x.expense('İ'.repeat(200), 1000000000000);
    const v = view(x.s.db, x.s.file, viewSchema.parse({ page: 'expenses', search: 'araç' }));
    assert.equal(v.expenses?.length, 50);
    assert.equal(v.pagination?.total, 65);
    assert.equal(v.expenseTotal, 65 * 100 + (64 * 65) / 2);
    const next = view(
      x.s.db,
      x.s.file,
      viewSchema.parse({ page: 'expenses', search: 'ARAÇ', offset: 50 }),
    );
    assert.equal(next.expenses?.length, 15);
    assert.equal(new Set([...v.expenses!, ...next.expenses!].map((e) => e.effectId)).size, 65);
    const before = x.s.snapshot().summary;
    const backup = path.join(x.root, 'backup.db');
    await x.s.backup(backup);
    Store.validateBackup(backup);
    x.expense('Sonra', 100);
    await x.s.restore(backup);
    assert.deepEqual(x.s.snapshot().summary, before);
    const file = x.s.file;
    x.s.close();
    reopened = new Store(file);
    assert.deepEqual(reopened.snapshot().summary, before);
    assert.equal(
      (reopened.db.prepare('SELECT COUNT(*) n FROM expense_details').get() as any).n,
      66,
    );
  } finally {
    reopened?.close();
    x.close();
  }
});
