import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../electron/store';
import { recordInfo } from '../electron/records';
import { view } from '../electron/view';
import { viewSchema, type RecordRef } from '../shared/contracts';
import { report, statement } from '../electron/reports';
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sucukcenter-records-'));
  const s = new Store(path.join(root, 'test.db'));
  const run = (c: any) =>
    s.execute(
      ['product', 'customer', 'supplier', 'settings'].includes(c.type)
        ? c
        : { operationId: randomUUID(), ...c },
    );
  const p = run({
    type: 'product',
    name: 'Sahte Sucuk',
    unit: 'Kg',
    price: 3500,
    critical: 0,
    active: true,
  });
  const c = run({ type: 'customer', name: 'Ahmet Test', address: '', contact: '', phone: '' });
  const c2 = run({ type: 'customer', name: 'İkinci Test', address: '', contact: '', phone: '' });
  const supplier = run({
    type: 'supplier',
    name: 'Test Tedarik',
    address: '',
    contact: '',
    phone: '',
  });
  return {
    root,
    s,
    run,
    p,
    c,
    c2,
    supplier,
    close() {
      s.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
function correct(x: ReturnType<typeof fixture>, ref: RecordRef, patch: any) {
  const i = recordInfo(x.s.db, ref);
  return {
    type: 'correct',
    operationId: randomUUID(),
    ...ref,
    expected: i.expected,
    reason: 'Yanlış kayıt düzeltmesi',
    replacement: { ...i.original, ...patch, operationId: undefined },
  };
}
test('hareketsiz kart kalıcı silinir, kimlik tekrar kullanılmaz; geçmişli kart arşivlenir, aktif listeden kalkar ve geri alınır', async () => {
  const x = fixture();
  try {
    for (const [entity, id] of [
      ['product', x.p],
      ['customer', x.c],
      ['supplier', x.supplier],
    ] as const) {
      const info = recordInfo(x.s.db, { entity, id });
      assert.equal(info.dependencies.length, 0);
      x.run({ type: 'manage', entity, id, action: 'delete', expected: info.expected });
      assert.throws(() => recordInfo(x.s.db, { entity, id }), /bulunamadı/);
    }
    const p = x.run({
      type: 'product',
      name: 'Yeni Test',
      unit: 'Kg',
      price: 100,
      critical: 0,
      active: true,
    });
    assert.ok(p > x.p);
    const i = recordInfo(x.s.db, { entity: 'customer', id: x.c2 });
    x.run({
      type: 'customer_debt',
      customerId: x.c2,
      amount: 10000,
      category: 'other',
      note: 'Borç',
    });
    assert.throws(
      () =>
        x.run({
          type: 'manage',
          entity: 'customer',
          id: x.c2,
          action: 'delete',
          expected: i.expected,
        }),
      /değişti/,
    );
    let info = recordInfo(x.s.db, { entity: 'customer', id: x.c2 });
    assert.ok(info.dependencies.length);
    assert.throws(
      () =>
        x.run({
          type: 'manage',
          entity: 'customer',
          id: x.c2,
          action: 'delete',
          expected: info.expected,
        }),
      /silinemez/,
    );
    x.run({
      type: 'manage',
      entity: 'customer',
      id: x.c2,
      action: 'archive',
      expected: info.expected,
    });
    assert.equal(x.s.balance(x.c2), 10000);
    assert.equal(
      view(x.s.db, x.s.file, viewSchema.parse({ page: 'customers' })).customers.length,
      0,
    );
    assert.equal(
      view(x.s.db, x.s.file, viewSchema.parse({ page: 'customers', includeArchived: true }))
        .customers.length,
      1,
    );
    // Archived account can still receive a settlement.
    x.run({ type: 'collection', customerId: x.c2, amount: 10000, method: 'Nakit', note: 'Kapama' });
    assert.equal(x.s.balance(x.c2), 0);
    info = recordInfo(x.s.db, { entity: 'customer', id: x.c2 });
    x.run({
      type: 'manage',
      entity: 'customer',
      id: x.c2,
      action: 'restore',
      expected: info.expected,
    });
    const backup = path.join(x.root, 'backup.db');
    await x.s.backup(backup);
    Store.validateBackup(backup);
  } finally {
    x.close();
  }
});
test('100→150 TL tahsilat: net kasa +50, müşteri değişimi ve tekrar/idempotency; yedek geri yükle ve yeniden aç', async () => {
  const x = fixture();
  try {
    const id = x.run({
      type: 'collection',
      customerId: x.c,
      amount: 10000,
      method: 'Nakit',
      note: 'Özgün',
    });
    const cmd = correct(x, { entity: 'collection', id }, { amount: 15000 });
    const next = x.run(cmd);
    assert.equal(x.s.snapshot().summary.cash, 15000);
    assert.equal(x.s.balance(x.c), -15000);
    assert.equal(x.run(cmd), next);
    assert.equal(x.s.snapshot().summary.cash, 15000);
    assert.equal(recordInfo(x.s.db, { entity: 'collection', id }).corrections.length, 1);
    const change = correct(
      x,
      { entity: 'collection', id: next },
      { customerId: x.c2, method: 'Banka' },
    );
    const last = x.run(change);
    assert.equal(x.s.balance(x.c), 0);
    assert.equal(x.s.balance(x.c2), -15000);
    assert.equal(x.s.snapshot().summary.cash, 15000);
    const backup = path.join(x.root, 'backup.db');
    await x.s.backup(backup);
    Store.validateBackup(backup);
    x.run({ type: 'expense', amount: 100, note: 'Sonra' });
    await x.s.restore(backup);
    assert.equal(x.s.snapshot().summary.cash, 15000);
    x.s.close();
    const again = new Store(x.s.file);
    assert.equal(again.balance(x.c2), -15000);
    assert.equal(
      recordInfo(again.db, { entity: 'collection', id: last }).original?.type,
      'collection',
    );
    again.close();
  } finally {
    x.close();
  }
});
test('10→8kg satış düzeltmesi: net stok +2kg, 70 TL cari ve 50 TL maliyet azalması; geçersiz düzeltme atomik', async () => {
  const x = fixture();
  try {
    x.run({
      type: 'purchase',
      supplierId: x.supplier,
      lines: [{ productId: x.p, quantity: 20000, price: 2500 }],
      paid: false,
      note: 'Giriş',
      occurredOn: '2026-08-01',
    });
    const sale = x.run({
      type: 'sale',
      customerId: x.c,
      lines: [{ productId: x.p, quantity: 10000, price: 3500 }],
      note: 'Özgün',
      occurredOn: '2026-08-02',
    });
    const cmd = correct(
      x,
      { entity: 'sale', id: sale },
      { lines: [{ productId: x.p, quantity: 8000, price: 3500 }] },
    );
    x.run(cmd);
    const snap = x.s.snapshot();
    assert.equal(snap.products[0].stock, 12000);
    assert.equal(x.s.balance(x.c), 28000);
    assert.equal(snap.summary.cogs, 20000);
    assert.equal(snap.summary.profit, 8000);
    const active = snap.sales.find((s) => s.status === 'active')!;
    const before = x.s.snapshot();
    assert.throws(
      () =>
        x.run(
          correct(
            x,
            { entity: 'sale', id: active.id },
            { lines: [{ productId: x.p, quantity: 30000, price: 3500 }] },
          ),
        ),
      /stok/i,
    );
    assert.deepEqual(x.s.snapshot(), before);
    const invalid = correct(
      x,
      { entity: 'sale', id: active.id },
      { occurredOn: '2026-07-31', occurredAt: undefined },
    );
    assert.throws(() => x.run(invalid), /stok/i);
    assert.deepEqual(x.s.snapshot(), before);
    const backup = path.join(x.root, 'backup.db');
    await x.s.backup(backup);
    Store.validateBackup(backup);
    const month = report(x.s.db, { start: '2026-08-01', end: '2026-08-31' });
    assert.equal(month.revenue, 28000);
    assert.equal(statement(x.s.db, x.c, { start: '2026-08-01', end: '2026-08-31' }).closing, 28000);
  } finally {
    x.close();
  }
});
test('düzeltme güncel kayıt kontrolü ve son adım hatasında özgün mali etkilerin korunması', () => {
  const x = fixture();
  try {
    const id = x.run({
      type: 'collection',
      customerId: x.c,
      amount: 10000,
      method: 'Nakit',
      note: '',
    });
    const cmd = correct(x, { entity: 'collection', id }, { amount: 15000 });
    x.run({ type: 'expense', amount: 100, note: 'Eşzamanlı kayıt' });
    assert.throws(() => x.run(cmd), /değişti/);
    const current = correct(x, { entity: 'collection', id }, { amount: 15000 });
    const before = x.s.snapshot();
    x.s.db.exec(
      "CREATE TRIGGER fail_correction BEFORE INSERT ON corrections BEGIN SELECT RAISE(ABORT,'correction fault'); END;",
    );
    assert.throws(() => x.run(current), /correction fault/);
    assert.deepEqual(x.s.snapshot(), before);
  } finally {
    x.close();
  }
});
test('ödeme bağlı / kısmi teslim sipariş düzeltmesi reddedilir; arşivlenen müşteri/ürün mevcut teslimatı tamamlayabilir', async () => {
  const x = fixture();
  try {
    x.run({
      type: 'purchase',
      supplierId: x.supplier,
      lines: [{ productId: x.p, quantity: 20000, price: 2500 }],
      paid: false,
      note: '',
    });
    const order = x.run({
      type: 'preorder',
      customerId: x.c,
      productId: x.p,
      quantity: 10000,
      price: 3500,
      source: 'prepaid',
      note: 'Sipariş',
    });
    x.run({
      type: 'preorder_allocate',
      orderId: order,
      mode: 'new',
      amount: 35000,
      method: 'Nakit',
      note: 'Ödeme',
    });
    x.run({ type: 'preorder_delivery', orderId: order, quantity: 3000, note: '' });
    const before = x.s.snapshot();
    assert.throws(
      () => x.run(correct(x, { entity: 'preorder', id: order }, { quantity: 8000 })),
      /hareketi var/,
    );
    assert.deepEqual(x.s.snapshot(), before);
    const payment = before.collections[0];
    assert.throws(
      () => x.run(correct(x, { entity: 'collection', id: payment.id }, { amount: 40000 })),
      /ayrılmış/,
    );
    for (const [entity, id] of [
      ['product', x.p],
      ['customer', x.c],
    ] as const)
      x.run({
        type: 'manage',
        entity,
        id,
        action: 'archive',
        expected: recordInfo(x.s.db, { entity, id }).expected,
      });
    x.run({
      type: 'preorder_delivery',
      orderId: order,
      quantity: 7000,
      note: 'Mevcut yükümlülüğü kapama',
    });
    assert.equal(x.s.balance(x.c), 0);
    assert.equal(x.s.snapshot().preorders?.find((o) => o.id === order)?.remaining, 0);
    const backup = path.join(x.root, 'backup.db');
    await x.s.backup(backup);
    Store.validateBackup(backup);
  } finally {
    x.close();
  }
});
test('hareketsiz ön sipariş, gider, cari ekleme, alış ve tedarikçi ödemesi ters kayıtla düzeltilebilir', async () => {
  const x = fixture();
  try {
    const preorder = x.run({
      type: 'preorder',
      customerId: x.c,
      productId: x.p,
      quantity: 1000,
      price: 3500,
      source: 'prepaid',
      note: 'Yanlış sipariş',
    });
    x.run(correct(x, { entity: 'preorder', id: preorder }, { quantity: 2000 }));
    assert.equal(
      x.s.snapshot().preorders?.reduce((n, o) => n + o.remaining, 0),
      2000,
    );
    for (const type of ['customer_debt', 'customer_credit', 'expense'] as const) {
      const id = x.run({
        type,
        amount: 10000,
        note: 'Özgün',
        ...(type === 'expense' ? {} : { customerId: x.c }),
        ...(type === 'customer_debt' ? { category: 'other' } : {}),
      });
      x.run(correct(x, { entity: type, id }, { amount: 15000 }));
    }
    const purchase = x.run({
      type: 'purchase',
      supplierId: x.supplier,
      lines: [{ productId: x.p, quantity: 10000, price: 2500 }],
      paid: false,
      note: '',
    });
    const changed = x.run(
      correct(
        x,
        { entity: 'purchase', id: purchase },
        { lines: [{ productId: x.p, quantity: 8000, price: 2500 }] },
      ),
    );
    assert.equal(x.s.snapshot().products[0].stock, 8000);
    const payment = x.run({
      type: 'supplier_payment',
      supplierId: x.supplier,
      amount: 1000,
      method: 'Nakit',
      note: '',
    });
    x.run(correct(x, { entity: 'supplier_payment', id: payment }, { amount: 1500 }));
    assert.equal(x.s.snapshot().purchases.find((p) => p.id === changed)?.total, 20000);
    const backup = path.join(x.root, 'backup.db');
    await x.s.backup(backup);
    Store.validateBackup(backup);
  } finally {
    x.close();
  }
});
test('son ve ödemesiz teslimat 10→8kg: stok ve açık teslim miktarı net 2kg döner, yedek tutarlı kalır', async () => {
  const x = fixture();
  try {
    x.run({
      type: 'purchase',
      supplierId: x.supplier,
      lines: [{ productId: x.p, quantity: 20000, price: 2500 }],
      paid: false,
      note: '',
    });
    const order = x.run({
      type: 'preorder',
      customerId: x.c,
      productId: x.p,
      quantity: 15000,
      price: 3500,
      source: 'prepaid',
      note: 'Sipariş',
    });
    const delivery = x.run({
      type: 'preorder_delivery',
      orderId: order,
      quantity: 10000,
      note: '',
    });
    x.run(correct(x, { entity: 'preorder_delivery', id: delivery }, { quantity: 8000 }));
    assert.equal(x.s.snapshot().products[0].stock, 12000);
    assert.equal(x.s.snapshot().preorders?.find((o) => o.id === order)?.remaining, 7000);
    assert.equal(x.s.balance(x.c), 28000);
    const backup = path.join(x.root, 'backup.db');
    await x.s.backup(backup);
    Store.validateBackup(backup);
  } finally {
    x.close();
  }
});
test('geçmiş satış düzeltmesi sonraki ay maliyetini önizler; onaysız değişmez ve onaylı işlem rapor/yedekte tutarlıdır',async()=>{const x=fixture();try{
 x.run({type:'purchase',supplierId:x.supplier,lines:[{productId:x.p,quantity:10000,price:2500}],paid:false,note:'Ağustos',occurredOn:'2026-08-01'});const sale=x.run({type:'sale',customerId:x.c,lines:[{productId:x.p,quantity:4000,price:5000}],note:'Yanlış miktar',occurredOn:'2026-08-02'});x.run({type:'purchase',supplierId:x.supplier,lines:[{productId:x.p,quantity:10000,price:3500}],paid:false,note:'Eylül',occurredOn:'2026-09-01'});x.run({type:'sale',customerId:x.c,lines:[{productId:x.p,quantity:4000,price:5000}],note:'Sonraki satış',occurredOn:'2026-09-02'});
 const cmd=correct(x,{entity:'sale',id:sale},{lines:[{productId:x.p,quantity:2000,price:5000}]});const before=x.s.snapshot();const impact=x.s.preview(cmd);assert.equal(impact.required,true);assert.ok(impact.changes.some(c=>c.month==='2026-09'));assert.deepEqual(x.s.snapshot(),before);assert.throws(()=>x.run(cmd),/onay/);assert.deepEqual(x.s.snapshot(),before);x.s.execute(cmd,impact.token);assert.equal(x.s.snapshot().summary.cogs,17222);assert.equal(x.s.snapshot().products[0].stock,14000);assert.equal(report(x.s.db,{start:'2026-09-01',end:'2026-09-30'}).cogs,12222);const backup=path.join(x.root,'backup.db');await x.s.backup(backup);Store.validateBackup(backup);
}finally{x.close();}});
