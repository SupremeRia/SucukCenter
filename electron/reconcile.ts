import { reconcilePreorders } from './reconcile-preorders';
import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { roundedRatio, commandSchema } from '../shared/contracts';
import { reconcile3 } from './reconcile3';
import { reconcileCorrections } from './reconcile8';
import { verifyCosts } from './costing';
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export const contentHash = (json: string) => createHash('sha256').update(json).digest('hex');
// Read-only accounting reconciliation. No repair or inferred values are written here.
export function reconcile(db: Database.Database, version: number) {
  const fail = (detail: string): never => {
    throw new Error(`Yedek hesap mutabakatı başarısız: ${detail}`);
  };
  const bad = (sql: string, message: string) => {
    if (db.prepare(sql).get()) fail(message);
  };
  bad(
    `SELECT p.id FROM products p LEFT JOIN (SELECT product_id,SUM(quantity) q,SUM(${version >= 5 ? 'effective_cost' : 'cost'}) c FROM ${version >= 5 ? 'effective_movements' : 'stock_movements'} GROUP BY product_id) m ON m.product_id=p.id WHERE p.stock<>COALESCE(m.q,0) OR p.cost<>COALESCE(m.c,0) OR p.stock<0 OR p.cost<0 OR (p.stock=0 AND p.cost<>0) LIMIT 1`,
    'stok / maliyet hareket toplamı',
  );
  for (const [docs, items] of [
    ['sales', 'sale_items'],
    ['purchases', 'purchase_items'],
  ]) {
    bad(
      `SELECT d.id FROM ${docs} d LEFT JOIN (SELECT document_id,SUM(total) t,SUM(cost) c,COUNT(*) n FROM ${items} GROUP BY document_id) i ON i.document_id=d.id WHERE COALESCE(i.n,0)=0 OR d.total<>i.t OR d.cost<>i.c LIMIT 1`,
      'belge / kalem toplamı',
    );
    for (const row of db.prepare(`SELECT * FROM ${items}`).iterate() as Iterable<any>) {
      const delivery =
        version >= 7 && docs === 'sales'
          ? (db
              .prepare(
                'SELECT e.*,o.price,o.product_id FROM preorder_events e JOIN preorders o ON o.id=e.order_id WHERE e.sale_id=?',
              )
              .get(row.document_id) as any)
          : undefined;
      if (
        delivery
          ? row.total !== delivery.amount ||
            row.quantity !== delivery.quantity ||
            row.price !== delivery.price ||
            row.product_id !== delivery.product_id
          : row.total !== roundedRatio(row.quantity, row.price, 1000)
      )
        fail('kalem fiyatı / tutarı');
      if (row.unit === 'Adet' && row.quantity % 1000) fail('kesirli Adet');
    }
    const kind = docs === 'sales' ? 'sale' : 'purchase';
    for (const cancellation of [false, true]) {
      if (cancellation && kind === 'purchase' && version < 3) continue;
      const movementKind = cancellation ? kind + '_cancel' : kind;
      const sign = (kind === 'purchase' ? 1 : -1) * (cancellation ? -1 : 1);
      bad(
        `WITH expected AS (SELECT i.document_id,i.product_id,SUM(i.quantity)*${sign} q,SUM(i.cost)*${sign} c FROM ${items} i JOIN ${docs} d ON d.id=i.document_id ${cancellation ? "WHERE d.status='cancelled'" : ''} GROUP BY i.document_id,i.product_id), actual AS (SELECT entity_id,product_id,SUM(quantity) q,SUM(cost) c FROM stock_movements WHERE kind='${movementKind}' GROUP BY entity_id,product_id) SELECT e.document_id FROM expected e LEFT JOIN actual a ON a.entity_id=e.document_id AND a.product_id=e.product_id WHERE a.q IS NULL OR a.q<>e.q ${version >= 5 && movementKind === 'purchase_cancel' ? '' : 'OR a.c<>e.c'} UNION ALL SELECT a.entity_id FROM actual a LEFT JOIN expected e ON e.document_id=a.entity_id AND e.product_id=a.product_id WHERE e.document_id IS NULL LIMIT 1`,
        'belge / stok hareketi bağlantısı',
      );
    }
  }
  bad(
    `SELECT id FROM stock_movements WHERE kind NOT IN ('sale','purchase','sale_cancel','adjust'${version >= 3 ? ",'purchase_cancel','supplier_return','supplier_return_cancel'" : ''}${version >= 7 ? ",'product_debt_delivery','product_debt_return'" : ''}) OR (kind='adjust' AND (quantity>=0 OR cost>0)) LIMIT 1`,
    'bilinmeyen stok hareketi',
  );
  const expected = new Map<string, number>();
  const add = (customer: number, kind: string, id: number, amount: number) =>
    expected.set(`${customer}|${kind}|${id}`, amount);
  for (const d of db.prepare('SELECT * FROM sales').iterate() as Iterable<any>) {
    add(d.party_id, 'sale', d.id, d.total);
    if (d.status === 'cancelled') add(d.party_id, 'sale_cancel', d.id, -d.total);
  }
  for (const c of db.prepare('SELECT * FROM collections').iterate() as Iterable<any>) {
    const amount = c.amount * (c.kind === 'refund' ? 1 : -1);
    add(c.customer_id, c.kind, c.id, amount);
    if (c.status === 'cancelled') add(c.customer_id, `${c.kind}_cancel`, c.id, -amount);
  }
  if (version >= 6)
    for (const a of db.prepare('SELECT * FROM customer_adjustments').iterate() as Iterable<any>) {
      const amount = a.amount * (a.kind === 'customer_debt' ? 1 : -1);
      add(a.customer_id, a.kind, a.id, amount);
      if (a.status === 'cancelled') add(a.customer_id, a.kind + '_cancel', a.id, -amount);
      const cancelled = db
        .prepare('SELECT 1 FROM event_meta WHERE entity=? AND entity_id=?')
        .get(a.kind + '_cancel', a.id);
      if (!!cancelled !== (a.status === 'cancelled')) fail('cari iptal tarihi bağlantısı');
    }
  if (version >= 7) {
    for (const e of db
      .prepare(
        'SELECT e.*,o.customer_id FROM preorder_events e JOIN preorders o ON o.id=e.order_id',
      )
      .iterate() as Iterable<any>)
      add(e.customer_id, e.kind, e.id, e.reserve_delta);
    reconcilePreorders(db, fail);
  }
  for (const l of db.prepare('SELECT * FROM customer_ledger').iterate() as Iterable<any>) {
    const key = `${l.customer_id}|${l.kind}|${l.entity_id}`;
    if (!expected.has(key) || expected.get(key) !== l.amount) fail('müşteri cari kaydı');
    expected.delete(key);
  }
  if (expected.size) fail('eksik müşteri cari kaydı');
  const cash = db.prepare('SELECT * FROM cash_transactions').all() as any[];
  const byId = new Map(cash.map((c) => [c.id, c]));
  if (version >= 10) {
    if (
      db
        .prepare(
          "SELECT c.id FROM cash_transactions c LEFT JOIN expense_details d ON d.cash_id=c.id WHERE c.kind='expense' AND d.cash_id IS NULL LIMIT 1",
        )
        .get() ||
      db
        .prepare(
          "SELECT d.cash_id FROM expense_details d JOIN cash_transactions c ON c.id=d.cash_id WHERE c.kind!='expense' OR length(trim(d.name))=0 OR length(d.name)>200 OR (d.method IS NOT NULL AND d.method NOT IN('Nakit','Banka','Kart')) LIMIT 1",
        )
        .get()
    )
      fail('gider bilgisi bağlantısı');
    for (const c of db
      .prepare("SELECT * FROM cash_transactions WHERE kind='expense_refund'")
      .iterate() as Iterable<any>) {
      const e = db
        .prepare("SELECT occurred_at FROM event_meta WHERE entity='expense_refund' AND entity_id=?")
        .get(c.entity_id) as any;
      const o = db
        .prepare("SELECT occurred_at FROM event_meta WHERE entity='expense' AND entity_id=?")
        .get(c.entity_id) as any;
      if (!e || !o || e.occurred_at < o.occurred_at) fail('gider iadesi tarihi');
    }
  }
  const cashByEvent = new Map(
    cash.filter((c) => c.reverses_id === null).map((c) => [c.kind + '|' + c.entity_id, c]),
  );
  const reversedCash = new Set(
    cash.filter((c) => c.reverses_id !== null).map((c) => c.reverses_id),
  );
  const originals = new Set<string>();
  for (const c of cash) {
    if (c.reverses_id !== null) {
      const original = byId.get(c.reverses_id);
      if (
        !original ||
        original.reverses_id !== null ||
        c.amount !== -original.amount ||
        (c.kind !== `${original.kind}_cancel` &&
          !(version >= 10 && original.kind === 'expense' && c.kind === 'expense_refund')) ||
        c.entity_id !== (original.kind === 'expense' ? original.id : original.entity_id)
      )
        fail('kasa ters kaydı');
      continue;
    }
    if (c.kind === 'expense') {
      if (c.amount >= 0) fail('gider yönü');
      continue;
    }
    if (version >= 3 && ['supplier_payment', 'supplier_refund'].includes(c.kind)) {
      const payment = db
        .prepare('SELECT * FROM supplier_payments WHERE id=? AND kind=? AND legacy_cash_id IS NULL')
        .get(c.entity_id, c.kind) as any;
      if (!payment || c.amount !== payment.amount * (c.kind === 'supplier_payment' ? -1 : 1))
        fail('tedarikçi kasa kaydı bağlantısı');
      continue;
    }
    const key = `${c.kind}|${c.entity_id}`;
    if (originals.has(key)) fail('mükerrer kasa kaydı');
    originals.add(key);
    if (c.kind === 'purchase') {
      const d = db.prepare('SELECT total FROM purchases WHERE id=?').get(c.entity_id) as any;
      if (!d || c.amount !== -d.total) fail('alış kasa bağlantısı');
      if (
        version >= 3 &&
        c.amount !== 0 &&
        !db.prepare('SELECT 1 FROM supplier_payments WHERE legacy_cash_id=?').get(c.id)
      )
        fail('eski alış ödemesi cari bağlantısı');
    } else if (['collection', 'refund'].includes(c.kind)) {
      const d = db
        .prepare('SELECT * FROM collections WHERE id=? AND kind=?')
        .get(c.entity_id, c.kind) as any;
      if (!d || c.amount !== d.amount * (d.kind === 'refund' ? -1 : 1))
        fail('tahsilat kasa bağlantısı');
    } else fail('bilinmeyen kasa hareketi');
  }
  for (const c of db.prepare('SELECT * FROM collections').iterate() as Iterable<any>) {
    const original = cashByEvent.get(c.kind + '|' + c.id);
    if (!original || reversedCash.has(original.id) !== (c.status === 'cancelled'))
      fail('tahsilat / iptal kasa hareketi');
  }
  for (const a of db.prepare('SELECT * FROM activity').iterate() as Iterable<any>) {
    const table = (
      {
        preorder: 'preorders',
        preorder_allocate: 'preorder_events',
        preorder_unallocate: 'preorder_events',
        preorder_delivery: 'preorder_events',
        preorder_return: 'preorder_events',
        preorder_cancel: 'preorder_events',
        sale: 'sales',
        purchase: 'purchases',
        customer: 'customers',
        supplier: 'suppliers',
        product: 'products',
        customer_debt: 'customer_adjustments',
        customer_credit: 'customer_adjustments',
        collection: 'collections',
        refund: 'collections',
        expense: 'cash_transactions',
        expense_refund: 'cash_transactions',
        supplier_payment: 'supplier_payments',
        supplier_refund: 'supplier_payments',
        supplier_return: 'supplier_returns',
      } as Record<string, string>
    )[a.entity];
    if (
      table &&
      !db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(a.entity_id) &&
      !(
        version >= 8 &&
        ['product', 'customer', 'supplier'].includes(a.entity) &&
        db
          .prepare('SELECT 1 FROM deleted_records WHERE entity=? AND entity_id=?')
          .get(a.entity, a.entity_id)
      )
    )
      fail('aktivite bağlantısı');
    if (!table && a.entity !== 'settings') fail('bilinmeyen faaliyet türü');
  }
  if (version >= 8) reconcileCorrections(db, fail);
  if (version >= 3) reconcile3(db, fail);
  if (version >= 5) verifyCosts(db);
  if (version >= 2)
    for (const o of db.prepare('SELECT * FROM operations').iterate() as Iterable<any>) {
      if (contentHash(o.request_json) !== o.content_hash) fail('işlem içerik özeti');
      const c = JSON.parse(o.request_json);
      if (
        !commandSchema.safeParse({ ...c, operationId: o.operation_id }).success ||
        canonical(c) !== o.request_json
      )
        fail('geçersiz kanonik işlem içeriği');
      if (c.type === 'reverse') {
        const table = (
          {
            preorder: 'preorders',
            preorder_allocate: 'preorder_events',
            preorder_unallocate: 'preorder_events',
            preorder_delivery: 'preorder_events',
            preorder_return: 'preorder_events',
            preorder_cancel: 'preorder_events',
            sale: 'sales',
            purchase: 'purchases',
            customer_debt: 'customer_adjustments',
            customer_credit: 'customer_adjustments',
            collection: 'collections',
            refund: 'collections',
            expense: 'cash_transactions',
            expense_refund: 'cash_transactions',
            supplier_payment: 'supplier_payments',
            supplier_refund: 'supplier_payments',
            supplier_return: 'supplier_returns',
          } as Record<string, string>
        )[c.entity];
        if (!table || !db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(c.id))
          fail('iptal işlemi sonuç bağlantısı');
      }
      const table = (
        {
          preorder: 'preorders',
          preorder_allocate: 'preorder_events',
          preorder_unallocate: 'preorder_events',
          preorder_delivery: 'preorder_events',
          preorder_return: 'preorder_events',
          preorder_cancel: 'preorder_events',
          sale: 'sales',
          purchase: 'purchases',
          customer_debt: 'customer_adjustments',
          customer_credit: 'customer_adjustments',
          collection: 'collections',
          refund: 'collections',
          expense: 'cash_transactions',
          expense_refund: 'cash_transactions',
          adjust: 'stock_movements',
          supplier_payment: 'supplier_payments',
          supplier_refund: 'supplier_payments',
        } as Record<string, string>
      )[c.type];
      if (
        (table && !db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(o.result)) ||
        (c.type === 'reverse' && c.id !== o.result)
      )
        fail('işlem sonucu bağlantısı');
    }
}
