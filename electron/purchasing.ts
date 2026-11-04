import type Database from 'better-sqlite3';
import { MAX, roundedRatio, type Command } from '../shared/contracts';
import { stamp, occurred, cancelDate } from './events';
const limit = (n: number) => {
  if (!Number.isSafeInteger(n) || Math.abs(n) > MAX)
    throw new Error('Tutar / miktar sınırı aşıldı.');
  return n;
};
const insert = (db: Database.Database, sql: string, ...a: any[]) =>
  Number(db.prepare(sql).run(...a).lastInsertRowid);
export const supplierBalance = (db: Database.Database, id: number) =>
  (
    db
      .prepare('SELECT COALESCE(SUM(amount),0) n FROM supplier_ledger WHERE supplier_id=?')
      .get(id) as { n: number }
  ).n;
export function supplierEntry(
  db: Database.Database,
  supplier: number,
  amount: number,
  kind: string,
  id: number,
) {
  limit(supplierBalance(db, supplier) + amount);
  insert(
    db,
    'INSERT INTO supplier_ledger(supplier_id,amount,kind,entity_id) VALUES(?,?,?,?)',
    supplier,
    amount,
    kind,
    id,
  );
}
const activity = (db: Database.Database, entity: string, id: number, message: string) =>
  insert(
    db,
    'INSERT INTO activity(entity,entity_id,description) VALUES(?,?,?)',
    entity,
    id,
    message,
  );
