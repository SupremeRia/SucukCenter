import type Database from 'better-sqlite3';
import { basicCommandSchema, type RecordRef, type RecordInfo } from '../shared/contracts';
import { canonical, contentHash } from './reconcile';
const tables: Record<string, string> = {
  product: 'products',
  customer: 'customers',
  supplier: 'suppliers',
  sale: 'sales',
  purchase: 'purchases',
  collection: 'collections',
  refund: 'collections',
  expense: 'cash_transactions',
  customer_debt: 'customer_adjustments',
  customer_credit: 'customer_adjustments',
  supplier_payment: 'supplier_payments',
  supplier_refund: 'supplier_payments',
  preorder: 'preorders',
  preorder_delivery: 'preorder_events',
};
export const master = (entity: string) => ['product', 'customer', 'supplier'].includes(entity);
export function recordInfo(db: Database.Database, ref: RecordRef): RecordInfo {
  const table = tables[ref.entity];
  const row = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(ref.id) as any;
  if (
    !row ||
    ('kind' in row &&
      !['product', 'customer', 'supplier'].includes(ref.entity) &&
      row.kind !== ref.entity)
  )
    throw new Error('Kayıt bulunamadı. Listeyi yenileyin.');
  const dependencies: string[] = [],
    obligations: string[] = [];
  if (master(ref.entity)) {
    for (const t of db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]) {
      if (!/^[a-z_]+$/.test(t.name)) continue;
      for (const fk of db.prepare(`PRAGMA foreign_key_list(${t.name})`).all() as any[])
        if (
          fk.table === table &&
          db.prepare(`SELECT 1 FROM ${t.name} WHERE ${fk.from}=? LIMIT 1`).get(ref.id)
        )
          dependencies.push(t.name);
    }
    if (ref.entity === 'product')
      obligations.push(`Fiziksel stok: ${row.stock / 1000} ${row.unit}`);
    if (ref.entity === 'customer' || ref.entity === 'supplier') {
      const col = ref.entity + '_id';
      const balance = (
        db
          .prepare(`SELECT COALESCE(SUM(amount),0) n FROM ${ref.entity}_ledger WHERE ${col}=?`)
          .get(ref.id) as any
      ).n;
      obligations.push(
        `Para bakiyesi: ${(balance / 100).toLocaleString('tr-TR')} TL (${balance > 0 ? 'borç' : balance < 0 ? 'alacak' : 'kapalı'})`,
      );
    }
    if (ref.entity !== 'supplier') {
      const pending = db
        .prepare(
          `SELECT product,unit,SUM(remaining) n FROM preorder_summary WHERE ${ref.entity === 'customer' ? 'customer_id' : 'product_id'}=? AND remaining>0 GROUP BY product_id,product,unit`,
        )
        .all(ref.id) as any[];
      obligations.push(
        ...pending.map((p) => `Bekleyen teslimat: ${p.product} · ${p.n / 1000} ${p.unit}`),
      );
    }
  }
  let original: RecordInfo['original'] = null;
  for (const op of db
    .prepare('SELECT request_json FROM operations WHERE result=? ORDER BY recorded_at DESC')
    .all(ref.id) as any[]) {
    const parsed = basicCommandSchema.safeParse(JSON.parse(op.request_json));
    if (parsed.success && parsed.data.type === ref.entity) {
      original = parsed.data;
      break;
    }
  }
  if (!original) {
    const correction = db
      .prepare('SELECT new_json FROM corrections WHERE replacement_entity=? AND replacement_id=?')
      .get(ref.entity, ref.id) as any;
    if (correction) original = basicCommandSchema.parse(JSON.parse(correction.new_json));
  }
  // Reconstruct older cards/documents that predate operation journaling.
  if (!original && master(ref.entity))
    original = basicCommandSchema.parse({
      type: ref.entity,
      ...(ref.entity === 'product'
        ? {
            id: row.id,
            name: row.name,
            unit: row.unit,
            price: row.price,
            critical: row.critical,
            active: !!row.active,
            defaultSupplierId: row.default_supplier_id,
          }
        : {
            id: row.id,
            name: row.name,
            address: row.address,
            contact: row.contact,
            phone: row.phone,
          }),
    });
  if (!original && !master(ref.entity)) {
    const meta = db
      .prepare('SELECT * FROM event_meta WHERE entity=? AND entity_id=?')
      .get(ref.entity, ref.id) as any;
    const base = { type: ref.entity, occurredAt: meta?.occurred_at, note: row.note };
    let reconstructed: any;
    if (['collection', 'refund'].includes(ref.entity))
      reconstructed = {
        ...base,
        customerId: row.customer_id,
        amount: row.amount,
        method: row.method,
      };
    if (['customer_debt', 'customer_credit'].includes(ref.entity))
      reconstructed = {
        ...base,
        customerId: row.customer_id,
        amount: row.amount,
        reference: row.reference,
        ...(ref.entity === 'customer_debt' ? { category: row.category } : {}),
      };
    if (ref.entity === 'expense') reconstructed = { ...base, amount: -row.amount };
    if (['supplier_payment', 'supplier_refund'].includes(ref.entity))
      reconstructed = {
        ...base,
        supplierId: row.supplier_id,
        amount: row.amount,
        method: row.method,
      };
    if (['sale', 'purchase'].includes(ref.entity))
      reconstructed = {
        ...base,
        [ref.entity === 'sale' ? 'customerId' : 'supplierId']: row.party_id,
        lines: (
          db
            .prepare(
              'SELECT * FROM ' +
                (ref.entity === 'sale' ? 'sale_items' : 'purchase_items') +
                ' WHERE document_id=?',
            )
            .all(ref.id) as any[]
        ).map((l) => ({ productId: l.product_id, quantity: l.quantity, price: l.price })),
        free: !!meta?.free_reason,
        freeReason: meta?.free_reason,
        ...(ref.entity === 'purchase' ? { paid: false, reference: meta?.reference } : {}),
      };
    if (ref.entity === 'preorder_delivery')
      reconstructed = { ...base, orderId: row.order_id, quantity: row.quantity };
    if (reconstructed) {
      const parsed = basicCommandSchema.safeParse(reconstructed);
      if (parsed.success) original = parsed.data;
    }
  }
  if (
    original &&
    !master(ref.entity) &&
    !('occurredOn' in original && original.occurredOn) &&
    !('occurredAt' in original && original.occurredAt)
  ) {
    const meta = db
      .prepare('SELECT occurred_at FROM event_meta WHERE entity=? AND entity_id=?')
      .get(ref.entity, ref.id) as any;
    if (meta) original = { ...original, occurredAt: meta.occurred_at } as RecordInfo['original'];
  }
  if (ref.entity === 'expense' && original?.type === 'expense') {
    const details = db.prepare('SELECT * FROM expense_details WHERE cash_id=?').get(ref.id) as any;
    original = {
      ...original,
      name: details.name,
      note: details.description,
      ...(details.method ? { method: details.method } : {}),
    };
  }
  let blocked = '';
  const corrections = db
    .prepare(
      'SELECT * FROM corrections WHERE (entity=? AND original_id=?) OR (replacement_entity=? AND replacement_id=?) ORDER BY id',
    )
    .all(ref.entity, ref.id, ref.entity, ref.id) as any[];
  let active = master(ref.entity) ? !!row.active : row.status ? row.status === 'active' : true;
  if (
    ref.entity === 'expense' &&
    db.prepare('SELECT 1 FROM cash_transactions WHERE reverses_id=?').get(ref.id)
  )
    active = false;
  if (corrections.some((c) => c.entity === ref.entity && c.original_id === ref.id)) active = false;
  if (!master(ref.entity) && !active)
    blocked = 'Kayıt iptal edilmiş veya düzeltilmiş. Düzeltme zincirindeki güncel kaydı açın.';
  if (!original)
    blocked =
      'Eski kaydın düzenlenebilir işlem bilgileri bulunamadı. Detaydan gerekçeli iade/iptal akışını kullanın.';
  if (
    ref.entity === 'sale' &&
    db.prepare('SELECT 1 FROM preorder_events WHERE sale_id=?').get(ref.id)
  )
    blocked =
      'Satış ön sipariş teslimatına bağlı. Bekleyen Teslimatlar ekranından fiziksel iade ve yeni teslimat adımlarını kullanın.';
  if (
    ref.entity === 'collection' &&
    (
      db
        .prepare(
          'SELECT COALESCE(SUM(f.paid_delta),0) n FROM preorder_funding f JOIN preorder_events a ON a.id=f.allocation_id WHERE a.collection_id=?',
        )
        .get(ref.id) as any
    ).n > 0
  )
    blocked =
      'Tahsilat sipariş ödemesine ayrılmış. Önce Bekleyen Teslimatlar ekranında ödeme bağlantısını kaldırın; sonra tahsilatı düzeltin.';
  if (
    ref.entity === 'purchase' &&
    (db
      .prepare("SELECT 1 FROM supplier_returns WHERE purchase_id=? AND status='active'")
      .get(ref.id) ||
      db
        .prepare("SELECT 1 FROM supplier_payments WHERE purchase_id=? AND status='active'")
        .get(ref.id))
  )
    blocked =
      'Alışın bağlı ödeme veya iade belgesi var. Önce ilgili ödeme/iade bağlantılarını gerekçeli iptal edin.';
  if (['supplier_payment', 'supplier_refund'].includes(ref.entity) && row.purchase_id)
    blocked = 'Ödeme alış belgesine bağlı. Alış detayında bağlı ödeme/iade akışını kullanın.';
  if (
    ref.entity === 'preorder' &&
    db.prepare('SELECT 1 FROM preorder_events WHERE order_id=?').get(ref.id)
  )
    blocked =
      'Siparişte ödeme, teslimat veya iptal hareketi var. Önce ilgili ödeme bağlantısını kaldırın ve gerekiyorsa fiziksel iadeyi kaydedin; kalan sipariş için iptal/yeni sipariş akışını kullanın.';
  if (ref.entity === 'preorder_delivery') {
    const o = db.prepare('SELECT * FROM preorder_summary WHERE id=?').get(row.order_id) as any;
    const later = db
      .prepare('SELECT 1 FROM preorder_events WHERE order_id=? AND id>? LIMIT 1')
      .get(row.order_id, row.id);
    if (
      later ||
      o.paid > 0 ||
      db.prepare('SELECT 1 FROM preorder_events WHERE reverses_id=?').get(row.id)
    )
      blocked =
        'Teslimatın sonrasında sipariş hareketi veya bağlı ödeme var. Bekleyen Teslimatlar ekranında ödeme bağlantısını kaldırın; fiziksel iade ve yeni teslimat adımlarını kullanın.';
  }

  const state = db
    .prepare('SELECT (SELECT MAX(id) FROM activity) a,(SELECT COUNT(*) FROM operations) o')
    .get();
  return {
    ref,
    name:
      (ref.entity === 'expense' ? (original as any)?.name : row.name) || `${ref.entity} #${ref.id}`,
    expected: contentHash(canonical({ row, state, corrections })),
    active,
    dependencies: [...new Set(dependencies)],
    obligations,
    original,
    blocked,
    corrections,
  };
}
export function manageRecord(
  db: Database.Database,
  c: {
    entity: 'product' | 'customer' | 'supplier';
    id: number;
    action: 'delete' | 'archive' | 'restore';
    expected: string;
  },
) {
  const info = recordInfo(db, c);
  if (info.expected !== c.expected)
    throw new Error('Kayıt veya bağlı işlemler değişti. Güncel veriyi yeniden yükleyin.');
  const table = tables[c.entity];
  if (c.action === 'delete') {
    if (info.dependencies.length)
      throw new Error(
        'İlişkili geçmiş kayıtları var; kalıcı silinemez. Geçmiş kayıtları koruyarak arşivleyin.',
      );
    db.prepare('INSERT INTO deleted_records VALUES(?,?,?)').run(c.entity, c.id, info.name);
    db.prepare(`DELETE FROM ${table} WHERE id=?`).run(c.id);
  } else
    db.prepare(`UPDATE ${table} SET active=? WHERE id=?`).run(c.action === 'restore' ? 1 : 0, c.id);
  db.prepare('INSERT INTO activity(entity,entity_id,description) VALUES(?,?,?)').run(
    c.entity,
    c.id,
    `${info.name}: ${c.action === 'delete' ? 'hareketsiz kart kalıcı silindi' : c.action === 'restore' ? 'yeniden etkinleştirildi' : 'geçmiş kayıtları ve yükümlülükleri korunarak arşivlendi'}.`,
  );
  return c.id;
}
