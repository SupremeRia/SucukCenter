import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../electron/store';
import { preorder, productBalances } from '../electron/preorders';
import { report, statement, customerCSV } from '../electron/reports';
import { view } from '../electron/view';
import { viewSchema } from '../shared/contracts';
function setup(unit = 'Kg') {
  const root = mkdtempSync(path.join(tmpdir(), 'sucukcenter-preorders-'));
  let s = new Store(path.join(root, 'sucukcenter.db'));
  const run = (c: any) => {
    const cmd = ['product', 'customer', 'supplier'].includes(c.type)
      ? c
      : { operationId: randomUUID(), occurredOn: '2026-01-01', ...c };
    return s.execute(cmd);
  };
  const p = run({
    type: 'product',
    name: 'Ön Sipariş Sucuk',
    unit,
    price: 25000,
    critical: 0,
    active: true,
  });
  const c = run({ type: 'customer', name: 'Ön Sipariş Büfe', address: '', contact: '', phone: '' });
  const supplier = run({
    type: 'supplier',
    name: 'Ön Sipariş Tedarikçi',
    address: '',
    contact: '',
    phone: '',
  });
  const order = (quantity = 100000, price = 25000, source = 'prepaid') =>
    run({
      type: 'preorder',
      customerId: c,
      productId: p,
      quantity,
      price,
      source,
      note: 'Anlaşma',
      reference: 'REF-1',
    });
  const purchase = (q = 100000) =>
    run({
      type: 'purchase',
      supplierId: supplier,
      lines: [{ productId: p, quantity: q, price: 10000 }],
      paid: false,
      note: 'Stok girişi',
    });
  const cleanup = () => {
    s.close();
    assert.ok(path.basename(root).startsWith('sucukcenter-preorders-'));
    rmSync(root, { recursive: true, force: true });
  };
  return {
    root,
    run,
    p,
    c,
    supplier,
    order,
    purchase,
    get s() {
      return s;
    },
    reopen() {
      s.close();
      s = new Store(s.file);
    },
    cleanup,
  };
}
test('stoksuz 100kg/250TL ön ödeme, fiyat sabitliği, 40+60 teslim, tek kasa, tam satış ve kalıcılık', async () => {
  const x = setup();
  try {
    const id = x.order();
    x.run({
      type: 'preorder_allocate',
      orderId: id,
      amount: 2500000,
      mode: 'new',
      method: 'Nakit',
      note: 'Ön ödeme',
    });
    assert.equal(x.s.snapshot().products[0].stock, 0);
    assert.equal(x.s.balance(x.c), 0);
    assert.equal(preorder(x.s.db, id).reserved, 2500000);
    assert.equal(x.s.snapshot().summary.revenue, 0);
    assert.equal(x.s.snapshot().summary.cash, 2500000);
    x.run({
      type: 'product',
      id: x.p,
      name: 'Ön Sipariş Sucuk',
      unit: 'Kg',
      price: 30000,
      critical: 0,
      active: true,
    });
    assert.equal(preorder(x.s.db, id).price, 25000);
    x.purchase();
    const delivery = {
      type: 'preorder_delivery',
      orderId: id,
      quantity: 40000,
      note: 'İlk teslim',
      operationId: randomUUID(),
    };
    const d = x.run(delivery);
    assert.equal(x.run(delivery), d);
    assert.equal(x.s.snapshot().products[0].stock, 60000);
    assert.equal(preorder(x.s.db, id).remaining, 60000);
    assert.equal(x.s.balance(x.c), 0);
    assert.equal(x.s.snapshot().summary.cash, 2500000);
    assert.equal(x.s.snapshot().summary.revenue, 1000000);
    x.run({ type: 'preorder_delivery', orderId: id, quantity: 60000, note: 'Son teslim' });
    assert.equal(preorder(x.s.db, id).remaining, 0);
    assert.equal(x.s.snapshot().summary.revenue, 2500000);
    assert.equal(x.s.snapshot().summary.cogs, 1000000);
    assert.equal(preorder(x.s.db, id).reserved, 0);
    const file = path.join(x.root, 'backup.db');
    await x.s.backup(file);
    Store.validateBackup(file);
    x.reopen();
    assert.equal(preorder(x.s.db, id).recognized, 2500000);
    assert.equal(x.s.balance(x.c), 0);
    const st = statement(x.s.db, x.c, { start: '2026-01-01', end: '2026-01-31' });
    assert.equal(st.closingProducts?.length, 0);
    assert.equal(st.sales, 2500000);
    assert.equal(st.productRows?.length, 4);
    assert.ok(customerCSV(x.s.db, x.c, {}).includes('ÜRÜN TESLİM'));
  } finally {
    x.cleanup();
  }
});
test('mevcut tahsilat/avans iki kez kullanılmaz; fazla yeni ödeme serbest; iptal tahsisi serbest bırakır', async () => {
  const x = setup();
  try {
    const collection = x.run({
      type: 'collection',
      customerId: x.c,
      amount: 2500000,
      method: 'Banka',
      note: 'Önceden ödeme',
    });
    const id = x.order();
    const a = x.run({
      type: 'preorder_allocate',
      orderId: id,
      amount: 2500000,
      mode: 'collection',
      collectionId: collection,
      note: 'Bağlantı',
    });
    assert.equal(x.s.balance(x.c), 0);
    assert.equal(x.s.snapshot().summary.cash, 2500000);
    const other = x.order();
    assert.throws(
      () =>
        x.run({
          type: 'preorder_allocate',
          orderId: other,
          amount: 1,
          mode: 'advance',
          note: 'İkinci kullanım',
        }),
      /yetersiz/,
    );
    assert.throws(
      () => x.run({ type: 'reverse', entity: 'collection', id: collection, reason: 'Bağlı' }),
      /siparişe bağlı/,
    );
    x.run({ type: 'preorder_unallocate', allocationId: a, note: 'Yanlış bağlama' });
    assert.equal(x.s.balance(x.c), -2500000);
    x.run({
      type: 'preorder_allocate',
      orderId: other,
      amount: 2500000,
      mode: 'collection',
      collectionId: collection,
      note: 'Doğru sipariş',
    });
    x.run({ type: 'preorder_cancel', orderId: other, quantity: 100000, note: 'Sipariş iptal' });
    assert.equal(x.s.balance(x.c), -2500000);
    assert.equal(x.s.snapshot().summary.cash, 2500000);
    x.run({
      type: 'preorder_allocate',
      orderId: id,
      amount: 2600000,
      mode: 'new',
      method: 'Nakit',
      note: 'Fazla ödeme',
    });
    assert.equal(x.s.balance(x.c), -2600000);
    assert.equal(preorder(x.s.db, id).paid, 2500000);
    await x.s.backup(path.join(x.root, 'valid.db'));
    Store.validateBackup(path.join(x.root, 'valid.db'));
  } finally {
    x.cleanup();
  }
});
test('kısmi teslim, kalan iptali, fiziksel iade, para iadesi ve farklı fiyatlı siparişler', async () => {
  const x = setup();
  try {
    const id = x.order();
    const second = x.order(10000, 30000);
    x.purchase();
    x.run({
      type: 'preorder_allocate',
      orderId: id,
      amount: 2500000,
      mode: 'new',
      method: 'Nakit',
      note: 'Ödeme',
    });
    const d = x.run({ type: 'preorder_delivery', orderId: id, quantity: 40000, note: '40kg' });
    assert.equal(preorder(x.s.db, second).remaining, 10000);
    x.run({ type: 'preorder_cancel', orderId: id, quantity: 60000, note: 'Kalanı iptal' });
    assert.equal(x.s.balance(x.c), -1500000);
    assert.equal(preorder(x.s.db, id).reserved, 0);
    x.run({
      type: 'refund',
      customerId: x.c,
      amount: 1500000,
      method: 'Nakit',
      note: 'Açık para iadesi',
    });
    assert.equal(x.s.snapshot().summary.cash, 1000000);
    const sale = (x.s.db.prepare('SELECT sale_id FROM preorder_events WHERE id=?').get(d) as any)
      .sale_id;
    assert.throws(
      () => x.run({ type: 'reverse', entity: 'sale', id: sale, reason: 'Yanlış yol' }),
      /fiziksel iade/,
    );
    x.run({
      type: 'preorder_return',
      deliveryId: d,
      physicalReturn: true,
      note: 'Ürün fiziksel olarak döndü',
    });
    assert.equal(x.s.snapshot().products[0].stock, 100000);
    assert.equal(preorder(x.s.db, id).remaining, 40000);
    assert.equal(x.s.snapshot().summary.revenue, 0);
    assert.throws(
      () => x.run({ type: 'preorder_return', deliveryId: d, physicalReturn: true, note: 'Tekrar' }),
      /zaten/,
    );
    x.run({ type: 'preorder_delivery', orderId: second, quantity: 10000, note: 'Farklı fiyat' });
    assert.equal(preorder(x.s.db, second).recognized, 300000);
    assert.equal(x.s.balance(x.c), 300000);
    await x.s.backup(path.join(x.root, 'valid.db'));
    Store.validateBackup(path.join(x.root, 'valid.db'));
  } finally {
    x.cleanup();
  }
});
test('diğer ürün borcu para oluşturmaz; ayrı maliyet ve fiziksel iade; birim kısıtları', async () => {
  const x = setup();
  try {
    const id = x.order(5000, 0, 'other');
    assert.equal(x.s.balance(x.c), 0);
    assert.equal(x.s.snapshot().summary.cash, 0);
    x.purchase(10000);
    const d = x.run({
      type: 'preorder_delivery',
      orderId: id,
      quantity: 5000,
      note: 'Diğer borç teslimi',
    });
    assert.equal(x.s.snapshot().summary.revenue, 0);
    assert.equal(x.s.snapshot().summary.cogs, 0);
    assert.equal(report(x.s.db, {}).productDebtCost, 50000);
    assert.equal(x.s.snapshot().sales.length, 0);
    x.run({ type: 'preorder_return', deliveryId: d, physicalReturn: true, note: 'Fiziksel iade' });
    assert.equal(report(x.s.db, {}).productDebtCost, 0);
    assert.equal(x.s.snapshot().products[0].stock, 10000);
    await x.s.backup(path.join(x.root, 'valid.db'));
    Store.validateBackup(path.join(x.root, 'valid.db'));
  } finally {
    x.cleanup();
  }
  const y = setup('Adet');
  try {
    assert.throws(() => y.order(1500));
    const id = y.order(2000);
    assert.throws(() =>
      y.run({ type: 'preorder_cancel', orderId: id, quantity: 500, note: 'Kesir' }),
    );
  } finally {
    y.cleanup();
  }
});
test('kuruş yuvarlama son teslimde kapanır; tarihsel stok ve borç/ay devri; atomiklik', async () => {
  const x = setup();
  try {
    const id = x.order(1000, 1);
    x.purchase(1000);
    for (const q of [333, 333, 334])
      x.run({ type: 'preorder_delivery', orderId: id, quantity: q, note: 'Kesirli teslim' });
    assert.equal(x.s.snapshot().summary.revenue, 1);
    assert.equal(preorder(x.s.db, id).recognized, 1);
    await x.s.backup(path.join(x.root, 'round.db'));
    const next = x.run({
      type: 'preorder',
      customerId: x.c,
      productId: x.p,
      quantity: 5000,
      price: 25000,
      source: 'prepaid',
      note: 'Şubat',
      occurredOn: '2026-02-01',
    });
    assert.equal(productBalances(x.s.db, x.c, '2026-02-01T00:00:00Z').length, 0);
    assert.equal(productBalances(x.s.db, x.c, '2026-03-01T00:00:00Z')[0].quantity, 5000);
    const before = x.s.snapshot();
    assert.throws(
      () =>
        x.run({
          type: 'preorder_delivery',
          orderId: next,
          quantity: 5000,
          note: 'Stoksuz',
          occurredOn: '2026-02-02',
        }),
      /stok/,
    );
    assert.deepEqual(x.s.snapshot(), before);
    assert.throws(
      () =>
        x.run({
          type: 'preorder_allocate',
          orderId: next,
          amount: 1,
          mode: 'new',
          method: 'Nakit',
          note: 'Önceki tarih',
          occurredOn: '2026-01-31',
        }),
      /önce/,
    );
    x.s.db.exec(
      "CREATE TRIGGER fail_preorder BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT,'fault injection'); END",
    );
    assert.throws(
      () =>
        x.run({
          type: 'preorder_allocate',
          orderId: next,
          amount: 100,
          mode: 'new',
          method: 'Nakit',
          note: 'Atomik',
          occurredOn: '2026-02-02',
        }),
      /fault injection/,
    );
    x.s.db.exec('DROP TRIGGER fail_preorder');
    assert.deepEqual(x.s.snapshot(), before);
  } finally {
    x.cleanup();
  }
});
test('bekleyen teslim toplamları tüm kayıtlardan, ayrı ürün/birim ve planlanan tarih filtresiyle hesaplanır', () => {
  const x = setup();
  try {
    const a = x.order(100000),
      b = x.order(50000, 30000);
    x.purchase(100000);
    x.run({ type: 'preorder_delivery', orderId: a, quantity: 40000, note: '40kg' });
    const litre = x.run({
      type: 'product',
      name: 'Litre Ürünü',
      unit: 'Litre',
      price: 100,
      critical: 0,
      active: true,
    });
    x.run({
      type: 'preorder',
      customerId: x.c,
      productId: litre,
      quantity: 5000,
      price: 0,
      source: 'other',
      note: '5 litre borç',
      plannedOn: '2026-01-30',
    });
    const v = view(x.s.db, x.s.file, viewSchema.parse({ page: 'preorders', pendingOnly: true }));
    assert.equal(v.pagination?.total, 3);
    assert.equal(v.fulfillmentProducts?.find((p) => p.unit === 'Kg')?.quantity, 110000);
    assert.equal(v.fulfillmentProducts?.find((p) => p.unit === 'Litre')?.quantity, 5000);
    const filtered = view(
      x.s.db,
      x.s.file,
      viewSchema.parse({
        page: 'preorders',
        pendingOnly: true,
        plannedFrom: '2026-01-25',
        plannedTo: '2026-01-31',
      }),
    );
    assert.equal(filtered.preorders?.length, 1);
    assert.equal(filtered.preorders?.[0].product_id, litre);
    assert.equal(preorder(x.s.db, b).price, 30000);
  } finally {
    x.cleanup();
  }
});
test('müşteri sıralama tüm sayfalarda ve Türkçe alanlarda çalışır', () => {
  const x = setup();
  try {
    for (let i = 0; i < 55; i++) {
      const c = x.run({
        type: 'customer',
        name: `Firma ${String(i).padStart(3, '0')}`,
        contact: `Yetkili ${i}`,
        phone: String(i),
        address: '',
      });
      x.run({
        type: 'customer_debt',
        customerId: c,
        amount: i + 1,
        category: 'other',
        note: 'Sıralama',
      });
    }
    const q = (customerSort: string, sortDirection: string, offset = 0) =>
      view(
        x.s.db,
        x.s.file,
        viewSchema.parse({ page: 'customers', customerSort, sortDirection, offset }),
      );
    assert.equal(q('balance', 'desc').customers[0].balance, 55);
    assert.equal(q('balance', 'asc').customers[0].balance, 0);
    assert.equal(q('balance', 'desc', 50).customers[0].balance, 5);
    assert.equal(q('name', 'asc').customers[0].name, 'Firma 000');
    assert.equal(q('name', 'desc').customers[0].name, 'Ön Sipariş Büfe');
    assert.notEqual(q('contact', 'asc').customers[0].name, q('contact', 'desc').customers[0].name);
  } finally {
    x.cleanup();
  }
});
