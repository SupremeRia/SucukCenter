import type Database from 'better-sqlite3';
import { type Snapshot, type ViewQuery } from '../shared/contracts';
import { bounds } from './reports';
import { effectiveDocuments, effectiveItems } from './costing';
function numericId(query: string, prefix: string) {
  const value = query.trim().replace(/^#?[sg]-?/i, '');
  if (
    /^#?[sg]/i.test(query.trim()) &&
    !query.trim().replace('#', '').toUpperCase().startsWith(prefix)
  )
    return -1;
  return /^\d{1,10}$/.test(value) ? Number(value) : -1;
}
export function view(db: Database.Database, file: string, q: ViewQuery): Snapshot {
  const cacheable = !db.inTransaction;
  return db.transaction(() => {
    const r = bounds(q.range);
    if (q.plannedFrom || q.plannedTo)
      bounds({ start: q.plannedFrom || undefined, end: q.plannedTo || undefined });
    const visible = q.includeArchived ? '1=1' : 'active=1';
    const limit = 50;
    const offset = q.offset;
    const all = (sql: string, args: any[] = []) => db.prepare(sql).all(...args) as any[];
    const count = (sql: string, args: any[] = []) =>
      Number((db.prepare(sql).get(...args) as any).n);
    const contextLimit = 10;
    const docRows = (
      table: 'sales' | 'purchases',
      party: 'customers' | 'suppliers',
      entity: string,
    ) => {
      const activePage = q.page === table;
      const filter = activePage ? ` AND (instr(tr_fold(p.name),tr_fold(?))>0 OR d.id=?)` : '';
      const account =
        table === 'sales' && q.customerId
          ? [' AND d.party_id=?', q.customerId]
          : table === 'purchases' && q.supplierId
            ? [' AND d.party_id=?', q.supplierId]
            : [''];
      const args = [
        entity,
        r.from,
        r.to,
        ...(activePage ? [q.search, numericId(q.search, entity === 'sale' ? 'S' : 'G')] : []),
        ...account.slice(1),
      ];
      const base = `FROM ${table} d JOIN ${party} p ON p.id=d.party_id JOIN event_meta e ON e.entity=? AND e.entity_id=d.id WHERE e.occurred_at>=? AND e.occurred_at<? ${filter}${account[0]}`;
      const rows = all(
        `SELECT d.*,p.name party,e.occurred_at,e.recorded_at,e.reference,e.free_reason ${base} ORDER BY e.occurred_at DESC,d.id DESC LIMIT ? OFFSET ?`,
        [...args, activePage ? limit : contextLimit, activePage ? offset : 0],
      );
      if (q.focusEntity === entity && q.focusId && !rows.some((d) => d.id === q.focusId))
        rows.push(
          ...all(
            `SELECT d.*,p.name party,e.occurred_at,e.recorded_at,e.reference,e.free_reason FROM ${table} d JOIN ${party} p ON p.id=d.party_id JOIN event_meta e ON e.entity=? AND e.entity_id=d.id WHERE d.id=?`,
            [entity, q.focusId],
          ),
        );
      return { rows, total: activePage ? count(`SELECT COUNT(*) n ${base}`, args) : rows.length };
    };
    const sales = docRows('sales', 'customers', 'sale');
    effectiveDocuments(db, sales.rows, 'sale');
    const purchases = docRows('purchases', 'suppliers', 'purchase');
    const productSearch = q.page === 'products' || q.page === 'stock' ? q.search : '';
    const products = all(
      `SELECT p.*,(SELECT i.price FROM purchase_items i JOIN purchases d ON d.id=i.document_id WHERE i.product_id=p.id AND d.status='active' ORDER BY i.id DESC LIMIT 1) last_purchase_price FROM products p WHERE (${visible}) AND instr(tr_fold(p.name),tr_fold(?))>0 ORDER BY tr_sort(p.name) LIMIT ? OFFSET ?`,
      [
        productSearch,
        limit,
        q.page === 'products' || (q.page === 'stock' && q.tab !== 'movements') ? offset : 0,
      ],
    );
    if (q.page === 'home')
      for (const p of all(
        'SELECT * FROM products WHERE active=1 AND stock<=critical ORDER BY stock LIMIT 10',
      ))
        if (!products.some((x) => x.id === p.id)) products.push(p);
    if (q.focusEntity === 'product' && q.focusId && !products.some((p) => p.id === q.focusId))
      products.push(...all('SELECT * FROM products WHERE id=?', [q.focusId]));
    if (q.focusId && ['sale', 'purchase', 'preorder'].includes(q.focusEntity || '')) {
      const ids =
        q.focusEntity === 'preorder'
          ? all('SELECT product_id FROM preorders WHERE id=?', [q.focusId])
          : all(
              'SELECT DISTINCT product_id FROM ' +
                (q.focusEntity === 'sale' ? 'sale_items' : 'purchase_items') +
                ' WHERE document_id=?',
              [q.focusId],
            );
      const missing = ids
        .map((row) => row.product_id)
        .filter((id) => !products.some((p) => p.id === id));
      if (missing.length)
        products.push(
          ...all(
            "SELECT p.*,(SELECT i.price FROM purchase_items i JOIN purchases d ON d.id=i.document_id WHERE i.product_id=p.id AND d.status='active' ORDER BY i.id DESC LIMIT 1) last_purchase_price FROM products p WHERE p.id IN(" +
              missing.map(() => '?').join(',') +
              ')',
            missing,
          ),
        );
    }
    const parties = (
      table: 'customers' | 'suppliers',
      ledger: string,
      key: string,
      selected?: number,
    ) => {
      const isPage =
        q.page === table ||
        (table === 'suppliers' && q.page === 'purchases' && q.tab === 'suppliers');
      const search = isPage ? q.search : '';
      const rows = all(
        `SELECT p.*,COALESCE((SELECT SUM(amount) FROM ${ledger} l WHERE l.${key}=p.id),0) balance FROM ${table} p WHERE (${visible}) AND instr(tr_fold(p.name||' '||p.contact||' '||p.phone),tr_fold(?))>0 ORDER BY ${table === 'customers' ? (q.customerSort === 'balance' ? 'balance' : 'tr_sort(p.' + q.customerSort + ')') + ' ' + q.sortDirection + ',tr_sort(p.name) ASC,p.id ASC' : 'tr_sort(p.name)'} LIMIT ? OFFSET ?`,
        [search, limit, isPage ? offset : 0],
      );
      if (selected && !rows.some((p) => p.id === selected))
        rows.push(
          ...all(
            `SELECT p.*,COALESCE((SELECT SUM(amount) FROM ${ledger} l WHERE l.${key}=p.id),0) balance FROM ${table} p WHERE p.id=?`,
            [selected],
          ),
        );
      return rows;
    };
    const customers = parties('customers', 'customer_ledger', 'customer_id', q.customerId);
    const suppliers = parties('suppliers', 'supplier_ledger', 'supplier_id', q.supplierId);
    const collectionWhere = `FROM collections c JOIN customers p ON p.id=c.customer_id JOIN event_meta e ON e.entity=c.kind AND e.entity_id=c.id WHERE e.occurred_at>=? AND e.occurred_at<? AND instr(tr_fold(p.name||' '||c.note),tr_fold(?))>0${q.customerId ? ' AND c.customer_id=?' : ''}`;
    const ca = [
      r.from,
      r.to,
      q.page === 'collections' ? q.search : '',
      ...(q.customerId ? [q.customerId] : []),
    ];
    const collections = all(
      `SELECT c.*,p.name party,e.occurred_at,e.recorded_at,(SELECT COALESCE(SUM(f.paid_delta),0) FROM preorder_funding f JOIN preorder_events a ON a.id=f.allocation_id WHERE a.collection_id=c.id) allocated ${collectionWhere} ORDER BY e.occurred_at DESC,c.id DESC LIMIT ? OFFSET ?`,
      [
        ...ca,
        q.page === 'collections' ? limit : contextLimit,
        q.page === 'collections' ? offset : 0,
      ],
    );
    if (
      ['collection', 'refund'].includes(q.focusEntity || '') &&
      q.focusId &&
      !collections.some((c) => c.id === q.focusId)
    )
      collections.push(
        ...all(
          'SELECT c.*,p.name party,e.occurred_at,e.recorded_at FROM collections c JOIN customers p ON p.id=c.customer_id JOIN event_meta e ON e.entity=c.kind AND e.entity_id=c.id WHERE c.id=?',
          [q.focusId],
        ),
      );
    const activityBase = `FROM activity a JOIN activity_meta m ON m.activity_id=a.id WHERE m.occurred_at>=? AND m.occurred_at<?${q.customerId ? ' AND a.customer_id=?' : ''}`;
    const aa = [r.from, r.to, ...(q.customerId ? [q.customerId] : [])];
    const activities = all(
      `SELECT a.*,m.occurred_at created_at,m.recorded_at ${activityBase} ORDER BY m.occurred_at DESC,a.id DESC LIMIT ? OFFSET ?`,
      [...aa, limit, ['home', 'history', 'customers'].includes(q.page) ? offset : 0],
    );
    const cashJoin = `FROM cash_transactions c LEFT JOIN supplier_payments p ON(p.legacy_cash_id=c.id OR p.legacy_cash_id=c.reverses_id) LEFT JOIN cash_transactions oc ON oc.id=c.reverses_id LEFT JOIN event_meta e ON e.entity=CASE WHEN p.id IS NOT NULL THEN CASE WHEN c.reverses_id IS NULL THEN 'supplier_payment' ELSE 'supplier_payment_cancel' END ELSE c.kind END AND e.entity_id=CASE WHEN p.id IS NOT NULL THEN p.id WHEN c.kind='expense' THEN c.id ELSE c.entity_id END`;
    const cash = all(
      `SELECT c.*,COALESCE(e.occurred_at,c.created_at) occurred_at,c.created_at recorded_at,CASE WHEN p.id IS NOT NULL THEN CASE WHEN c.reverses_id IS NULL THEN 'supplier_payment' ELSE 'supplier_payment_cancel' END ELSE c.kind END display_kind,CASE WHEN p.id IS NOT NULL THEN 'supplier_payment' ELSE COALESCE(oc.kind,c.kind) END source_kind,CASE WHEN p.id IS NOT NULL THEN p.id WHEN COALESCE(oc.kind,c.kind)='expense' THEN COALESCE(oc.id,c.id) ELSE COALESCE(oc.entity_id,c.entity_id) END source_id ${cashJoin} WHERE COALESCE(e.occurred_at,c.created_at)>=? AND COALESCE(e.occurred_at,c.created_at)<? ORDER BY c.id DESC LIMIT ? OFFSET ?`,
      [
        r.from,
        r.to,
        q.page === 'finance' ? limit : contextLimit,
        q.page === 'finance' ? offset : 0,
      ],
    );
    if (q.focusEntity === 'expense' && q.focusId && !cash.some((c) => c.id === q.focusId))
      cash.push(
        ...all(
          `SELECT c.*,e.occurred_at,e.recorded_at FROM cash_transactions c LEFT JOIN event_meta e ON e.entity=c.kind AND e.entity_id=CASE WHEN c.kind='expense' THEN c.id ELSE c.entity_id END WHERE c.id=? OR c.reverses_id=?`,
          [q.focusId, q.focusId],
        ),
      );
    const expenseBase = `FROM cash_transactions c JOIN expense_details d ON d.cash_id=CASE WHEN c.kind='expense' THEN c.id ELSE c.entity_id END JOIN event_meta e ON e.entity=c.kind AND e.entity_id=d.cash_id WHERE c.kind IN('expense','expense_cancel','expense_refund') AND e.occurred_at>=? AND e.occurred_at<? AND instr(tr_fold(d.name),tr_fold(?))>0`;
    const ea = [r.from, r.to, q.search];
    const expenseJoin = expenseBase.replace(
      ' WHERE',
      ' LEFT JOIN cash_transactions z ON z.reverses_id=d.cash_id LEFT JOIN event_meta ze ON ze.entity=z.kind AND ze.entity_id=d.cash_id WHERE',
    );
    const expenses =
      q.page === 'expenses'
        ? all(
            `SELECT d.cash_id id,c.id effectId,c.kind effectKind,d.name,d.description,d.method,-c.amount amount,e.occurred_at,e.recorded_at,
      CASE WHEN EXISTS(SELECT 1 FROM corrections x WHERE x.entity='expense' AND x.original_id=d.cash_id) THEN 'corrected'
      WHEN z.kind='expense_refund' THEN 'refunded' WHEN z.id IS NOT NULL THEN 'cancelled' ELSE 'active' END status,
      ze.occurred_at refund_at ${expenseJoin} ORDER BY e.occurred_at DESC,c.id DESC LIMIT ? OFFSET ?`,
            [...ea, limit, offset],
          )
        : [];
    // Names filter original records; signed effects use their own transaction date.
    const expenseTotal =
      q.page === 'expenses'
        ? count(
            `SELECT COALESCE(-SUM(c.amount),0) n FROM cash_transactions c JOIN expense_details d ON d.cash_id=CASE WHEN c.kind='expense' THEN c.id ELSE c.entity_id END JOIN event_meta e ON e.entity=c.kind AND e.entity_id=CASE WHEN c.kind='expense' THEN c.id ELSE c.entity_id END WHERE c.kind IN('expense','expense_cancel','expense_refund') AND e.occurred_at>=? AND e.occurred_at<? AND instr(tr_fold(d.name),tr_fold(?))>0`,
            ea,
          )
        : undefined;
    if (expenseTotal !== undefined && !Number.isSafeInteger(expenseTotal))
      throw new Error('Gider toplamı güvenli tam sayı sınırını aşıyor. Daha dar dönem seçin.');
    const movementBase = `FROM effective_movements m JOIN products p ON p.id=m.product_id WHERE instr(tr_fold(p.name),tr_fold(?))>0`;
    const movements = all(
      `SELECT m.*,m.effective_cost cost,p.name product ${movementBase} ORDER BY m.id DESC LIMIT ? OFFSET ?`,
      [
        q.page === 'stock' ? q.search : '',
        q.page === 'stock' ? limit : contextLimit,
        q.page === 'stock' && q.tab === 'movements' ? offset : 0,
      ],
    );
    const items = (table: string, docs: any[]) =>
      docs.length
        ? all(
            `SELECT * FROM ${table} WHERE document_id IN(${docs.map(() => '?').join(',')})`,
            docs.map((d) => d.id),
          )
        : [];
    const supplierFilter = q.supplierId ? ' AND d.supplier_id=?' : '';
    const sa = [r.from, r.to, ...(q.supplierId ? [q.supplierId] : [])];
    const sp = all(
      `SELECT d.*,s.name party,e.occurred_at,e.recorded_at FROM supplier_payments d JOIN suppliers s ON s.id=d.supplier_id JOIN event_meta e ON e.entity=d.kind AND e.entity_id=d.id WHERE e.occurred_at>=? AND e.occurred_at<? ${supplierFilter} ORDER BY d.id DESC LIMIT 50`,
      sa,
    );
    const sr = all(
      `SELECT d.*,s.name party,e.occurred_at,e.recorded_at FROM supplier_returns d JOIN suppliers s ON s.id=d.supplier_id JOIN event_meta e ON e.entity='supplier_return' AND e.entity_id=d.id WHERE e.occurred_at>=? AND e.occurred_at<? ${supplierFilter} ORDER BY d.id DESC LIMIT 50`,
      sa,
    );
    if (
      q.focusId &&
      ['supplier_payment', 'supplier_refund'].includes(q.focusEntity || '') &&
      !sp.some((p) => p.id === q.focusId)
    )
      sp.push(
        ...all(
          'SELECT d.*,s.name party,e.occurred_at,e.recorded_at FROM supplier_payments d JOIN suppliers s ON s.id=d.supplier_id JOIN event_meta e ON e.entity=d.kind AND e.entity_id=d.id WHERE d.id=?',
          [q.focusId],
        ),
      );
    if (q.focusId && q.focusEntity === 'supplier_return' && !sr.some((r) => r.id === q.focusId))
      sr.push(
        ...all(
          "SELECT d.*,s.name party,e.occurred_at,e.recorded_at FROM supplier_returns d JOIN suppliers s ON s.id=d.supplier_id JOIN event_meta e ON e.entity='supplier_return' AND e.entity_id=d.id WHERE d.id=?",
          [q.focusId],
        ),
      );
    const settings = Object.fromEntries(
      all('SELECT * FROM settings').map((r) => [r.key, r.value]),
    ) as Snapshot['settings'];
    const orderWhere = `FROM preorder_summary o JOIN event_meta m ON m.entity='preorder' AND m.entity_id=o.id WHERE (? IS NULL OR o.customer_id=?) AND instr(tr_fold(o.customer||' '||o.product||' '||o.reference),tr_fold(?))>0 AND (?=0 OR o.remaining>0) AND (?='' OR o.planned_on>=?) AND (?='' OR o.planned_on<=?) AND m.occurred_at>=? AND m.occurred_at<? AND (? IS NULL OR o.id=?)`;
    const orderArgs = [
      q.customerId || null,
      q.customerId || null,
      q.page === 'preorders' ? q.search : '',
      q.pendingOnly ? 1 : 0,
      q.plannedFrom || '',
      q.plannedFrom || '',
      q.plannedTo || '',
      q.plannedTo || '',
      r.from,
      r.to,
      q.preorderId || null,
      q.preorderId || null,
    ];
    const preorders = all(
      `SELECT o.*,m.occurred_at ${orderWhere} ORDER BY m.occurred_at DESC,o.id DESC LIMIT 50 OFFSET ?`,
      [...orderArgs, q.page === 'preorders' ? offset : 0],
    );
    const orderEvents = preorders.length
      ? all(
          `SELECT e.*,m.occurred_at,m.recorded_at,o.product,o.unit,o.customer_id FROM preorder_events e JOIN preorders o ON o.id=e.order_id JOIN event_meta m ON m.entity=e.kind AND m.entity_id=e.id WHERE o.id IN(${preorders.map(() => '?').join(',')}) ORDER BY e.id DESC LIMIT 50 OFFSET ?`,
          [...preorders.map((o) => o.id), q.eventOffset || 0],
        )
      : [];
    effectiveDocuments(db, sr, 'supplier_return');
    const { balances, totals } = summary(db, cacheable);
    let total = activities.length;
    if (q.page === 'preorders') total = count(`SELECT COUNT(*) n ${orderWhere}`, orderArgs);
    if (q.page === 'products' || (q.page === 'stock' && q.tab !== 'movements'))
      total = count(
        `SELECT COUNT(*) n FROM products WHERE (${visible}) AND instr(tr_fold(name),tr_fold(?))>0`,
        [q.search],
      );
    else if (q.page === 'stock') total = count(`SELECT COUNT(*) n ${movementBase}`, [q.search]);
    else if (q.page === 'sales') total = sales.total;
    else if (q.page === 'purchases')
      total =
        q.tab === 'suppliers'
          ? count(
              `SELECT COUNT(*) n FROM suppliers WHERE (${visible}) AND instr(tr_fold(name||' '||contact||' '||phone),tr_fold(?))>0`,
              [q.search],
            )
          : q.tab === 'migration'
            ? count('SELECT COUNT(*) n FROM migration_review')
            : purchases.total;
    else if (q.page === 'customers' && !q.customerId)
      total = count(
        `SELECT COUNT(*) n FROM customers WHERE (${visible}) AND instr(tr_fold(name||' '||contact||' '||phone),tr_fold(?))>0`,
        [q.search],
      );
    else if (q.page === 'expenses') total = count(`SELECT COUNT(*) n ${expenseBase}`, ea);
    else if (q.page === 'collections') total = count(`SELECT COUNT(*) n ${collectionWhere}`, ca);
    else if (q.page === 'finance')
      total = count(
        `SELECT COUNT(*) n ${cashJoin} WHERE COALESCE(e.occurred_at,c.created_at)>=? AND COALESCE(e.occurred_at,c.created_at)<?`,
        [r.from, r.to],
      );
    else if (['home', 'history', 'customers'].includes(q.page))
      total = count(`SELECT COUNT(*) n ${activityBase}`, aa);
    return {
      expenses,
      expenseTotal,
      fulfillmentProducts: all(
        `SELECT o.product,o.unit,SUM(o.remaining) quantity ${orderWhere} GROUP BY o.product_id,o.product,o.unit HAVING SUM(o.remaining)>0`,
        orderArgs,
      ),
      preorders: preorders.map((o) => ({
        ...o,
        corrected: !!db
          .prepare('SELECT 1 FROM corrections WHERE entity=? AND original_id=?')
          .get('preorder', o.id),
      })),
      preorderEvents: orderEvents,
      fulfillmentEventCount: preorders.length
        ? count(
            `SELECT COUNT(*) n FROM preorder_events WHERE order_id IN(${preorders.map(() => '?').join(',')})`,
            preorders.map((o) => o.id),
          )
        : 0,
      fulfillmentSummary: {
        reserved: count(
          'SELECT COALESCE(SUM(reserved),0) n FROM preorder_summary WHERE (? IS NULL OR customer_id=?)',
          [q.customerId || null, q.customerId || null],
        ),
        pending: count(
          'SELECT COUNT(*) n FROM preorder_summary WHERE remaining>0 AND (? IS NULL OR customer_id=?)',
          [q.customerId || null, q.customerId || null],
        ),
        debt:
          customers.find((c) => c.id === q.customerId)?.balance > 0
            ? customers.find((c) => c.id === q.customerId)!.balance
            : 0,
        available: Math.max(0, -(customers.find((c) => c.id === q.customerId)?.balance || 0)),
      },
      customerAdjustments: all(
        `SELECT a.*,p.name party,e.occurred_at,e.recorded_at FROM customer_adjustments a JOIN customers p ON p.id=a.customer_id JOIN event_meta e ON e.entity=a.kind AND e.entity_id=a.id WHERE (e.occurred_at>=? AND e.occurred_at<? ${q.customerId ? 'AND a.customer_id=?' : ''}) OR (a.kind=? AND a.id=?) ORDER BY (a.id=?) DESC,e.occurred_at DESC,a.id DESC LIMIT 100`,
        [
          r.from,
          r.to,
          ...(q.customerId ? [q.customerId] : []),
          q.focusEntity || '',
          q.focusId || 0,
          q.focusId || 0,
        ],
      ),
      products,
      customers,
      suppliers,
      sales: sales.rows.map((d) => ({
        ...d,
        status: db
          .prepare('SELECT 1 FROM corrections WHERE entity=? AND original_id=?')
          .get('sale', d.id)
          ? 'corrected'
          : d.status,
      })),
      purchases: purchases.rows.map((d) => ({
        ...d,
        status: db
          .prepare('SELECT 1 FROM corrections WHERE entity=? AND original_id=?')
          .get('purchase', d.id)
          ? 'corrected'
          : d.status,
      })),
      collections: collections.map((d) => ({
        ...d,
        status: db
          .prepare('SELECT 1 FROM corrections WHERE entity=? AND original_id=?')
          .get(d.kind, d.id)
          ? 'corrected'
          : d.status,
      })),
      activities,
      cash,
      movements,
      saleItems: effectiveItems(db, items('sale_items', sales.rows), 'sale'),
      purchaseItems: items('purchase_items', purchases.rows),
      supplierPayments: sp.map((d) => ({
        ...d,
        status: db
          .prepare('SELECT 1 FROM corrections WHERE entity=? AND original_id=?')
          .get(d.kind, d.id)
          ? 'corrected'
          : d.status,
      })),
      supplierReturns: sr,
      migrationReview: all('SELECT * FROM migration_review ORDER BY id LIMIT 50 OFFSET ?', [
        q.tab === 'migration' ? offset : 0,
      ]),
      backupHistory: all('SELECT * FROM backup_history ORDER BY id DESC LIMIT 10'),
      costRevisions: all(
        "SELECT * FROM cost_revisions WHERE json_extract(impact_json,'$.required')=1 ORDER BY id DESC LIMIT 50",
      ),
      settings,
      dbPath: file,
      counts: {
        customers: totals.customers,
        products: totals.products,
        stockProducts: totals.stockProducts,
        critical: totals.critical,
      },
      pagination: { offset, limit, total },
      summary: {
        ...balances,
        collected: totals.collected,
        revenue: totals.revenue,
        cogs: totals.cogs,
        profit: totals.revenue - totals.cogs,
        purchases: totals.purchases,
        expenses: totals.expenses,
        cash: totals.cash,
        stockValue: totals.stockValue,
      },
    };
  })();
}

const summaryCache = new WeakMap<Database.Database, { key: string; balances: any; totals: any }>();
function summary(db: Database.Database, cacheable: boolean) {
  const signature = db.prepare('SELECT total_changes() changes').get() as { changes: number };
  const key = signature.changes + ':' + db.pragma('data_version', { simple: true });
  const cached = cacheable ? summaryCache.get(db) : undefined;
  if (cached?.key === key) return cached;
  const balances = db
    .prepare(
      'SELECT COALESCE(SUM(CASE WHEN balance>0 THEN balance ELSE 0 END),0) debt,COALESCE(SUM(CASE WHEN balance<0 THEN -balance ELSE 0 END),0) credit FROM(SELECT SUM(amount) balance FROM customer_ledger GROUP BY customer_id)',
    )
    .get() as any;
  const totals = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM customers) customers,(SELECT COUNT(*) FROM products) products,(SELECT COUNT(*) FROM products WHERE stock>0) stockProducts,(SELECT COUNT(*) FROM products WHERE active=1 AND stock<=critical) critical,(SELECT COALESCE(SUM(total),0) FROM sales WHERE status='active') revenue,(SELECT COALESCE(-SUM(effective_cost),0) FROM effective_movements WHERE kind IN('sale','sale_cancel')) cogs,(SELECT COALESCE(SUM(amount),0) FROM collections WHERE status='active' AND kind='collection') collected,(SELECT COALESCE(SUM(total),0) FROM purchases WHERE status='active') purchases,(SELECT COALESCE(SUM(cost),0) FROM products) stockValue,(SELECT COALESCE(SUM(amount),0) FROM cash_transactions) cash,(SELECT COALESCE(-SUM(amount),0) FROM cash_transactions WHERE kind IN('expense','expense_cancel','expense_refund')) expenses`,
    )
    .get() as any;
  for (const value of [...Object.values(totals), ...Object.values(balances)])
    if (typeof value === 'number' && !Number.isSafeInteger(value))
      throw new Error('Toplam güvenli tam sayı sınırını aşıyor.');

  const value = { key, balances, totals };
  if (cacheable) summaryCache.set(db, value);
  return value;
}