export function supplierPayment(
  db: Database.Database,
  c: {
    type: 'supplier_payment' | 'supplier_refund';
    supplierId: number;
    amount: number;
    method: string;
    note: string;
    occurredAt?: string;
    occurredOn?: string;
  },
  purchaseId: number | null = null,
) {
  const party = db.prepare('SELECT * FROM suppliers WHERE id=?').get(c.supplierId) as any;
  if (!party) throw new Error('Tedarikçi bulunamadı.');
  const refund = c.type === 'supplier_refund';
  if (c.amount > supplierBalance(db, c.supplierId) * (refund ? -1 : 1))
    throw new Error(
      refund
        ? 'Tahsilat tedarikçi alacağından fazla olamaz.'
        : 'Ödeme tedarikçi borcundan fazla olamaz.',
    );
  const id = insert(
    db,
    'INSERT INTO supplier_payments(supplier_id,purchase_id,amount,method,note,kind) VALUES(?,?,?,?,?,?)',
    c.supplierId,
    purchaseId,
    c.amount,
    c.method,
    c.note,
    c.type,
  );
  supplierEntry(db, c.supplierId, c.amount * (refund ? 1 : -1), c.type, id);
  insert(
    db,
    'INSERT INTO cash_transactions(kind,entity_id,amount,note) VALUES(?,?,?,?)',
    c.type,
    id,
    c.amount * (refund ? 1 : -1),
    `${party.name} • ${c.note}`,
  );
  stamp(db, c.type, id, c);
  activity(
    db,
    c.type,
    id,
    `${party.name}: ${refund ? 'tedarikçiden para iadesi alındı' : 'tedarikçiye ödeme yapıldı'} (${c.amount / 100} TL).`,
  );
  return id;
}
export function registerPurchase(
  db: Database.Database,
  id: number,
  c: Extract<Command, { type: 'purchase' }>,
  total: number,
) {
  supplierEntry(db, c.supplierId, total, 'purchase', id);
  if (c.paid && total > 0)
    supplierPayment(
      db,
      {
        type: 'supplier_payment',
        supplierId: c.supplierId,
        amount: total,
        method: c.method || 'Nakit',
        note: `#G-${id} peşin alış ödemesi`,
        occurredAt: c.occurredAt,
        occurredOn: c.occurredOn,
      },
      id,
    );
}
export function purchasing(db: Database.Database, c: Command): number | undefined {
  if (c.type === 'supplier_payment' || c.type === 'supplier_refund') return supplierPayment(db, c);
  if (c.type === 'supplier_return') {
    const purchase = db.prepare('SELECT * FROM purchases WHERE id=?').get(c.purchaseId) as any;
    if (!purchase || purchase.status !== 'active') throw new Error('Etkin alış belgesi seçin.');
    cancelDate(db, 'purchase', purchase.id, occurred(c));
    const id = insert(
      db,
      'INSERT INTO supplier_returns(purchase_id,supplier_id,total,cost,note) VALUES(?,?,0,0,?)',
      purchase.id,
      purchase.party_id,
      c.note,
    );
    let total = 0;
    let cost = 0;
    for (const line of c.lines) {
      const original = db
        .prepare('SELECT * FROM purchase_items WHERE id=? AND document_id=?')
        .get(line.itemId, purchase.id) as any;
      if (!original) throw new Error('İade kalemi alış belgesine ait değil.');
      const used = db
        .prepare(
          `SELECT COALESCE(SUM(i.quantity),0) quantity,COALESCE(SUM(i.total),0) total FROM supplier_return_items i JOIN supplier_returns r ON r.id=i.document_id WHERE i.original_item_id=? AND r.status='active'`,
        )
        .get(original.id) as any;
      if (line.quantity + used.quantity > original.quantity)
        throw new Error('İade miktarı alışın kalan miktarını aşıyor.');
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(original.product_id) as any;
      if (p.stock < line.quantity)
        throw new Error(
          `${p.name}: ${occurred(c).slice(0, 10)} tarihinde yetersiz stok; eksik ${(line.quantity - p.stock) / 1000} ${p.unit}. Önce geçmiş stok girişini düzeltin.`,
        );
      if (p.unit === 'Adet' && line.quantity % 1000)
        throw new Error('Adet miktarı tam sayı olmalı.');
      const credit =
        line.quantity + used.quantity === original.quantity
          ? original.total - used.total
          : Math.min(
              roundedRatio(line.quantity, original.price, 1000),
              original.total - used.total,
            );
      const value = roundedRatio(p.cost, line.quantity, p.stock);
      total = limit(total + credit);
      cost = limit(cost + value);
      insert(
        db,
        'INSERT INTO supplier_return_items(document_id,original_item_id,product_id,quantity,price,total,cost) VALUES(?,?,?,?,?,?,?)',
        id,
        original.id,
        p.id,
        line.quantity,
        original.price,
        credit,
        value,
      );
      db.prepare('UPDATE products SET stock=stock-?,cost=cost-? WHERE id=?').run(
        line.quantity,
        value,
        p.id,
      );
      insert(
        db,
        "INSERT INTO stock_movements(product_id,quantity,cost,kind,entity_id,note) VALUES(?,?,?,'supplier_return',?,?)",
        p.id,
        -line.quantity,
        -value,
        id,
        c.note,
      );
    }
    db.prepare('UPDATE supplier_returns SET total=?,cost=? WHERE id=?').run(total, cost, id);
    supplierEntry(db, purchase.party_id, -total, 'supplier_return', id);
    activity(
      db,
      'supplier_return',
      id,
      `#G-${purchase.id} için tedarikçiye iade: ${total / 100} TL cari azaltım; güncel stok maliyeti ${cost / 100} TL. Fark ayrı raporlanır. ${c.note}`,
    );
    return id;
  }
  if (
    c.type !== 'reverse' ||
    !['purchase', 'supplier_payment', 'supplier_refund', 'supplier_return'].includes(c.entity)
  )
    return undefined;
  cancelDate(db, c.entity, c.id, occurred(c));
  if (c.entity === 'purchase') {
    const d = db.prepare('SELECT * FROM purchases WHERE id=?').get(c.id) as any;
    if (!d || d.status !== 'active') throw new Error('Alış zaten iptal veya bulunamadı.');
    if (
      db.prepare("SELECT 1 FROM supplier_returns WHERE purchase_id=? AND status='active'").get(d.id)
    )
      throw new Error(
        'Bu alışın iade belgesi var. Alış iptal edilemez; cari hesap ve iade belgelerini inceleyin.',
      );
    const lines = db
      .prepare(
        'SELECT product_id,SUM(quantity) quantity,SUM(cost) cost FROM purchase_items WHERE document_id=? GROUP BY product_id',
      )
      .all(d.id) as any[];
    for (const l of lines) {
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(l.product_id) as any;
      if (p.stock < l.quantity)
        throw new Error('Alış güvenle ters çevrilemiyor. Tedarikçiye iade akışını kullanın.');
      const exitCost = roundedRatio(p.cost, l.quantity, p.stock);
      db.prepare('UPDATE products SET stock=stock-?,cost=cost-? WHERE id=?').run(
        l.quantity,
        exitCost,
        p.id,
      );
      insert(
        db,
        "INSERT INTO stock_movements(product_id,quantity,cost,kind,entity_id,note) VALUES(?,?,?,'purchase_cancel',?,?)",
        p.id,
        -l.quantity,
        -exitCost,
        d.id,
        c.reason,
      );
    }
    db.prepare("UPDATE purchases SET status='cancelled' WHERE id=?").run(d.id);
    supplierEntry(db, d.party_id, -d.total, 'purchase_cancel', d.id);
  } else if (c.entity === 'supplier_return') {
    const d = db.prepare('SELECT * FROM supplier_returns WHERE id=?').get(c.id) as any;
    if (!d || d.status !== 'active') throw new Error('İade zaten iptal veya bulunamadı.');
    for (const l of db
      .prepare('SELECT * FROM supplier_return_items WHERE document_id=?')
      .all(d.id) as any[]) {
      db.prepare('UPDATE products SET stock=stock+?,cost=cost+? WHERE id=?').run(
        l.quantity,
        l.cost,
        l.product_id,
      );
      insert(
        db,
        "INSERT INTO stock_movements(product_id,quantity,cost,kind,entity_id,note) VALUES(?,?,?,'supplier_return_cancel',?,?)",
        l.product_id,
        l.quantity,
        l.cost,
        d.id,
        c.reason,
      );
    }
    db.prepare("UPDATE supplier_returns SET status='cancelled' WHERE id=?").run(d.id);
    supplierEntry(db, d.supplier_id, d.total, 'supplier_return_cancel', d.id);
  } else {
    const p = db
      .prepare('SELECT * FROM supplier_payments WHERE id=? AND kind=?')
      .get(c.id, c.entity) as any;
    if (!p || p.status !== 'active')
      throw new Error('Tedarikçi ödemesi/iadesi zaten iptal veya bulunamadı.');
    const original = db
      .prepare(
        'SELECT * FROM cash_transactions WHERE id=? OR (kind=? AND entity_id=? AND reverses_id IS NULL)',
      )
      .get(p.legacy_cash_id || -1, c.entity, p.id) as any;
    db.prepare("UPDATE supplier_payments SET status='cancelled' WHERE id=?").run(p.id);
    supplierEntry(
      db,
      p.supplier_id,
      p.amount * (c.entity === 'supplier_payment' ? 1 : -1),
      `${c.entity}_cancel`,
      p.id,
    );
    insert(
      db,
      'INSERT INTO cash_transactions(kind,entity_id,amount,note,reverses_id) VALUES(?,?,?,?,?)',
      `${original.kind}_cancel`,
      original.kind === 'purchase' ? original.entity_id : p.id,
      -original.amount,
      c.reason,
      original.id,
    );
  }
  activity(
    db,
    c.entity,
    c.id,
    `#${c.id} tedarikçi işlemi gerekçeli ters kayıtla iptal edildi: ${c.reason}`,
  );
  return c.id;
}
