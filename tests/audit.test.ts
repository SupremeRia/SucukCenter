import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { Store } from '../electron/store';
import { DatabaseService } from '../electron/database-service';
import { view } from '../electron/view';
import { viewSchema } from '../shared/contracts';
function temp() {
  return mkdtempSync(path.join(tmpdir(), 'sucukcenter-audit-data-'));
}
test('veritabanı işçisi eşzamanlı komutları sıraya alır; mükerrer satış, hata rollback, kapatma ve tekrar açılış', async () => {
  const root = temp();
  const file = path.join(root, 'data.db');
  let service = new DatabaseService(file);
  try {
    await service.ready;
    const run = (c: any) =>
      service.call<number>(
        'execute',
        ['product', 'customer', 'supplier'].includes(c.type)
          ? c
          : { operationId: randomUUID(), ...c },
      );
    const p = await run({
      type: 'product',
      name: 'Test',
      unit: 'Kg',
      price: 3500,
      critical: 0,
      active: true,
    });
    const c = await run({
      type: 'customer',
      name: 'Test Müşteri',
      address: '',
      contact: '',
      phone: '',
    });
    const supplier = await run({
      type: 'supplier',
      name: 'Test Tedarikçi',
      address: '',
      contact: '',
      phone: '',
    });
    await run({
      type: 'purchase',
      supplierId: supplier,
      lines: [{ productId: p, quantity: 10000, price: 2500 }],
      paid: false,
      note: '',
    });
    const sale = {
      type: 'sale',
      operationId: randomUUID(),
      customerId: c,
      lines: [{ productId: p, quantity: 3000, price: 3500 }],
      note: '',
    };
    const ids = await Promise.all([
      service.call<number>('execute', sale),
      service.call<number>('execute', sale),
    ]);
    assert.equal(ids[0], ids[1]);
    let snapshot = await service.call('snapshot', {});
    assert.equal(snapshot.products[0].stock, 7000);
    assert.equal(snapshot.summary.debt, 10500);
    await assert.rejects(
      run({
        ...sale,
        operationId: randomUUID(),
        lines: [{ productId: p, quantity: 8000, price: 3500 }],
      }),
      /stok/,
    );
    snapshot = await service.call('snapshot', {});
    assert.equal(snapshot.products[0].stock, 7000);
    const payments = Array.from({ length: 5 }, () =>
      run({ type: 'collection', customerId: c, amount: 100, method: 'Nakit', note: '' }),
    );
    const closing = service.close();
    await Promise.all(payments);
    await closing;
    await assert.rejects(service.call('snapshot', {}), /kapat/);
    service = new DatabaseService(file);
    await service.ready;
    snapshot = await service.call('snapshot', {});
    assert.equal(snapshot.summary.cash, 500);
    assert.equal(snapshot.summary.debt, 10000);
    const backup = path.join(root, 'backup.db');
    await service.call('backup', backup);
    await service.call('restore', backup);
    snapshot = await service.call('snapshot', {});
    assert.equal(snapshot.summary.debt, 10000);
  } finally {
    await service.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test('özet önbelleği işlem/düzeltme/iptal ve dış bağlantı yazısında yenilenir; rollback içi görüntü dışarı sızmaz', async () => {
  const root = temp();
  const file = path.join(root, 'data.db');
  const s = new Store(file);
  const v = () => view(s.db, file, viewSchema.parse({}));
  try {
    const c = s.execute({ type: 'customer', name: 'Test', address: '', contact: '', phone: '' });
    assert.equal(v().summary.cash, 0);
    const collection = s.execute({
      type: 'collection',
      operationId: randomUUID(),
      customerId: c,
      amount: 10000,
      method: 'Nakit',
      note: '',
    });
    assert.equal(v().summary.cash, 10000);
    const { recordInfo } = await import('../electron/records');
    const info = recordInfo(s.db, { entity: 'collection', id: collection });
    const corrected = s.execute({
      type: 'correct',
      operationId: randomUUID(),
      entity: 'collection',
      id: collection,
      expected: info.expected,
      reason: 'Test düzeltme',
      replacement: { type: 'collection', customerId: c, amount: 15000, method: 'Nakit', note: '' },
    });
    assert.equal(v().summary.cash, 15000);
    s.execute({
      type: 'reverse',
      operationId: randomUUID(),
      entity: 'collection',
      id: corrected,
      reason: 'Test iptal',
    });
    assert.equal(v().summary.cash, 0);
    const marker = {};
    try {
      s.db.transaction(() => {
        s.execute({ type: 'expense', operationId: randomUUID(), amount: 100, note: 'Geçici' });
        assert.equal(v().summary.cash, -100);
        throw marker;
      })();
    } catch (e) {
      assert.equal(e, marker);
    }
    assert.equal(v().summary.cash, 0);
    const other = new Database(file);
    try {
      other
        .prepare("INSERT INTO customers(name,address,contact,phone) VALUES('Dış Test','','','')")
        .run();
    } finally {
      other.close();
    }
    assert.equal(v().counts?.customers, 2);
    const backup = path.join(root, 'backup.db');
    await s.backup(backup);
    s.execute({ type: 'expense', operationId: randomUUID(), amount: 100, note: 'Sonra' });
    assert.equal(v().summary.cash, -100);
    await s.restore(backup);
    assert.equal(v().summary.cash, 0);
  } finally {
    s.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test('ilk sayfa dışındaki ön sipariş ve çok kalemli alışın ürünleri düzenleme bağlamında eksiksiz yüklenir', () => {
  const root = temp(),
    file = path.join(root, 'data.db'),
    s = new Store(file);
  try {
    const customer = s.execute({
        type: 'customer',
        name: 'Test',
        address: '',
        contact: '',
        phone: '',
      }),
      supplier = s.execute({
        type: 'supplier',
        name: 'Tedarikçi',
        address: '',
        contact: '',
        phone: '',
      });
    const ids: number[] = [];
    for (let i = 0; i < 65; i++)
      ids.push(
        s.execute({
          type: 'product',
          name: 'Ürün ' + String(i).padStart(3, '0'),
          unit: 'Kg',
          price: 100,
          critical: 0,
          active: true,
        }),
      );
    const order = s.execute({
      type: 'preorder',
      operationId: randomUUID(),
      customerId: customer,
      productId: ids[64],
      quantity: 1000,
      price: 100,
      source: 'prepaid',
      note: 'Uzak ürün',
    });
    const context = view(s.db, file, viewSchema.parse({ focusEntity: 'preorder', focusId: order }));
    assert.ok(context.products.some((p) => p.id === ids[64]));
    const purchase = s.execute({
      type: 'purchase',
      operationId: randomUUID(),
      supplierId: supplier,
      lines: ids.map((productId) => ({ productId, quantity: 1000, price: 100 })),
      paid: false,
      note: '65 kalem',
    });
    const doc = view(s.db, file, viewSchema.parse({ focusEntity: 'purchase', focusId: purchase }));
    assert.equal(doc.purchaseItems.filter((i) => i.document_id === purchase).length, 65);
    for (const id of ids) assert.ok(doc.products.some((p) => p.id === id));
  } finally {
    s.close();
    rmSync(root, { recursive: true, force: true });
  }
});
