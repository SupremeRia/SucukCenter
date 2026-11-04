import type Database from 'better-sqlite3';
import { MAX, roundedRatio, type Command, type Preorder } from '../shared/contracts';
import { stamp, occurred, cancelDate } from './events';
import { dayISO, turkeyDay } from '../shared/dates';
type Dispatch = (c: Command, total?: number, linked?: boolean) => number;
const insert = (db: Database.Database, sql: string, ...args: any[]) =>
  Number(db.prepare(sql).run(...args).lastInsertRowid);
export function preorder(db: Database.Database, id: number): Preorder {
  const o = db.prepare('SELECT * FROM preorder_summary WHERE id=?').get(id) as Preorder | undefined;
  if (!o) throw new Error('Ürün yükümlülüğü bulunamadı.');
  return o;
}
function event(db: Database.Database, id: number, kind: string) {
  const r = db.prepare('SELECT * FROM preorder_events WHERE id=? AND kind=?').get(id, kind) as any;
  if (!r) throw new Error('Sipariş hareketi bulunamadı.');
  return r;
}
function balance(db: Database.Database, customer: number) {
  return (
    db
      .prepare('SELECT COALESCE(SUM(amount),0) n FROM customer_ledger WHERE customer_id=?')
      .get(customer) as any
  ).n as number;
}
function checkDate(db: Database.Database, o: Preorder, c: Command) {
  const latest = db
    .prepare(
      "SELECT MAX(occurred_at) date FROM event_meta WHERE (entity='preorder' AND entity_id=?) OR (entity LIKE 'preorder_%' AND entity_id IN(SELECT id FROM preorder_events WHERE order_id=?))",
    )
    .get(o.id, o.id) as any;
  if (latest.date && turkeyDay(occurred(c)) < turkeyDay(latest.date))
    throw new Error(
      'Sipariş hareketi önceki sipariş/ödeme/teslim gününden önce olamaz. Önce sonraki hareketleri ters işlemle düzeltin.',
    );
}
export function fulfillment(
  db: Database.Database,
  c: Command,
  dispatch: Dispatch,
): number | undefined {
  if (!c.type.startsWith('preorder')) return undefined;
  if (c.type === 'preorder') {
    if (
      !(db.prepare('SELECT active FROM customers WHERE id=?').get(c.customerId) as any)?.active ||
      !(db.prepare('SELECT active FROM products WHERE id=?').get(c.productId) as any)?.active
    )
      throw new Error('Arşivlenen kartla yeni ürün yükümlülüğü oluşturulamaz.');
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(c.productId) as any;
    if (!p) throw new Error('Etkin ürün bulunamadı.');
    if (p.unit === 'Adet' && c.quantity % 1000) throw new Error('Adet miktarı tam sayı olmalı.');
    if (c.source === 'prepaid' && c.price <= 0)
      throw new Error('Ön sipariş için pozitif anlaşma fiyatı gerekli.');
    if (c.plannedOn) dayISO(c.plannedOn);
    const price = c.source === 'other' ? 0 : c.price;
    if (c.source === 'prepaid' && roundedRatio(c.quantity, price, 1000) <= 0)
      throw new Error('Sipariş bedeli en az bir kuruş olmalı.');
    const id = insert(
      db,
      'INSERT INTO preorders(customer_id,product_id,product,unit,quantity,price,total,source,note,reference,planned_on) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      c.customerId,
      p.id,
      p.name,
      p.unit,
      c.quantity,
      price,
      roundedRatio(c.quantity, price, 1000),
      c.source,
      c.note,
      c.reference || '',
      c.plannedOn || '',
    );
    insert(
      db,
      'INSERT INTO activity(entity,entity_id,customer_id,description) VALUES(?,?,?,?)',
      'preorder',
      id,
      c.customerId,
      `${p.name}: ${c.quantity / 1000} ${p.unit} teslim yükümlülüğü #${id} oluşturuldu. ${c.note}`,
    );
    return id;
  }
  let original: any;
  if (c.type === 'preorder_return') original = event(db, c.deliveryId, 'preorder_delivery');
  if (c.type === 'preorder_unallocate') original = event(db, c.allocationId, 'preorder_allocate');
  const orderId = 'orderId' in c ? c.orderId : original?.order_id;
  const o = preorder(db, orderId);
  checkDate(db, o, c);
  let qty = 0,
    amount = 0,
    reserve = 0,
    sale: number | null = null,
    collection: number | null = null,
    reverse: number | null = null;
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(o.product_id) as any;
  if (c.type === 'preorder_allocate') {
    if (o.source !== 'prepaid') throw new Error('Diğer ürün borcuna para tahsis edilemez.');
    const due = o.target - o.paid;
    if (due <= 0) throw new Error('Sipariş bedeli zaten ayrılmış veya sipariş iptal edilmiş.');
    amount = Math.min(c.amount, due);
    if (c.mode === 'new') {
      if (!c.method) throw new Error('Ödeme yöntemi gerekli.');
      collection = dispatch({
        type: 'collection',
        customerId: o.customer_id,
        amount: c.amount,
        method: c.method,
        note: c.note,
        occurredAt: occurred(c),
      });
      stamp(db, 'collection', collection, c);
    } else {
      if (c.amount > due)
        throw new Error('Bağlanacak tutar kalan sipariş bedelinden fazla olamaz.');
      const catchup =
        c.mode === 'collection'
          ? Math.min(amount, Math.max(0, o.recognized - (o.paid - o.reserved)))
          : 0;
      if (c.amount - catchup > Math.max(0, -balance(db, o.customer_id)))
        throw new Error('Kullanılabilir para avansı yetersiz; ayrılmış tutar tekrar kullanılamaz.');
      if (c.mode === 'collection') {
        const p = db
          .prepare(
            "SELECT * FROM collections WHERE id=? AND customer_id=? AND kind='collection' AND status='active'",
          )
          .get(c.collectionId || 0, o.customer_id) as any;
        if (!p) throw new Error('Aktif müşteri tahsilatı seçin.');
        cancelDate(db, 'collection', p.id, occurred(c));
        const used = (
          db
            .prepare(
              'SELECT COALESCE(SUM(f.paid_delta),0) n FROM preorder_funding f JOIN preorder_events a ON a.id=f.allocation_id WHERE a.collection_id=?',
            )
            .get(p.id) as any
        ).n;
        if (c.amount > p.amount - used)
          throw new Error('Bu tahsilatın bağlanabilir kısmı yetersiz.');
        collection = p.id;
      }
    }
    const applied = o.paid - o.reserved;
    reserve = amount - Math.min(amount, Math.max(0, o.recognized - applied));
  } else if (c.type === 'preorder_delivery') {
    qty = c.quantity;
    if (qty > o.remaining) throw new Error('Teslim miktarı kalan ürün borcunu aşıyor.');
    if (product.unit !== o.unit)
      throw new Error('Ürün birimi değişmiş; önce ürün kartını düzeltin.');
    if (o.unit === 'Adet' && qty % 1000) throw new Error('Adet miktarı tam sayı olmalı.');
    if (qty > product.stock) throw new Error('Teslimat için fiziksel/tarihsel stok yetersiz.');
    amount =
      o.source === 'prepaid'
        ? qty === o.remaining
          ? o.target - o.recognized
          : Math.min(
              o.target - o.recognized,
              Math.max(0, roundedRatio(o.delivered + qty, o.price, 1000) - o.recognized),
            )
        : 0;
    if (amount < 0) throw new Error('Sipariş bedeli uzlaştırılamadı.');
    if (o.source === 'prepaid') {
      sale = dispatch(
        {
          type: 'sale',
          customerId: o.customer_id,
          lines: [{ productId: o.product_id, quantity: qty, price: o.price }],
          note: `Ön sipariş #${o.id} teslimi. ${c.note}`,
          occurredAt: occurred(c),
        },
        amount,
        true,
      );
      stamp(db, 'sale', sale, c);
      reserve = -Math.min(o.reserved, amount);
    }
  } else if (c.type === 'preorder_return') {
    if (db.prepare('SELECT 1 FROM preorder_events WHERE reverses_id=?').get(original.id))
      throw new Error('Teslimat zaten iade edilmiş.');
    qty = original.quantity;
    amount = original.amount;
    reserve = Math.max(0, o.paid - o.reserved - (o.recognized - amount));
    reverse = original.id;
    if (original.sale_id) {
      dispatch(
        {
          type: 'reverse',
          entity: 'sale',
          id: original.sale_id,
          reason: c.note,
          occurredAt: occurred(c),
        },
        undefined,
        true,
      );
      stamp(db, 'sale_cancel', original.sale_id, c);
    }
  } else if (c.type === 'preorder_cancel') {
    qty = c.quantity;
    if (qty > o.remaining) throw new Error('Yalnız teslim edilmemiş miktar iptal edilebilir.');
    if (o.unit === 'Adet' && qty % 1000) throw new Error('Adet miktarı tam sayı olmalı.');
    amount =
      o.source === 'prepaid'
        ? o.target -
          Math.max(o.recognized, roundedRatio(o.quantity - o.cancelled - qty, o.price, 1000))
        : 0;
    reserve = -Math.min(o.reserved, Math.max(0, o.paid - (o.target - amount)));
  } else if (c.type === 'preorder_unallocate') {
    if (db.prepare('SELECT 1 FROM preorder_events WHERE reverses_id=?').get(original.id))
      throw new Error('Ödeme bağlantısı zaten iptal edilmiş.');
    const funding = db
      .prepare(
        'SELECT SUM(paid_delta) paid,SUM(reserve_delta) reserved FROM preorder_funding WHERE allocation_id=?',
      )
      .get(original.id) as any;
    if (funding.paid <= 0) throw new Error('Bu tahsis zaten tamamen serbest bırakılmış.');
    amount = funding.paid;
    reserve = -funding.reserved;
    reverse = original.id;
    collection = original.collection_id;
  } else throw new Error('Desteklenmeyen sipariş işlemi.');
  const id = insert(
    db,
    'INSERT INTO preorder_events(order_id,kind,quantity,amount,reserve_delta,sale_id,collection_id,reverses_id,note) VALUES(?,?,?,?,?,?,?,?,?)',
    o.id,
    c.type,
    qty,
    amount,
    reserve,
    sale,
    collection,
    reverse,
    c.note,
  );
  const funding = (allocation: number, paid: number, reserved: number) =>
    db.prepare('INSERT INTO preorder_funding VALUES(?,?,?,?)').run(id, allocation, paid, reserved);
  if (c.type === 'preorder_allocate') funding(id, amount, reserve);
  else if (c.type === 'preorder_return') {
    let left = reserve;
    for (const f of db
      .prepare(
        'SELECT f.allocation_id,SUM(f.paid_delta-f.reserve_delta) available FROM preorder_funding f JOIN preorder_events a ON a.id=f.allocation_id WHERE a.order_id=? GROUP BY f.allocation_id HAVING available>0 ORDER BY f.allocation_id',
      )
      .all(o.id) as any[]) {
      const restore = Math.min(left, f.available);
      if (restore) funding(f.allocation_id, 0, restore);
      left -= restore;
    }
    if (left) throw new Error('İade sonrası ödeme tahsisi uzlaştırılamadı.');
  } else if (c.type === 'preorder_unallocate') funding(original.id, -amount, reserve);
  else if (reserve < 0) {
    let left = -reserve;
    const funds = db
      .prepare(
        'SELECT f.allocation_id,SUM(f.reserve_delta) available FROM preorder_funding f JOIN preorder_events a ON a.id=f.allocation_id WHERE a.order_id=? GROUP BY f.allocation_id HAVING available>0 ORDER BY f.allocation_id',
      )
      .all(o.id) as any[];
    for (const f of funds) {
      const used = Math.min(left, f.available);
      if (used) funding(f.allocation_id, c.type === 'preorder_cancel' ? -used : 0, -used);
      left -= used;
    }
    if (left) throw new Error('Ayrılmış ödeme hareketleri uzlaştırılamadı.');
  }
  if (o.source === 'other' && (c.type === 'preorder_delivery' || c.type === 'preorder_return')) {
    const returning = c.type === 'preorder_return';
    const cost = returning
      ? -(
          db
            .prepare(
              "SELECT cost FROM stock_movements WHERE kind='product_debt_delivery' AND entity_id=?",
            )
            .get(original.id) as any
        ).cost
      : -roundedRatio(product.cost, qty, product.stock);
    const direction = returning ? 1 : -1;
    if (product.stock + direction * qty > MAX) throw new Error('Stok miktarı sınırı aşıldı.');
    db.prepare('UPDATE products SET stock=stock+?,cost=cost+? WHERE id=?').run(
      direction * qty,
      cost,
      o.product_id,
    );
    const kind = returning ? 'product_debt_return' : 'product_debt_delivery';
    insert(
      db,
      'INSERT INTO stock_movements(product_id,quantity,cost,kind,entity_id,note) VALUES(?,?,?,?,?,?)',
      o.product_id,
      direction * qty,
      cost,
      kind,
      id,
      c.note,
    );
    stamp(db, kind, id, c);
  }
  if (
    !Number.isSafeInteger(balance(db, o.customer_id) + reserve) ||
    Math.abs(balance(db, o.customer_id) + reserve) > MAX
  )
    throw new Error('Cari tutar sınırı aşıldı.');
  // A positive delta reserves money; delivery consumes the reserve against the linked sale.
  insert(
    db,
    'INSERT INTO customer_ledger(customer_id,amount,kind,entity_id) VALUES(?,?,?,?)',
    o.customer_id,
    reserve,
    c.type,
    id,
  );
  insert(
    db,
    'INSERT INTO activity(entity,entity_id,customer_id,description) VALUES(?,?,?,?)',
    c.type,
    id,
    o.customer_id,
    `Ürün yükümlülüğü #${o.id} · ${o.product}: ${c.type === 'preorder_delivery' ? 'Teslimat' : c.type === 'preorder_return' ? 'Fiziksel ürün iadesi' : c.type === 'preorder_cancel' ? 'Kalan teslim iptali' : c.type === 'preorder_unallocate' ? 'Ödeme bağlantısı iptali' : 'Sipariş ödemesi'} ${qty / 1000} ${o.unit}. ${c.note}`,
  );
  return id;
}
export function productBalances(db: Database.Database, customer: number, before: string) {
  return db
    .prepare(
      `SELECT product_id,product,unit,SUM(quantity) quantity FROM(
    SELECT o.product_id,o.product,o.unit,o.quantity FROM preorders o JOIN event_meta m ON m.entity='preorder' AND m.entity_id=o.id WHERE o.customer_id=? AND m.occurred_at<?
    UNION ALL SELECT o.product_id,o.product,o.unit,CASE WHEN e.kind='preorder_return' THEN e.quantity ELSE -e.quantity END FROM preorder_events e JOIN preorders o ON o.id=e.order_id JOIN event_meta m ON m.entity=e.kind AND m.entity_id=e.id WHERE o.customer_id=? AND m.occurred_at<? AND e.kind IN('preorder_delivery','preorder_return','preorder_cancel')
  ) GROUP BY product_id,product,unit HAVING SUM(quantity)<>0`,
    )
    .all(customer, before, customer, before) as {
    product_id: number;
    product: string;
    unit: string;
    quantity: number;
  }[];
}
