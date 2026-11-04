import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, renameSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Store } from '../electron/store';
import { APPLICATION_ID, schema1, SCHEMA_VERSION } from '../electron/migrations';
import { decimal, roundedRatio } from '../shared/contracts';
import { randomUUID, createHash } from 'node:crypto';
import { documentMatches } from '../shared/search';
import { report, statement, customerCSV } from '../electron/reports';
import { turkeyDay, dayBounds } from '../shared/dates';
const root = mkdtempSync(path.join(tmpdir(), 'sucukcenter-test-'));
const stores: Store[] = [];
function setup(name: string) {
  const store = new Store(path.join(root, name, 'sucukcenter.db'));
  const execute = store.execute.bind(store);
  store.execute = (input: unknown) => {
    const c = input as any;
    return execute(
      ['product', 'customer', 'supplier', 'settings'].includes(c.type)
        ? c
        : { ...c, operationId: c.operationId || randomUUID() },
    );
  };
  stores.push(store);
  const product = store.execute({
    type: 'product',
    name: 'Sucuk',
    unit: 'Kg',
    price: 3500,
    critical: 10000,
    active: true,
  });
  const supplier = store.execute({
    type: 'supplier',
    name: 'ABC Gıda',
    address: 'Sahte adres',
    contact: 'Test',
    phone: '000',
  });
  const customer = store.execute({
    type: 'customer',
    name: 'Ahmet Büfe',
    address: 'Sahte adres',
    contact: 'Test',
    phone: '000',
  });
  function purchase(quantity = 5_000_000, price = 2500) {
    return store.execute({
      type: 'purchase',
      supplierId: supplier,
      lines: [{ productId: product, quantity, price }],
      paid: false,
      note: '',
    });
  }
  function sale(quantity = 3000, price = 3500) {
    return store.execute({
      type: 'sale',
      customerId: customer,
      lines: [{ productId: product, quantity, price }],
      note: '',
    });
  }
  return { store, product, supplier, customer, purchase, sale };
}
after(() => {
  for (const s of stores) s.close();
  const resolved = path.resolve(root);
  assert.ok(
    resolved.startsWith(path.resolve(tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith('sucukcenter-test-'),
  );
  rmSync(resolved, { recursive: true, force: true });
});
test('kalıcı işlem anahtarı: aynı içerik aynı sonuç, farklı içerik hata; yeni anahtar meşru yeni satış', () => {
  const x = setup('idempotency');
  x.purchase();
  const c = {
    type: 'sale',
    operationId: randomUUID(),
    customerId: x.customer,
    lines: [{ productId: x.product, quantity: 1000, price: 500 }],
    note: '',
  };
  const first = x.store.execute(c);
  assert.equal(
    x.store.execute({ ...c, lines: [{ price: 500, quantity: 1000, productId: x.product }] }),
    first,
  );
  assert.throws(() => x.store.execute({ ...c, note: 'başka' }), /farklı içerik/);
  const second = x.store.execute({ ...c, operationId: randomUUID() });
  assert.notEqual(first, second);
  assert.equal(x.store.snapshot().sales.length, 2);
  x.store.close();
  const again = new Store(x.store.file);
  stores.push(again);
  assert.equal(again.execute(c), first);
  assert.equal(again.snapshot().sales.length, 2);
});
test('sıfır dolgulu satış/alış belge aramaları ve Türkçe firma adı', () => {
  for (const query of ['1', 'S-1', 'S-0001', '#S-0001'])
    assert.ok(documentMatches('Işık Gıda', 1, 'S', query));
  for (const query of ['1', 'G-1', 'G-0001', '#G-0001'])
    assert.ok(documentMatches('Işık Gıda', 1, 'G', query));
  assert.ok(documentMatches('Işık Gıda', 1, 'G', 'ışık'));
  assert.equal(documentMatches('X', 1, 'G', 'S-0001'), false);
});
test('pozitif fakat hareketle uyuşmayan yedek salt okunur mutabakatta reddedilir', async () => {
  const x = setup('reconcile');
  x.purchase();
  x.sale();
  const backup = path.join(root, 'inconsistent.db');
  await x.store.backup(backup);
  const bad = new Database(backup);
  bad.prepare('UPDATE products SET stock=stock+1').run();
  bad.close();
  const hash = () => createHash('sha256').update(readFileSync(backup)).digest('hex');
  const before = hash();
  assert.throws(() => Store.validateBackup(backup), /stok/);
  assert.equal(hash(), before);
  const live = x.store.snapshot();
  await assert.rejects(() => x.store.restore(backup));
  assert.deepEqual(x.store.snapshot(), live);
});
test('v1 geçişinden önce doğrulanmış yedek, ödeme uzlaştırması ve eski kaydı koruma', async () => {
  const file = path.join(root, 'legacy.db');
  const legacy = new Database(file);
  legacy.exec(schema1);
  legacy.pragma('application_id=' + APPLICATION_ID);
  legacy.pragma('user_version=1');
  legacy.exec(
    "INSERT INTO suppliers VALUES(1,'Eski Tedarikçi','','',''); INSERT INTO products(id,name,unit,price,critical,stock,cost) VALUES(1,'Sucuk','Kg',12000,0,2000,20000); INSERT INTO purchases(id,party_id,total,cost,note) VALUES(1,1,10000,10000,''),(2,1,10000,10000,''); INSERT INTO purchase_items(document_id,product_id,product,unit,quantity,price,total,cost) VALUES(1,1,'Sucuk','Kg',1000,10000,10000,10000),(2,1,'Sucuk','Kg',1000,10000,10000,10000); INSERT INTO stock_movements(product_id,quantity,cost,kind,entity_id,note) VALUES(1,1000,10000,'purchase',1,''),(1,1000,10000,'purchase',2,''); INSERT INTO cash_transactions(kind,entity_id,amount,note) VALUES('purchase',1,-10000,'Eski ödeme');",
  );
  legacy.close();
  assert.throws(() => new Store(file), /geçiş yedeği/);
  const migrated = await Store.openMigrating(file);
  stores.push(migrated);
  assert.equal(migrated.db.pragma('user_version', { simple: true }), SCHEMA_VERSION);
  assert.equal(migrated.snapshot().suppliers[0].balance, 10000);
  assert.equal(migrated.snapshot().products[0].stock, 2000);
  assert.equal(migrated.snapshot().supplierPayments.length, 1);
  assert.equal(migrated.snapshot().supplierPayments[0].method, 'Eski kayıt');
  const files = readdirSync(path.join(root, 'yedekler')).filter((f) => f.endsWith('.db'));
  assert.equal(files.length, 1);
  Store.validateBackup(path.join(root, 'yedekler', files[0]));
});

test('5000 Kg → 3 Kg satış → 40 TL tahsilat → yeniden açılış', () => {
  const x = setup('scenario');
  x.purchase();
  assert.equal(x.store.snapshot().products[0].stock, 5_000_000);
  x.sale();
  let s = x.store.snapshot();
  assert.equal(s.products[0].stock, 4_997_000);
  assert.equal(s.summary.revenue, 10500);
  assert.equal(s.summary.profit, 3000);
  assert.equal(s.summary.debt, 10500);
  x.store.execute({
    type: 'collection',
    customerId: x.customer,
    amount: 4000,
    method: 'Nakit',
    note: '',
  });
  s = x.store.snapshot();
  assert.equal(s.summary.debt, 6500);
  assert.equal(s.summary.collected, 4000);
  const before = s;
  x.store.close();
  const reopened = new Store(x.store.file);
  stores.push(reopened);
  assert.deepEqual(reopened.snapshot(), before);
});
test('yetersiz stok: tüm kalemler, borç, stok ve aktivite geri alınır', () => {
  const x = setup('rollback');
  x.purchase(5000);
  const before = x.store.snapshot();
  assert.throws(
    () =>
      x.store.execute({
        type: 'sale',
        customerId: x.customer,
        lines: [
          { productId: x.product, quantity: 3000, price: 3500 },
          { productId: x.product, quantity: 3000, price: 3500 },
        ],
        note: '',
      }),
    /yetersiz/,
  );
  assert.deepEqual(x.store.snapshot(), before);
});
test('aktivite yazma hatası satışın tamamını geri alır', () => {
  const x = setup('failure');
  x.purchase();
  const before = x.store.snapshot();
  x.store.db.exec(
    "CREATE TRIGGER fail_audit BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT,'forced failure'); END",
  );
  assert.throws(() => x.sale(), /forced failure/);
  assert.deepEqual(x.store.snapshot(), before);
});
test('ağırlıklı ortalama, satış anı maliyeti ve küsuratlar', () => {
  const x = setup('cost');
  x.purchase(1000, 1000);
  x.purchase(1000, 3000);
  x.sale(500, 4000);
  let s = x.store.snapshot();
  assert.equal(s.saleItems[0].cost, 1000);
  assert.equal(s.summary.profit, 1000);
  x.purchase(1000, 8000);
  s = x.store.snapshot();
  assert.equal(s.summary.profit, 1000);
  assert.equal(decimal('0,125', 3), 125);
  assert.equal(decimal('25,99', 2), 2599);
  assert.equal(roundedRatio(125, 2599, 1000), 325);
  assert.throws(() => decimal('1,234', 2));
});
test('satış iptali stoğu ve maliyeti iade eder, mükerrer iptal engellenir', () => {
  const x = setup('cancel');
  x.purchase();
  const sale = x.sale();
  x.store.execute({
    type: 'collection',
    customerId: x.customer,
    amount: 4000,
    method: 'Nakit',
    note: '',
  });
  x.store.execute({ type: 'reverse', entity: 'sale', id: sale, reason: 'Ürünler iade alındı' });
  let s = x.store.snapshot();
  assert.equal(s.products[0].stock, 5_000_000);
  assert.equal(s.products[0].cost, 12_500_000);
  assert.equal(s.summary.profit, 0);
  assert.equal(s.customers[0].balance, -4000);
  assert.throws(() =>
    x.store.execute({ type: 'reverse', entity: 'sale', id: sale, reason: 'Tekrar' }),
  );
  x.store.execute({
    type: 'refund',
    customerId: x.customer,
    amount: 4000,
    method: 'Nakit',
    note: 'İade ödemesi',
  });
  s = x.store.snapshot();
  assert.equal(s.customers[0].balance, 0);
  assert.equal(s.summary.cash, 0);
  assert.equal(s.sales.length, 1);
  assert.equal(s.sales[0].status, 'cancelled');
});
test('tahsilat, iade ve gider iptalleri silmeden ters kayıt üretir', () => {
  const x = setup('cash');
  x.purchase();
  x.sale();
  const coll = x.store.execute({
    type: 'collection',
    customerId: x.customer,
    amount: 4000,
    method: 'Banka',
    note: 'Test',
  });
  x.store.execute({ type: 'reverse', entity: 'collection', id: coll, reason: 'Hatalı tahsilat' });
  assert.equal(x.store.balance(x.customer), 10500);
  assert.equal(x.store.snapshot().summary.collected, 0);
  const expense = x.store.execute({ type: 'expense', amount: 1200, note: 'Nakliye' });
  x.store.execute({ type: 'reverse', entity: 'expense', id: expense, reason: 'Hatalı gider' });
  assert.equal(x.store.snapshot().summary.expenses, 0);
  assert.equal(x.store.snapshot().summary.cash, 0);
  assert.throws(() =>
    x.store.execute({ type: 'reverse', entity: 'expense', id: expense, reason: 'Tekrar' }),
  );
});
test('kısıtlar, foreign key ve değiştirilemez geçmiş', () => {
  const x = setup('constraints');
  assert.equal(x.store.db.pragma('foreign_keys', { simple: true }), 1);
  assert.throws(() => x.sale(1));
  x.store.execute({
    type: 'collection',
    customerId: x.customer,
    amount: 1,
    method: 'Nakit',
    note: '',
  });
  assert.equal(x.store.balance(x.customer), -1);
  assert.throws(() =>
    x.store.db.prepare("INSERT INTO sales(party_id,total,cost,note) VALUES(999,0,0,'')").run(),
  );
  x.purchase();
  x.sale();
  assert.throws(() => x.store.db.exec('DELETE FROM sales'));
  assert.throws(() => x.store.db.exec("UPDATE activity SET description='sil'"));
  assert.throws(() =>
    x.store.execute({
      type: 'product',
      id: x.product,
      name: 'Sucuk',
      unit: 'Litre',
      price: 0,
      critical: 0,
      active: true,
    }),
  );
  assert.throws(() =>
    x.store.execute({
      type: 'sale',
      customerId: x.customer,
      lines: [{ productId: x.product, quantity: Infinity, price: 1 }],
      note: '',
    }),
  );
});
test('stok kaybı maliyeti, nakit ve kâr raporları ayrı tutulur', () => {
  const x = setup('report');
  x.store.execute({
    type: 'purchase',
    supplierId: x.supplier,
    lines: [{ productId: x.product, quantity: 10000, price: 2500 }],
    paid: true,
    note: '',
  });
  let s = x.store.snapshot();
  assert.equal(s.summary.profit, 0);
  assert.equal(s.summary.cash, -25000);
  x.store.execute({ type: 'adjust', productId: x.product, quantity: -1000, reason: 'Fire' });
  s = x.store.snapshot();
  assert.equal(s.products[0].stock, 9000);
  assert.equal(s.products[0].cost, 22500);
  assert.equal(s.summary.profit, 0);
  assert.throws(() =>
    x.store.execute({
      type: 'adjust',
      productId: x.product,
      quantity: -10000,
      reason: 'Fazla fire',
    }),
  );
});
test('WAL açıkken güvenli yedek, geri yükleme ve geri dönüş yedeği', async () => {
  const x = setup('backup');
  x.purchase();
  x.sale();
  const file = path.join(root, 'backup.db');
  await x.store.backup(file);
  Store.validateBackup(file);
  x.store.execute({
    type: 'collection',
    customerId: x.customer,
    amount: 4000,
    method: 'Nakit',
    note: '',
  });
  const recovery = await x.store.restore(file);
  assert.equal(x.store.balance(x.customer), 10500);
  Store.validateBackup(recovery);
  await x.store.restore(recovery);
  assert.equal(x.store.balance(x.customer), 6500);
  const invalid = path.join(root, 'invalid.db');
  writeFileSync(invalid, 'invalid');
  const before = x.store.snapshot();
  await assert.rejects(() => x.store.restore(invalid));
  assert.deepEqual(x.store.snapshot(), before);
  await assert.rejects(() => x.store.backup(x.store.file));
});
test('gelecekteki şema reddedilir ve mevcut veri korunur', () => {
  const file = path.join(root, 'future.db');
  const db = new Database(file);
  db.pragma(`application_id = ${APPLICATION_ID}`);
  db.pragma('user_version = 999');
  db.close();
  assert.throws(() => new Store(file), /daha yeni/);
});
test('yarım kalan geri yüklemede kapalı özgün veritabanı kurtarılır', () => {
  const x = setup('interrupted');
  x.purchase();
  x.sale();
  x.store.close();
  renameSync(x.store.file, `${x.store.file}.before-restore`);
  const reopened = new Store(x.store.file);
  stores.push(reopened);
  assert.equal(reopened.snapshot().summary.debt, 10500);
});
test('başka uygulamaya ait SQLite dosyasına migration uygulanmaz', () => {
  const file = path.join(root, 'foreign.db');
  const db = new Database(file);
  db.exec('CREATE TABLE private_data(id INTEGER)');
  db.close();
  assert.throws(() => new Store(file), /SucukCenter veritabanı değil/);
});
test('geri yükleme sonrası aktivite hatasında özgün veritabanı geri alınır', async () => {
  const x = setup('restore-failure');
  x.purchase();
  x.sale();
  const backup = path.join(root, 'fail-audit-backup.db');
  await x.store.backup(backup);
  const bad = new Database(backup);
  bad.exec(
    "CREATE TRIGGER fail_restored_audit BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT,'restore audit failure'); END",
  );
  bad.close();
  x.store.execute({
    type: 'collection',
    customerId: x.customer,
    amount: 4000,
    method: 'Nakit',
    note: '',
  });
  const before = x.store.snapshot();
  await assert.rejects(() => x.store.restore(backup), /restore audit failure/);
  assert.deepEqual(x.store.snapshot(), before);
});
test('miktar hassasiyeti, tam adet ve arşivlenmiş ürün kısıtları', () => {
  const x = setup('precision');
  x.purchase(1000, 2599);
  x.sale(125, 3500);
  let s = x.store.snapshot();
  assert.equal(s.products[0].stock, 875);
  assert.equal(s.saleItems[0].total, 438);
  assert.equal(s.saleItems[0].cost, 325);
  x.store.execute({
    type: 'product',
    id: x.product,
    name: 'Sucuk',
    unit: 'Kg',
    price: 3500,
    critical: 0,
    active: false,
  });
  assert.throws(() => x.sale(1), /arşivlenmiş/);
  const p = x.store.execute({
    type: 'product',
    name: 'Paket',
    unit: 'Adet',
    price: 100,
    critical: 0,
    active: true,
  });
  assert.throws(
    () =>
      x.store.execute({
        type: 'purchase',
        supplierId: x.supplier,
        lines: [{ productId: p, quantity: 500, price: 100 }],
        paid: false,
        note: '',
      }),
    /tam sayı/,
  );
  s = x.store.snapshot();
  assert.equal(s.products.find((p) => p.name === 'Paket')?.stock, 0);
});
test('kabul: 3kg x5, 10TL tahsilat, 5kg x5 = 30TL borç', () => {
  const x = setup('acceptance2');
  x.purchase();
  x.sale(3000, 500);
  x.store.execute({
    type: 'collection',
    customerId: x.customer,
    amount: 1000,
    method: 'Nakit',
    note: '',
  });
  x.sale(5000, 500);
  assert.equal(x.store.balance(x.customer), 3000);
});
test('kabul: hareketli ortalama 10kgx10 +10kgx20; 4kgx25 satış', () => {
  const x = setup('acceptance3');
  x.purchase(10000, 1000);
  x.purchase(10000, 2000);
  x.sale(4000, 2500);
  const s = x.store.snapshot();
  assert.equal(s.products[0].stock, 16000);
  assert.equal(s.products[0].cost, 24000);
  assert.equal(s.sales[0].cost, 6000);
  assert.equal(s.summary.profit, 4000);
});
test('tedarikçi 100TL vadeli alış, 40TL ödeme, ödeme iptali', async () => {
  const x = setup('supplier');
  x.purchase(1000, 10000);
  assert.equal(x.store.snapshot().suppliers[0].balance, 10000);
  const pay = x.store.execute({
    type: 'supplier_payment',
    supplierId: x.supplier,
    amount: 4000,
    method: 'Banka',
    note: 'Kısmi',
  });
  assert.equal(x.store.snapshot().suppliers[0].balance, 6000);
  x.store.execute({ type: 'reverse', entity: 'supplier_payment', id: pay, reason: 'Yanlış ödeme' });
  assert.equal(x.store.snapshot().suppliers[0].balance, 10000);
  assert.equal(x.store.snapshot().summary.cash, 0);
  const backup = path.join(root, 'supplier.db');
  await x.store.backup(backup);
  Store.validateBackup(backup);
});
test('peşin alış, güvenli iptal, tedarikçiden para iadesi', async () => {
  const x = setup('purchase-cancel');
  const id = x.store.execute({
    type: 'purchase',
    supplierId: x.supplier,
    lines: [{ productId: x.product, quantity: 1000, price: 10000 }],
    paid: true,
    note: '',
  });
  assert.equal(x.store.snapshot().suppliers[0].balance, 0);
  x.store.execute({ type: 'reverse', entity: 'purchase', id, reason: 'Yanlış teslimat' });
  assert.equal(x.store.snapshot().products[0].stock, 0);
  assert.equal(x.store.snapshot().suppliers[0].balance, -10000);
  x.store.execute({
    type: 'supplier_refund',
    supplierId: x.supplier,
    amount: 10000,
    method: 'Banka',
    note: 'Tedarikçi iade etti',
  });
  assert.equal(x.store.snapshot().summary.cash, 0);
  const backup = path.join(root, 'purchase-cancel.db');
  await x.store.backup(backup);
  Store.validateBackup(backup);
});
test('sonraki maliyet hareketi olan alışta güncel maliyetle ayrı iade çalışır', async () => {
  const x = setup('supplier-return');
  const first = x.purchase(10000, 1000);
  x.purchase(10000, 2000);
  x.sale(4000, 2500);
  const item = x.store.snapshot().purchaseItems[0];
  const id = x.store.execute({
    type: 'supplier_return',
    purchaseId: first,
    lines: [{ itemId: item.id, quantity: 2000 }],
    note: 'İade teslim edildi',
  });
  let s = x.store.snapshot();
  assert.equal(s.products[0].stock, 14000);
  assert.equal(s.products[0].cost, 21000);
  assert.equal(s.supplierReturns[0].total, 2000);
  assert.equal(s.supplierReturns[0].cost, 3000);
  x.store.execute({ type: 'reverse', entity: 'supplier_return', id, reason: 'İade geri alındı' });
  s = x.store.snapshot();
  assert.equal(s.products[0].stock, 16000);
  assert.equal(s.products[0].cost, 24000);
  const backup = path.join(root, 'supplier-return.db');
  await x.store.backup(backup);
  Store.validateBackup(backup);
});
test('sıfır fiyat açık bedelsiz seçimi ve gerekçe gerektirir; uygun geçmiş alış kabul edilir', () => {
  const x = setup('dates-free');
  assert.throws(() => x.purchase(1000, 0), /Bedelsiz/);
  x.store.execute({
    type: 'purchase',
    supplierId: x.supplier,
    lines: [{ productId: x.product, quantity: 1000, price: 0 }],
    paid: false,
    free: true,
    freeReason: 'Numune',
    note: '',
  });
  assert.doesNotThrow(() =>
    x.store.execute({
      type: 'purchase',
      supplierId: x.supplier,
      lines: [{ productId: x.product, quantity: 1000, price: 100 }],
      paid: false,
      note: '',
      occurredAt: '2020-01-01T12:00:00+03:00',
    }),
  );
});
test('dönem raporu: iptal eski satış dönemini değiştirmez; tahsilat kâr değildir', () => {
  const x = setup('period');
  x.store.execute({
    type: 'purchase',
    supplierId: x.supplier,
    lines: [{ productId: x.product, quantity: 10000, price: 2500 }],
    paid: false,
    note: '',
    occurredAt: '2026-10-01T12:00:00+03:00',
  });
  const sale = x.store.execute({
    type: 'sale',
    customerId: x.customer,
    lines: [{ productId: x.product, quantity: 3000, price: 3500 }],
    note: '',
    occurredAt: '2026-10-02T12:00:00+03:00',
  });
  x.store.execute({
    type: 'collection',
    customerId: x.customer,
    amount: 4000,
    method: 'Nakit',
    note: '',
    occurredAt: '2026-10-03T12:00:00+03:00',
  });
  const before = report(x.store.db, { start: '2026-10-02', end: '2026-10-02' });
  assert.equal(before.profit, 3000);
  x.store.execute({
    type: 'reverse',
    entity: 'sale',
    id: sale,
    reason: 'İade',
    occurredAt: '2026-10-04T12:00:00+03:00',
  });
  assert.deepEqual(
    { ...report(x.store.db, { start: '2026-10-02', end: '2026-10-02' }), generatedAt: '' },
    { ...before, generatedAt: '' },
  );
  const cancel = report(x.store.db, { start: '2026-10-04', end: '2026-10-04' });
  assert.equal(cancel.profit, -3000);
  assert.equal(cancel.endingCredit, 4000);
  assert.equal(cancel.openingCustomerBalance, 6500);
  assert.equal(report(x.store.db, { start: '2026-10-03', end: '2026-10-03' }).profit, 0);
  assert.equal(report(x.store.db, { start: '2026-10-03', end: '2026-10-03' }).collected, 4000);
  assert.throws(() => x.store.db.exec("UPDATE event_meta SET recorded_at='2000-01-01'"));
});
test('Türkiye gün sınırı UTC21, geçersiz aralık ve CSV toplamları', () => {
  const x = setup('csv');
  x.store.execute({
    type: 'purchase',
    supplierId: x.supplier,
    lines: [{ productId: x.product, quantity: 10000, price: 100 }],
    paid: false,
    note: '',
    occurredAt: '2026-10-01T00:00:00+03:00',
  });
  x.store.execute({
    type: 'sale',
    customerId: x.customer,
    lines: [{ productId: x.product, quantity: 1000, price: 10000 }],
    note: '',
    occurredAt: '2026-10-02T20:59:59.999Z',
  });
  x.store.execute({
    type: 'collection',
    customerId: x.customer,
    amount: 4000,
    method: 'Nakit',
    note: '',
    occurredAt: '2026-10-02T21:00:00.000Z',
  });
  assert.equal(turkeyDay('2026-10-02T21:00:00Z'), '2026-10-03');
  assert.equal(dayBounds('2026-10-02', '2026-10-02').from, '2026-10-01T21:00:00.000Z');
  assert.equal(report(x.store.db, { start: '2026-10-02', end: '2026-10-02' }).collected, 0);
  assert.equal(report(x.store.db, { start: '2026-10-03', end: '2026-10-03' }).collected, 4000);
  assert.throws(() => report(x.store.db, { start: '2026-10-04', end: '2026-10-03' }));
  assert.throws(() => dayBounds('2026-02-30', '2026-03-01'));
  const s = statement(x.store.db, x.customer, { start: '2026-10-03', end: '2026-10-03' });
  assert.equal(s.opening, 10000);
  assert.equal(s.closing, 6000);
  assert.equal(s.rows[0].balance, 6000);
  x.store.execute({
    type: 'customer',
    id: x.customer,
    name: '=TEST',
    address: '',
    contact: '',
    phone: '',
  });
  const csv = customerCSV(x.store.db, x.customer, { start: '2026-10-03', end: '2026-10-03' });
  assert.ok(csv.includes("'=TEST"));
  assert.ok(csv.includes('"Kapanış bakiyesi";"60,00"'));
});
test('varsayılan tedarikçi başka gerçek tedarikçiden alışı engellemez', () => {
  const x = setup('default-supplier');
  x.store.execute({
    type: 'product',
    id: x.product,
    name: 'Sucuk',
    unit: 'Kg',
    price: 3500,
    critical: 0,
    active: true,
    defaultSupplierId: x.supplier,
  });
  const other = x.store.execute({
    type: 'supplier',
    name: 'Diğer Tedarikçi',
    address: '',
    contact: '',
    phone: '',
  });
  x.store.execute({
    type: 'purchase',
    supplierId: other,
    lines: [{ productId: x.product, quantity: 1000, price: 2500 }],
    paid: false,
    note: '',
  });
  assert.equal(x.store.snapshot().purchases[0].party_id, other);
});
