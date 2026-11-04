import type Database from 'better-sqlite3';
export function reconcile3(db: Database.Database, fail: (message: string) => never) {
  if (
    db
      .prepare(
        "SELECT m.id FROM stock_movements m LEFT JOIN supplier_returns r ON r.id=m.entity_id WHERE m.kind IN('supplier_return','supplier_return_cancel') AND r.id IS NULL LIMIT 1",
      )
      .get()
  )
    fail('yetim tedarikçi iade hareketi');
  const expected = new Map<string, number>();
  const add = (supplier: number, kind: string, id: number, amount: number) =>
    expected.set(`${supplier}|${kind}|${id}`, amount);
  for (const d of db.prepare('SELECT * FROM purchases').iterate() as Iterable<any>) {
    add(d.party_id, 'purchase', d.id, d.total);
    if (d.status === 'cancelled') add(d.party_id, 'purchase_cancel', d.id, -d.total);
  }
  for (const p of db.prepare('SELECT * FROM supplier_payments').iterate() as Iterable<any>) {
    const sign = p.kind === 'supplier_payment' ? -1 : 1;
    add(p.supplier_id, p.kind, p.id, p.amount * sign);
    if (p.status === 'cancelled') add(p.supplier_id, `${p.kind}_cancel`, p.id, -p.amount * sign);
    const cash = db
      .prepare(
        'SELECT * FROM cash_transactions WHERE id=? OR(kind=? AND entity_id=? AND reverses_id IS NULL)',
      )
      .all(p.legacy_cash_id || -1, p.kind, p.id) as any[];
    if (cash.length !== 1 || cash[0].amount !== p.amount * sign)
      fail('tedarikçi ödeme / kasa tutarı');
    const reverse = db
      .prepare('SELECT * FROM cash_transactions WHERE reverses_id=?')
      .get(cash[0].id) as any;
    if (!!reverse !== (p.status === 'cancelled')) fail('tedarikçi ödeme / kasa iptali');
  }
  for (const r of db.prepare('SELECT * FROM supplier_returns').iterate() as Iterable<any>) {
    add(r.supplier_id, 'supplier_return', r.id, -r.total);
    if (r.status === 'cancelled') add(r.supplier_id, 'supplier_return_cancel', r.id, r.total);
    const sums = db
      .prepare(
        'SELECT COALESCE(SUM(total),0) total,COALESCE(SUM(cost),0) cost,COUNT(*) count FROM supplier_return_items WHERE document_id=?',
      )
      .get(r.id) as any;
    if (!sums.count || sums.total !== r.total || sums.cost !== r.cost)
      fail('tedarikçi iade kalem toplamı');
    const purchase = db
      .prepare('SELECT party_id FROM purchases WHERE id=?')
      .get(r.purchase_id) as any;
    if (!purchase || purchase.party_id !== r.supplier_id) fail('tedarikçi iade alış bağlantısı');
    for (const cancel of [false, true]) {
      const kind = cancel ? 'supplier_return_cancel' : 'supplier_return';
      if (cancel && r.status !== 'cancelled') {
        if (
          db.prepare('SELECT 1 FROM stock_movements WHERE kind=? AND entity_id=?').get(kind, r.id)
        )
          fail('fazladan tedarikçi iade iptali');
        continue;
      }
      const items = db
        .prepare(
          'SELECT product_id,SUM(quantity) quantity,SUM(cost) cost FROM supplier_return_items WHERE document_id=? GROUP BY product_id',
        )
        .all(r.id) as any[];
      const moves = db
        .prepare(
          'SELECT product_id,SUM(quantity) quantity,SUM(cost) cost FROM stock_movements WHERE kind=? AND entity_id=? GROUP BY product_id',
        )
        .all(kind, r.id) as any[];
      if (items.length !== moves.length) fail('iade stok bağlantısı');
      for (const i of items) {
        const m = moves.find((m) => m.product_id === i.product_id);
        const sign = cancel ? 1 : -1;
        if (!m || m.quantity !== i.quantity * sign || m.cost !== i.cost * sign)
          fail('iade stok miktarı / maliyeti');
      }
    }
  }
  for (const i of db.prepare('SELECT * FROM supplier_return_items').iterate() as Iterable<any>) {
    const original = db
      .prepare('SELECT * FROM purchase_items WHERE id=?')
      .get(i.original_item_id) as any;
    const doc = db.prepare('SELECT * FROM supplier_returns WHERE id=?').get(i.document_id) as any;
    if (
      !original ||
      original.product_id !== i.product_id ||
      original.document_id !== doc.purchase_id ||
      i.price !== original.price
    )
      fail('iade özgün kalem bağlantısı');
    const used = db
      .prepare(
        "SELECT COALESCE(SUM(i.quantity),0) q,COALESCE(SUM(i.total),0) t FROM supplier_return_items i JOIN supplier_returns r ON r.id=i.document_id WHERE i.original_item_id=? AND r.status='active'",
      )
      .get(i.original_item_id) as any;
    if (used.q > original.quantity || used.t > original.total) fail('fazla tedarikçi iadesi');
  }
  for (const l of db.prepare('SELECT * FROM supplier_ledger').iterate() as Iterable<any>) {
    const key = `${l.supplier_id}|${l.kind}|${l.entity_id}`;
    if (!expected.has(key) || expected.get(key) !== l.amount) fail('tedarikçi cari kaydı');
    expected.delete(key);
  }
  if (expected.size) fail('eksik tedarikçi cari kaydı');
  const links: Record<string, string> = {
    sale: 'sales',
    purchase: 'purchases',
    collection: 'collections',
    refund: 'collections',
    expense: 'cash_transactions',
    adjust: 'stock_movements',
    supplier_payment: 'supplier_payments',
    supplier_refund: 'supplier_payments',
    supplier_return: 'supplier_returns',
  };
  if (Number(db.pragma('user_version', { simple: true })) >= 6) {
    links.customer_debt = 'customer_adjustments';
    links.customer_credit = 'customer_adjustments';
  }
  if (Number(db.pragma('user_version', { simple: true })) >= 7) {
    Object.assign(links, {
      preorder: 'preorders',
      preorder_allocate: 'preorder_events',
      preorder_unallocate: 'preorder_events',
      preorder_delivery: 'preorder_events',
      preorder_return: 'preorder_events',
      preorder_cancel: 'preorder_events',
      product_debt_delivery: 'preorder_events',
      product_debt_return: 'preorder_events',
    });
  }
  const supportsExpenseRefund = Number(db.pragma('user_version', { simple: true })) >= 10;
  for (const m of db.prepare('SELECT * FROM event_meta').iterate() as Iterable<any>) {
    const table =
      (m.entity === 'expense_refund' && supportsExpenseRefund ? 'cash_transactions' : undefined) ||
      links[m.entity] ||
      links[m.entity.replace(/_cancel$/, '')];
    if (
      !table ||
      !db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(m.entity_id) ||
      Number.isNaN(Date.parse(m.occurred_at)) ||
      Number.isNaN(Date.parse(m.recorded_at))
    )
      fail('işlem tarihi / kayıt bağlantısı');
  }
  for (const [entity, table] of Object.entries(links)) {
    const where =
      table === 'preorder_events'
        ? `WHERE d.kind='${entity.replace('product_debt_', 'preorder_')}' AND ${entity.startsWith('product_debt_') ? "d.sale_id IS NULL AND EXISTS(SELECT 1 FROM preorders o WHERE o.id=d.order_id AND o.source='other')" : '1=1'}`
        : entity === 'expense'
          ? "WHERE d.kind='expense' AND d.reverses_id IS NULL"
          : entity === 'adjust'
            ? "WHERE d.kind='adjust'"
            : [
                  'customer_debt',
                  'customer_credit',
                  'collection',
                  'refund',
                  'supplier_payment',
                  'supplier_refund',
                ].includes(entity)
              ? `WHERE d.kind='${entity}'`
              : '';
    if (
      db
        .prepare(
          `SELECT d.id FROM ${table} d LEFT JOIN event_meta e ON e.entity='${entity}' AND e.entity_id=d.id ${where ? where + ' AND' : 'WHERE'} e.entity_id IS NULL LIMIT 1`,
        )
        .get()
    )
      fail('eksik işlem tarihi');
  }
  if (
    db
      .prepare(
        'SELECT a.id FROM activity a LEFT JOIN activity_meta m ON m.activity_id=a.id WHERE m.activity_id IS NULL LIMIT 1',
      )
      .get()
  )
    fail('eksik faaliyet tarihi');
}
