import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Store } from '../electron/store';
import { preorder } from '../electron/preorders';
import { statement, report } from '../electron/reports';
test('teslim edilmiş borcu kapatan mevcut tahsilat bağlanabilir; kasaya ve cariye tekrar yazılmaz', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sucukcenter-preorder-edge-'));
  const s = new Store(path.join(root, 'test.db'));
  try {
    const run = (c: any) =>
      s.execute(
        ['product', 'customer', 'supplier'].includes(c.type)
          ? c
          : { operationId: randomUUID(), ...c },
      );
    const p = run({
      type: 'product',
      name: 'Test',
      unit: 'Litre',
      price: 500,
      critical: 0,
      active: true,
    });
    const customer = run({
      type: 'customer',
      name: 'Test Müşteri',
      address: '',
      phone: '',
      contact: '',
    });
    const supplier = run({
      type: 'supplier',
      name: 'Test Tedarikçi',
      address: '',
      phone: '',
      contact: '',
    });
    const order = run({
      type: 'preorder',
      customerId: customer,
      productId: p,
      quantity: 2000,
      price: 500,
      source: 'prepaid',
      note: 'Teslim önce',
    });
    run({
      type: 'purchase',
      supplierId: supplier,
      lines: [{ productId: p, quantity: 2000, price: 200 }],
      paid: false,
      note: '',
    });
    const delivery = run({
      type: 'preorder_delivery',
      orderId: order,
      quantity: 2000,
      note: 'Teslim',
    });
    assert.equal(s.balance(customer), 1000);
    const collection = run({
      type: 'collection',
      customerId: customer,
      amount: 1000,
      method: 'Nakit',
      note: 'Borcu kapatan ödeme',
    });
    assert.equal(s.balance(customer), 0);
    const cash = s.snapshot().summary.cash;
    const allocation = run({
      type: 'preorder_allocate',
      orderId: order,
      amount: 1000,
      mode: 'collection',
      collectionId: collection,
      note: 'Teslime bağla',
    });
    assert.equal(s.balance(customer), 0);
    assert.equal(s.snapshot().summary.cash, cash);
    assert.equal(preorder(s.db, order).paid, 1000);
    assert.equal(preorder(s.db, order).reserved, 0);
    run({
      type: 'preorder_unallocate',
      allocationId: allocation,
      note: 'Yanlış ödeme bağını düzelt',
    });
    assert.equal(s.balance(customer), 0);
    assert.equal(s.snapshot().products[0].stock, 0);
    run({
      type: 'reverse',
      entity: 'collection',
      id: collection,
      reason: 'Tahsilat gerçekte yapılmamış',
    });
    assert.equal(s.balance(customer), 1000);
    assert.equal(s.snapshot().summary.cash, 0);
    run({
      type: 'preorder_return',
      deliveryId: delivery,
      physicalReturn: true,
      note: 'Ürün gerçekten geri döndü',
    });
    assert.equal(preorder(s.db, order).reserved, 0);
    assert.equal(s.balance(customer), 0);
    const later = run({
      type: 'preorder',
      customerId: customer,
      productId: p,
      quantity: 2000,
      price: 500,
      source: 'prepaid',
      note: 'Sonradan ödeme',
    });
    const delivered = run({
      type: 'preorder_delivery',
      orderId: later,
      quantity: 2000,
      note: 'Önce teslim',
    });
    run({
      type: 'preorder_allocate',
      orderId: later,
      amount: 1000,
      mode: 'new',
      method: 'Nakit',
      note: 'Teslim sonrası ödeme',
    });
    assert.equal(preorder(s.db, later).reserved, 0);
    run({
      type: 'preorder_return',
      deliveryId: delivered,
      physicalReturn: true,
      note: 'Ödemeden sonra ürün iadesi',
    });
    assert.equal(preorder(s.db, later).reserved, 1000);
    assert.equal(s.balance(customer), 0);
    run({
      type: 'preorder_cancel',
      orderId: later,
      quantity: 2000,
      note: 'İade sonrası sipariş iptali',
    });
    assert.equal(s.balance(customer), -1000);
    await s.backup(path.join(root, 'verified.db'));
    Store.validateBackup(path.join(root, 'verified.db'));
  } finally {
    s.close();
    assert.ok(path.basename(root).startsWith('sucukcenter-preorder-edge-'));
    rmSync(root, { recursive: true, force: true });
  }
});
test('birden fazla fiziksel iadeden sonra küçük kısmi teslim negatif kuruş üretmez', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sucukcenter-preorder-edge-'));
  const s = new Store(path.join(root, 'test.db'));
  try {
    const run = (c: any) =>
      s.execute(
        ['product', 'customer', 'supplier'].includes(c.type)
          ? c
          : { operationId: randomUUID(), ...c },
      );
    const p = run({
      type: 'product',
      name: 'Test',
      unit: 'Kg',
      price: 1,
      critical: 0,
      active: true,
    });
    const customer = run({ type: 'customer', name: 'Test', address: '', phone: '', contact: '' });
    const supplier = run({
      type: 'supplier',
      name: 'Tedarik',
      address: '',
      phone: '',
      contact: '',
    });
    const o = run({
      type: 'preorder',
      customerId: customer,
      productId: p,
      quantity: 1000,
      price: 1,
      source: 'prepaid',
      note: 'Yuvarlama',
    });
    run({
      type: 'purchase',
      supplierId: supplier,
      lines: [{ productId: p, quantity: 1000, price: 100 }],
      paid: false,
      note: '',
    });
    const a = run({ type: 'preorder_delivery', orderId: o, quantity: 333, note: 'a' });
    run({ type: 'preorder_delivery', orderId: o, quantity: 333, note: 'b' });
    const c = run({ type: 'preorder_delivery', orderId: o, quantity: 334, note: 'c' });
    run({ type: 'preorder_return', deliveryId: a, physicalReturn: true, note: 'a geri' });
    run({ type: 'preorder_return', deliveryId: c, physicalReturn: true, note: 'c geri' });
    run({ type: 'preorder_delivery', orderId: o, quantity: 1, note: 'Bir gram' });
    run({ type: 'preorder_delivery', orderId: o, quantity: 666, note: 'Kalan' });
    assert.equal(preorder(s.db, o).recognized, 1);
    assert.equal(s.snapshot().summary.revenue, 1);
    await s.backup(path.join(root, 'round.db'));
    Store.validateBackup(path.join(root, 'round.db'));
  } finally {
    s.close();
    assert.ok(path.basename(root).startsWith('sucukcenter-preorder-edge-'));
    rmSync(root, { recursive: true, force: true });
  }
});
test('geçmiş teslim, sonraki alıştan önceki maliyeti kullanır; onaylı revizyon ve aylık ürün devri', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sucukcenter-preorder-edge-'));
  const s = new Store(path.join(root, 'test.db'));
  try {
    const run = (c: any) =>
      s.execute(
        ['product', 'customer', 'supplier'].includes(c.type)
          ? c
          : { operationId: randomUUID(), ...c },
      );
    const p = run({
      type: 'product',
      name: 'Tarihsel Ürün',
      unit: 'Kg',
      price: 30000,
      critical: 0,
      active: true,
    });
    const customer = run({
      type: 'customer',
      name: 'Tarihsel Müşteri',
      address: '',
      phone: '',
      contact: '',
    });
    const supplier = run({
      type: 'supplier',
      name: 'Tarihsel Tedarikçi',
      address: '',
      phone: '',
      contact: '',
    });
    const o = run({
      type: 'preorder',
      customerId: customer,
      productId: p,
      quantity: 100000,
      price: 25000,
      source: 'prepaid',
      note: 'Ocak',
      occurredOn: '2026-01-01',
    });
    run({
      type: 'purchase',
      supplierId: supplier,
      lines: [{ productId: p, quantity: 100000, price: 10000 }],
      paid: false,
      note: 'Ocak stok',
      occurredOn: '2026-01-01',
    });
    run({
      type: 'purchase',
      supplierId: supplier,
      lines: [{ productId: p, quantity: 100000, price: 20000 }],
      paid: false,
      note: 'Şubat stok',
      occurredOn: '2026-02-01',
    });
    const delivery = {
      type: 'preorder_delivery',
      orderId: o,
      quantity: 40000,
      note: 'Ocak teslim',
      occurredOn: '2026-01-15',
      operationId: randomUUID(),
    };
    const preview = s.preview(delivery);
    s.execute(delivery, preview.token);
    assert.equal(report(s.db, { start: '2026-01-01', end: '2026-01-31' }).cogs, 400000);
    assert.equal(s.snapshot().products[0].stock, 160000);
    assert.equal(
      statement(s.db, customer, { start: '2026-01-01', end: '2026-01-31' }).closingProducts?.[0]
        .quantity,
      60000,
    );
    assert.equal(
      statement(s.db, customer, { start: '2026-02-01', end: '2026-02-28' }).openingProducts?.[0]
        .quantity,
      60000,
    );
    await s.backup(path.join(root, 'valid.db'));
    Store.validateBackup(path.join(root, 'valid.db'));
  } finally {
    s.close();
    assert.ok(path.basename(root).startsWith('sucukcenter-preorder-edge-'));
    rmSync(root, { recursive: true, force: true });
  }
});
