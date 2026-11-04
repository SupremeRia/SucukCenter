import { netResult } from '../shared/profit';
import type Database from 'better-sqlite3';
import { dayBounds, monthRange, monthLabel } from '../shared/dates';
import type { DateRange, PeriodReport, Statement } from '../shared/contracts';
import { customerBalance, decimalMoney } from '../shared/money';
import { productBalances } from './preorders';
export function bounds(range: DateRange) {
  const { from, to } = dayBounds(range.start, range.end);
  return { from: from || '0000', to: to || '9999' };
}
const n = (db: Database.Database, sql: string, args: object) => {
  const value = Number((db.prepare(sql).get(args) as { n: number }).n || 0);
  if (!Number.isSafeInteger(value))
    throw new Error('Rapor toplamı güvenli tam sayı sınırını aşıyor. Daha dar tarih seçin.');
  return value;
};
export function report(db: Database.Database, range: DateRange): PeriodReport {
  const r = bounds(range);
  const window = 'e.occurred_at>=@from AND e.occurred_at<@to';
  return db.transaction(() => {
    const revenue = n(
      db,
      `SELECT SUM(amount) n FROM(SELECT s.total amount,e.occurred_at FROM sales s JOIN event_meta e ON e.entity='sale' AND e.entity_id=s.id UNION ALL SELECT -s.total,e.occurred_at FROM sales s JOIN event_meta e ON e.entity='sale_cancel' AND e.entity_id=s.id) e WHERE ${window}`,
      r,
    );
    const cogs = n(
      db,
      `SELECT -SUM(m.effective_cost) n FROM effective_movements m JOIN event_meta e ON e.entity=m.kind AND e.entity_id=m.entity_id WHERE m.kind IN('sale','sale_cancel') AND ${window}`,
      r,
    );
    const ledger = (k: string, table = 'customer_ledger') =>
      n(
        db,
        `SELECT SUM(l.amount) n FROM ${table} l JOIN event_meta e ON e.entity=l.kind AND e.entity_id=l.entity_id WHERE ${window} AND l.kind IN(${k})`,
        r,
      );
    const cash = n(
      db,
      `SELECT SUM(c.amount) n FROM cash_transactions c LEFT JOIN supplier_payments p ON (p.legacy_cash_id=c.id OR p.legacy_cash_id=c.reverses_id) JOIN event_meta e ON e.entity=CASE WHEN p.id IS NOT NULL THEN CASE WHEN c.reverses_id IS NULL THEN 'supplier_payment' ELSE 'supplier_payment_cancel' END ELSE c.kind END AND e.entity_id=CASE WHEN p.id IS NOT NULL THEN p.id WHEN c.kind IN('expense','expense_cancel','expense_refund') THEN CASE WHEN c.reverses_id IS NULL THEN c.id ELSE c.entity_id END ELSE c.entity_id END WHERE ${window}`,
      r,
    );
    const expenses = n(
      db,
      `SELECT -SUM(c.amount) n FROM cash_transactions c JOIN event_meta e ON e.entity=c.kind AND e.entity_id=CASE WHEN c.kind='expense' THEN c.id ELSE c.entity_id END WHERE c.kind IN('expense','expense_cancel','expense_refund') AND ${window}`,
      r,
    );
    const stockDate = 'COALESCE(e.occurred_at,m.created_at)';
    const endingStockValue = n(
      db,
      `SELECT SUM(m.effective_cost) n FROM effective_movements m LEFT JOIN event_meta e ON e.entity=m.kind AND e.entity_id=CASE WHEN m.kind='adjust' THEN m.id ELSE m.entity_id END WHERE ${stockDate}<@to`,
      r,
    );
    const fire = n(
      db,
      `SELECT -SUM(m.effective_cost) n FROM effective_movements m JOIN event_meta e ON e.entity='adjust' AND e.entity_id=m.id WHERE m.kind='adjust' AND ${window}`,
      r,
    );
    const balances = (table: string, key: string, before: string) =>
      db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN b>0 THEN b ELSE 0 END),0) debt,COALESCE(SUM(CASE WHEN b<0 THEN -b ELSE 0 END),0) credit,COALESCE(SUM(b),0) balance FROM(SELECT l.${key},SUM(l.amount) b FROM ${table} l JOIN event_meta e ON e.entity=l.kind AND e.entity_id=l.entity_id WHERE e.occurred_at<${before} GROUP BY l.${key})`,
        )
        .get(r) as any;
    const closing = balances('customer_ledger', 'customer_id', '@to');
    const opening = balances('customer_ledger', 'customer_id', '@from');
    const supplier = balances('supplier_ledger', 'supplier_id', '@to');
    for (const value of [
      ...Object.values(closing),
      ...Object.values(opening),
      ...Object.values(supplier),
    ])
      if (typeof value !== 'number' || !Number.isSafeInteger(value))
        throw new Error('Rapor toplamı güvenli tam sayı sınırını aşıyor.');
    const returnVariance = n(
      db,
      `SELECT SUM(amount) n FROM(SELECT r.total+COALESCE((SELECT SUM(effective_cost) FROM effective_movements m WHERE m.kind='supplier_return' AND m.entity_id=r.id),0) amount,e.occurred_at FROM supplier_returns r JOIN event_meta e ON e.entity='supplier_return' AND e.entity_id=r.id UNION ALL SELECT -r.total+COALESCE((SELECT SUM(effective_cost) FROM effective_movements m WHERE m.kind='supplier_return_cancel' AND m.entity_id=r.id),0),e.occurred_at FROM supplier_returns r JOIN event_meta e ON e.entity='supplier_return_cancel' AND e.entity_id=r.id UNION ALL SELECT p.total+COALESCE((SELECT SUM(effective_cost) FROM effective_movements m WHERE m.kind='purchase_cancel' AND m.entity_id=p.id),0),e.occurred_at FROM purchases p JOIN event_meta e ON e.entity='purchase_cancel' AND e.entity_id=p.id) e WHERE ${window}`,
      r,
    );
    if (!Number.isSafeInteger(revenue - cogs))
      throw new Error('Brüt kâr toplamı güvenli tam sayı sınırını aşıyor.');
    const result: PeriodReport = {
      generatedAt: new Date().toISOString(),
      costRevisionCount: n(
        db,
        `SELECT COUNT(DISTINCT r.id) n FROM cost_revisions r JOIN json_each(r.impact_json,'$.changes') j WHERE json_extract(j.value,'$.month')>=@monthFrom AND json_extract(j.value,'$.month')<=@monthTo`,
        {
          monthFrom: range.start?.slice(0, 7) || '0000',
          monthTo: range.end?.slice(0, 7) || '9999',
        },
      ),
      lateEntries: n(
        db,
        `SELECT COUNT(*) n FROM event_meta e WHERE ${window} AND date(e.recorded_at,'+3 hours')>date(e.occurred_at,'+3 hours')`,
        r,
      ),
      grossSales: ledger("'sale'"),
      salesReturns: -ledger("'sale_cancel'"),
      grossPurchases: ledger("'purchase'", 'supplier_ledger'),
      purchaseReturns: -ledger(
        "'purchase_cancel','supplier_return','supplier_return_cancel'",
        'supplier_ledger',
      ),
      supplierPaid: -ledger("'supplier_payment','supplier_payment_cancel'", 'supplier_ledger'),
      supplierRefunds: ledger("'supplier_refund','supplier_refund_cancel'", 'supplier_ledger'),
      purchaseBreakdown: db
        .prepare(
          `SELECT product,supplier,unit,SUM(quantity) quantity,SUM(returnsQuantity) returnsQuantity,SUM(amount) amount,SUM(returned) returned FROM (
        SELECT i.product,s.name supplier,i.unit,i.quantity,0 returnsQuantity,i.total amount,0 returned FROM purchase_items i JOIN purchases p ON p.id=i.document_id JOIN suppliers s ON s.id=p.party_id JOIN event_meta e ON e.entity='purchase' AND e.entity_id=p.id WHERE ${window}
        UNION ALL SELECT i.product,s.name,i.unit,0,i.quantity,0,i.total FROM purchase_items i JOIN purchases p ON p.id=i.document_id JOIN suppliers s ON s.id=p.party_id JOIN event_meta e ON e.entity='purchase_cancel' AND e.entity_id=p.id WHERE ${window}
        UNION ALL SELECT o.product,s.name,o.unit,0,i.quantity*CASE WHEN e.entity='supplier_return' THEN 1 ELSE -1 END,0,i.total*CASE WHEN e.entity='supplier_return' THEN 1 ELSE -1 END FROM supplier_return_items i JOIN supplier_returns d ON d.id=i.document_id JOIN purchase_items o ON o.id=i.original_item_id JOIN suppliers s ON s.id=d.supplier_id JOIN event_meta e ON e.entity IN('supplier_return','supplier_return_cancel') AND e.entity_id=d.id WHERE ${window}
      ) GROUP BY product,supplier,unit ORDER BY product,supplier`,
        )
        .all(r) as PeriodReport['purchaseBreakdown'],
      revenue,
      cogs,
      profit: revenue - cogs,
      collected: 0 - ledger("'collection','collection_cancel'"),
      refunds: ledger("'refund','refund_cancel'"),
      expenses,
      fire,
      purchases: ledger(
        "'purchase','purchase_cancel','supplier_return','supplier_return_cancel'",
        'supplier_ledger',
      ),
      cash,
      returnVariance,
      endingStockValue,
      productDebtCost:
        0 -
        n(
          db,
          `SELECT SUM(m.effective_cost) n FROM effective_movements m JOIN event_meta e ON e.entity=m.kind AND e.entity_id=m.entity_id WHERE m.kind IN('product_debt_delivery','product_debt_return') AND ${window}`,
          r,
        ),
      endingDebt: closing.debt,
      endingCredit: closing.credit,
      openingCustomerBalance: opening.balance,
      closingCustomerBalance: closing.balance,
      supplierDebt: supplier.debt,
      supplierCredit: supplier.credit,
    };
    for (const row of result.purchaseBreakdown)
      for (const value of [row.quantity, row.returnsQuantity, row.amount, row.returned])
        if (!Number.isSafeInteger(value))
          throw new Error(
            'Alış dökümü toplamı güvenli tam sayı sınırını aşıyor. Daha dar dönem seçin.',
          );
    netResult(result);
    return result;
  })();
}
export function statement(
  db: Database.Database,
  customerId: number,
  range: DateRange,
  offset = 0,
  limit = 50,
  productOffset = offset,
): Statement {
  const r = { ...bounds(range), customer: customerId };
  return db.transaction(() => {
    const base = `FROM customer_ledger l JOIN event_meta e ON e.entity=l.kind AND e.entity_id=l.entity_id WHERE l.customer_id=@customer`;
    const opening = n(db, `SELECT SUM(l.amount) n ${base} AND e.occurred_at<@from`, r);
    const closing = n(db, `SELECT SUM(l.amount) n ${base} AND e.occurred_at<@to`, r);
    const sums = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN l.kind IN('sale','sale_cancel') THEN l.amount ELSE 0 END),0) sales,COALESCE(SUM(CASE WHEN l.kind IN('collection','collection_cancel') THEN -l.amount ELSE 0 END),0) collections,COALESCE(SUM(CASE WHEN l.kind IN('refund','refund_cancel') THEN l.amount ELSE 0 END),0) refunds,COALESCE(SUM(CASE WHEN l.kind IN('customer_debt','customer_credit','customer_debt_cancel','customer_credit_cancel','preorder_allocate','preorder_unallocate','preorder_delivery','preorder_return','preorder_cancel') THEN l.amount ELSE 0 END),0) adjustments,COUNT(*) total ${base} AND e.occurred_at>=@from AND e.occurred_at<@to`,
      )
      .get(r) as any;
    const rows = db
      .prepare(
        `SELECT l.*,e.occurred_at,e.recorded_at,@opening+SUM(l.amount) OVER(ORDER BY e.occurred_at,l.id ROWS UNBOUNDED PRECEDING) balance ${base} AND e.occurred_at>=@from AND e.occurred_at<@to ORDER BY e.occurred_at,l.id LIMIT @limit OFFSET @offset`,
      )
      .all({ ...r, opening, offset, limit }) as Statement['rows'];
    for (const row of rows) {
      if (row.kind.startsWith('customer_')) {
        const a = db
          .prepare('SELECT * FROM customer_adjustments WHERE id=?')
          .get(row.entity_id) as any;
        row.note = row.kind.endsWith('_cancel')
          ? (
              db
                .prepare(
                  'SELECT description FROM activity WHERE entity=? AND entity_id=? ORDER BY id DESC LIMIT 1',
                )
                .get(a.kind, a.id) as any
            )?.description
          : a.note;
        row.reference = a.reference;
        row.category = a.category;
        row.status = a.status;
      }
      if (['sale', 'sale_cancel'].includes(row.kind))
        row.items = db
          .prepare(
            'SELECT product,quantity,unit,price,total FROM sale_items WHERE document_id=? ORDER BY id',
          )
          .all(row.entity_id) as NonNullable<Statement['rows'][number]['items']>;
    }
    for (const row of rows)
      if (!Number.isSafeInteger(row.amount) || !Number.isSafeInteger(row.balance))
        throw new Error('Ekstre toplamı güvenli tam sayı sınırını aşıyor.');
    for (const value of Object.values(sums))
      if (typeof value !== 'number' || !Number.isSafeInteger(value))
        throw new Error('Ekstre toplamı güvenli tam sayı sınırını aşıyor.');
    return {
      openingProducts: productBalances(db, customerId, r.from),
      closingProducts: productBalances(db, customerId, r.to),
      reserved: n(
        db,
        `SELECT SUM(e.reserve_delta) n FROM preorder_events e JOIN preorders o ON o.id=e.order_id JOIN event_meta m ON m.entity=e.kind AND m.entity_id=e.id WHERE o.customer_id=@customer AND m.occurred_at<@to`,
        r,
      ),
      productEventTotal: n(
        db,
        `SELECT COUNT(*) n FROM event_meta m WHERE m.occurred_at>=@from AND m.occurred_at<@to AND ((m.entity='preorder' AND m.entity_id IN(SELECT id FROM preorders WHERE customer_id=@customer)) OR (m.entity IN('preorder_allocate','preorder_unallocate','preorder_delivery','preorder_return','preorder_cancel') AND m.entity_id IN(SELECT e.id FROM preorder_events e JOIN preorders o ON o.id=e.order_id WHERE o.customer_id=@customer)))`,
        r,
      ),
      productRows: db
        .prepare(
          `SELECT o.id order_id,o.id id,'preorder' kind,o.quantity,o.total amount,0 reserve_delta,NULL sale_id,NULL collection_id,NULL reverses_id,o.note,m.occurred_at,m.recorded_at,o.product,o.unit,o.customer_id FROM preorders o JOIN event_meta m ON m.entity='preorder' AND m.entity_id=o.id WHERE o.customer_id=@customer AND m.occurred_at>=@from AND m.occurred_at<@to
      UNION ALL SELECT e.order_id,e.id,e.kind,e.quantity,e.amount,e.reserve_delta,e.sale_id,e.collection_id,e.reverses_id,e.note,m.occurred_at,m.recorded_at,o.product,o.unit,o.customer_id FROM preorder_events e JOIN preorders o ON o.id=e.order_id JOIN event_meta m ON m.entity=e.kind AND m.entity_id=e.id WHERE o.customer_id=@customer AND m.occurred_at>=@from AND m.occurred_at<@to ORDER BY occurred_at,id LIMIT @limit OFFSET @productOffset`,
        )
        .all({ ...r, limit, productOffset }) as NonNullable<Statement['productRows']>,
      opening,
      closing,
      ...sums,
      rows,
      current: n(db, `SELECT SUM(l.amount) n ${base}`, r),
      grossSales: n(
        db,
        `SELECT SUM(l.amount) n ${base} AND l.kind='sale' AND e.occurred_at>=@from AND e.occurred_at<@to`,
        r,
      ),
      salesReturns: -n(
        db,
        `SELECT SUM(l.amount) n ${base} AND l.kind='sale_cancel' AND e.occurred_at>=@from AND e.occurred_at<@to`,
        r,
      ),
      generatedAt: new Date().toISOString(),
      lateEntries: n(
        db,
        `SELECT COUNT(*) n ${base} AND e.occurred_at>=@from AND e.occurred_at<@to AND date(e.recorded_at,'+3 hours')>date(e.occurred_at,'+3 hours')`,
        r,
      ),
    };
  })();
}
function csvCell(v: string | number) {
  const text = typeof v === 'number' ? decimalMoney(v) : /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  return `"${text.replaceAll('"', '""')}"`;
}
export function customerCSV(db: Database.Database, id: number, range: DateRange) {
  const customer = db.prepare('SELECT name FROM customers WHERE id=?').get(id) as
    | { name: string }
    | undefined;
  if (!customer) throw new Error('Müşteri bulunamadı.');
  const s = statement(db, id, range, 0, Number.MAX_SAFE_INTEGER);
  if (s.opening + s.sales - s.collections + s.refunds + (s.adjustments || 0) !== s.closing)
    throw new Error('Ekstre toplamları uyuşmuyor.');
  const rows: (string | number)[][] = [
    ['Müşteri', customer.name],
    ['Dönem', range.start || 'Başlangıç', range.end || 'Bugüne kadar'],
    ['Dönem açıklaması', monthLabel(range)],
    ['Oluşturulma zamanı', s.generatedAt || ''],
    ['Geçmiş döneme sonradan eklenen hareket', String(s.lateEntries || 0)],
    ['Açılış bakiyesi', s.opening],
    [
      'İşlem tarihi',
      'Kayıt zamanı',
      'Tür',
      'Belge',
      'Borç / Alacak (işaretli TL)',
      'Bakiye (işaretli TL)',
      'Bakiye açıklaması',
      'Açıklama',
      'Referans',
      'Kategori',
    ],
    ...s.rows.flatMap((r) => [
      [
        r.occurred_at,
        r.recorded_at,
        r.kind,
        String(r.entity_id),
        r.amount,
        r.balance,
        customerBalance(r.balance),
        r.note || '',
        r.reference || '',
        r.category || '',
      ],
      ...(r.items || []).map((i) => [
        'Ürün',
        i.product,
        `${i.quantity / 1000} ${i.unit}`,
        'Birim fiyat',
        i.price,
        'Toplam',
        i.total,
      ]),
    ]),
    ['Brüt satış', s.grossSales || 0],
    ['Satış iade / iptal', s.salesReturns || 0],
    ['Net satış', s.sales],
    ['Toplam tahsilat', s.collections],
    ['Toplam para iadesi', s.refunds],
    ['Net cari borç / alacak eklemeleri', s.adjustments || 0],
    ['Kapanış bakiyesi', s.closing, customerBalance(s.closing)],
    ['Dönem sonu siparişlere ayrılmış ödeme', s.reserved || 0],
    ['ÜRÜN TESLİM YÜKÜMLÜLÜKLERİ — para bakiyesine eklenmez'],
    ...(s.openingProducts || []).map((p) => [
      'Dönem başı ürün',
      p.product,
      `${p.quantity / 1000} ${p.unit}`,
    ]),
    ...(s.closingProducts || []).map((p) => [
      'Dönem sonu ürün',
      p.product,
      `${p.quantity / 1000} ${p.unit}`,
    ]),
    ...(s.productRows || []).map((p) => [
      p.occurred_at,
      p.recorded_at,
      p.kind,
      `Sipariş #${p.order_id}`,
      p.product,
      `${p.quantity / 1000} ${p.unit}`,
      p.amount,
      p.reserve_delta,
      p.note,
    ]),
    ['Bugünkü güncel bakiye', s.current || 0],
  ];
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
}
export function annualReport(db: Database.Database, year: number) {
  return db.transaction(() =>
    Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      report: report(db, monthRange(year, i + 1)),
    })),
  )();
}
export function supplierStatement(
  db: Database.Database,
  supplierId: number,
  range: DateRange,
  offset = 0,
): Statement {
  const r = { ...bounds(range), supplier: supplierId };
  return db.transaction(() => {
    const base = `FROM supplier_ledger l JOIN event_meta e ON e.entity=l.kind AND e.entity_id=l.entity_id WHERE l.supplier_id=@supplier`;
    const opening = n(db, `SELECT SUM(l.amount) n ${base} AND e.occurred_at<@from`, r);
    const closing = n(db, `SELECT SUM(l.amount) n ${base} AND e.occurred_at<@to`, r);
    const totals = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN l.kind IN('purchase','purchase_cancel','supplier_return','supplier_return_cancel') THEN l.amount ELSE 0 END),0) sales,COALESCE(SUM(CASE WHEN l.kind IN('supplier_payment','supplier_payment_cancel') THEN -l.amount ELSE 0 END),0) collections,COALESCE(SUM(CASE WHEN l.kind IN('supplier_refund','supplier_refund_cancel') THEN l.amount ELSE 0 END),0) refunds,COUNT(*) total ${base} AND e.occurred_at>=@from AND e.occurred_at<@to`,
      )
      .get(r) as any;
    const rows = db
      .prepare(
        `SELECT l.*,e.occurred_at,e.recorded_at,(SELECT p.status FROM supplier_payments p WHERE p.id=l.entity_id AND l.kind IN('supplier_payment','supplier_refund')) payment_status,(SELECT p.method FROM supplier_payments p WHERE p.id=l.entity_id AND l.kind IN('supplier_payment','supplier_refund')) method,(SELECT p.note FROM supplier_payments p WHERE p.id=l.entity_id AND l.kind IN('supplier_payment','supplier_refund')) note,@opening+SUM(l.amount) OVER(ORDER BY e.occurred_at,l.id ROWS UNBOUNDED PRECEDING) balance ${base} AND e.occurred_at>=@from AND e.occurred_at<@to ORDER BY e.occurred_at,l.id LIMIT 50 OFFSET @offset`,
      )
      .all({ ...r, opening, offset }) as Statement['rows'];
    for (const value of Object.values(totals))
      if (typeof value !== 'number' || !Number.isSafeInteger(value))
        throw new Error('Ekstre toplamı güvenli tam sayı sınırını aşıyor.');
    for (const row of rows)
      if (!Number.isSafeInteger(row.amount) || !Number.isSafeInteger(row.balance))
        throw new Error('Ekstre bakiyesi güvenli tam sayı sınırını aşıyor.');
    return { opening, closing, ...totals, rows };
  })();
}
