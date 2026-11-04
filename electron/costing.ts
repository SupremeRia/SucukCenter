import type Database from 'better-sqlite3';
import { MAX, roundedRatio, type Command, type CostImpact } from '../shared/contracts';
import { turkeyDay } from '../shared/dates';
import { canonical, contentHash } from './reconcile';
type Move = {
  id: number;
  product_id: number;
  quantity: number;
  cost: number;
  effective_cost: number;
  kind: string;
  entity_id: number;
  day: string;
};
const safe = (value: number) => {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX)
    throw new Error('Kronolojik stok / maliyet sınırı aşıldı.');
  return value;
};
export function affectedProducts(db: Database.Database, c: Command): number[] {
  if (c.type === 'preorder_delivery')
    return [
      (db.prepare('SELECT product_id FROM preorders WHERE id=?').get(c.orderId) as any)?.product_id,
    ].filter(Boolean);
  if (c.type === 'preorder_return')
    return [
      (
        db
          .prepare(
            'SELECT o.product_id FROM preorder_events e JOIN preorders o ON o.id=e.order_id WHERE e.id=?',
          )
          .get(c.deliveryId) as any
      )?.product_id,
    ].filter(Boolean);
  if (c.type === 'sale' || c.type === 'purchase')
    return [...new Set(c.lines.map((l) => l.productId))];
  if (c.type === 'adjust') return [c.productId];
  if (c.type === 'supplier_return')
    return [
      ...new Set(
        c.lines
          .map(
            (l) =>
              (db.prepare('SELECT product_id FROM purchase_items WHERE id=?').get(l.itemId) as any)
                ?.product_id,
          )
          .filter(Boolean),
      ),
    ];
  if (c.type === 'reverse' && ['sale', 'purchase', 'supplier_return'].includes(c.entity)) {
    const table = {
      sale: 'sale_items',
      purchase: 'purchase_items',
      supplier_return: 'supplier_return_items',
    }[c.entity as 'sale' | 'purchase' | 'supplier_return'];
    return (
      db.prepare(`SELECT DISTINCT product_id FROM ${table} WHERE document_id=?`).all(c.id) as any[]
    ).map((r) => r.product_id);
  }
  return [];
}
export function timeline(db: Database.Database, product: number, through?: string) {
  const rows = db
    .prepare(
      `SELECT m.*,d.occurred_on day FROM effective_movements m JOIN event_days d ON d.entity=m.kind AND d.entity_id=CASE WHEN m.kind='adjust' THEN m.id ELSE m.entity_id END WHERE m.product_id=? ${through ? 'AND d.occurred_on<=?' : ''} ORDER BY d.occurred_on,m.id`,
    )
    .all(...(through ? [product, through] : [product])) as Move[];
  let stock = 0,
    cost = 0;
  const values = new Map<number, number>();
  const originals = new Map<string, number[]>(),
    counters = new Map<string, number>();
  for (const m of rows) {
    let value: number;
    if (m.quantity < 0 && stock < -m.quantity) {
      const p = db.prepare('SELECT name,unit FROM products WHERE id=?').get(product) as any;
      throw new Error(
        `${p.name}: ${m.day.split('-').reverse().join('.')} tarihinde yetersiz tarihsel stok; eksik ${(-m.quantity - stock) / 1000} ${p.unit}. Önce bu tarihten önceki eksik stok girişini düzeltin. İşlemin tamamı geri alındı.`,
      );
    }
    if (m.kind === 'purchase') value = m.cost;
    else if (
      m.kind === 'sale_cancel' ||
      m.kind === 'supplier_return_cancel' ||
      m.kind === 'product_debt_return'
    ) {
      const key =
        m.kind === 'product_debt_return'
          ? 'product_debt_delivery|' +
            (
              db
                .prepare('SELECT reverses_id FROM preorder_events WHERE id=?')
                .get(m.entity_id) as any
            ).reverses_id
          : m.kind.replace('_cancel', '') + '|' + m.entity_id;
      const i = counters.get(key) || 0;
      const original = originals.get(key)?.[i];
      if (original === undefined)
        throw new Error(
          `${m.day}: iade/iptalin özgün stok hareketi daha sonraki tarihte veya eksik.`,
        );
      counters.set(key, i + 1);
      value = -original;
    } else if (m.quantity < 0) value = -roundedRatio(cost, -m.quantity, stock);
    else throw new Error('Desteklenmeyen kronolojik stok hareketi.');
    stock = safe(stock + m.quantity);
    cost = safe(cost + value);
    if (stock < 0 || cost < 0 || (stock === 0 && cost !== 0))
      throw new Error(`${m.day}: kronolojik stok maliyeti uzlaştırılamadı.`);
    values.set(m.id, value);
    if (['sale', 'supplier_return', 'product_debt_delivery'].includes(m.kind)) {
      const key = m.kind + '|' + m.entity_id;
      originals.set(key, [...(originals.get(key) || []), value]);
    }
  }
  return { stock, cost, rows, values };
}
export function stageProducts(db: Database.Database, products: number[], day: string) {
  const replay: number[] = [];
  for (const id of products) {
    const later = db
      .prepare(
        "SELECT 1 FROM event_days d INDEXED BY event_days_date WHERE d.occurred_on>? AND (EXISTS(SELECT 1 FROM stock_movements m WHERE m.kind=d.entity AND m.entity_id=d.entity_id AND m.product_id=? AND d.entity<>'adjust') OR (d.entity='adjust' AND EXISTS(SELECT 1 FROM stock_movements m WHERE m.id=d.entity_id AND m.kind='adjust' AND m.product_id=?))) LIMIT 1",
      )
      .get(day, id, id);
    if (!later) continue;
    replay.push(id);
    const t = timeline(db, id, day);
    db.prepare('UPDATE products SET stock=?,cost=? WHERE id=?').run(t.stock, t.cost, id);
  }
  return replay;
}
export function recost(
  db: Database.Database,
  products: number[],
  after: number,
  operationId: string,
  day: string,
  replay = products,
): Omit<CostImpact, 'token'> {
  const changes = new Map<string, CostImpact['changes'][number]>();
  const revisions: { movement: number; cost: number }[] = [];
  let changedMovements = 0;
  for (const product of replay) {
    const t = timeline(db, product);
    for (const m of t.rows) {
      const cost = t.values.get(m.id)!;
      if (cost === m.effective_cost) continue;
      revisions.push({ movement: m.id, cost });
      if (m.id <= after) {
        changedMovements++;
        const month = m.day.slice(0, 7),
          delta = cost - m.effective_cost;
        const group = changes.get(month) || { month, movements: 0, costDelta: 0, profitDelta: 0 };
        group.movements++;
        group.costDelta += delta;
        if (['sale', 'sale_cancel'].includes(m.kind)) group.profitDelta += delta;
        changes.set(month, group);
      }
    }
    db.prepare('UPDATE products SET stock=?,cost=? WHERE id=?').run(t.stock, t.cost, product);
  }
  const result = {
    required: changedMovements > 0,
    changes: [...changes.values()].sort((a, b) => a.month.localeCompare(b.month)),
    changedMovements,
    rule: 'İşlem günü, ardından değişmez stok hareketi sıra numarası. Aynı güne sonradan girilen işlem günün sonuna eklenir.',
  };
  if (products.length) {
    const revision = Number(
      db
        .prepare('INSERT INTO cost_revisions(operation_id,occurred_on,impact_json) VALUES(?,?,?)')
        .run(operationId, day, canonical(result)).lastInsertRowid,
    );
    for (const r of revisions)
      db.prepare(
        'INSERT INTO movement_cost_versions(revision_id,movement_id,cost) VALUES(?,?,?)',
      ).run(revision, r.movement, r.cost);
  }
  return result;
}
export function approvalToken(command: Command, impact: Omit<CostImpact, 'token'>, state: unknown) {
  return contentHash(canonical({ command, impact, state }));
}
export function effectiveDocuments(db: Database.Database, docs: any[], kind: string) {
  for (const d of docs) {
    d.original_cost = d.cost;
    d.cost =
      Number(
        (
          db
            .prepare(
              'SELECT COALESCE(SUM(effective_cost),0) n FROM effective_movements WHERE kind=? AND entity_id=?',
            )
            .get(kind, d.id) as any
        ).n,
      ) * (kind === 'purchase' ? 1 : -1);
  }
  return docs;
}
export function effectiveItems(db: Database.Database, items: any[], kind: string) {
  const counters = new Map<string, number>();
  for (const i of [...items].sort((a, b) => a.id - b.id)) {
    const key = i.document_id + '|' + i.product_id,
      index = counters.get(key) || 0;
    const m = db
      .prepare(
        'SELECT effective_cost FROM effective_movements WHERE kind=? AND entity_id=? AND product_id=? ORDER BY id LIMIT 1 OFFSET ?',
      )
      .get(kind, i.document_id, i.product_id, index) as any;
    i.original_cost = i.cost;
    if (m) i.cost = -m.effective_cost;
    counters.set(key, index + 1);
  }
  return items;
}
export function verifyCosts(db: Database.Database) {
  for (const p of db.prepare('SELECT id,stock,cost FROM products').iterate() as Iterable<any>) {
    const t = timeline(db, p.id);
    if (
      p.stock !== t.stock ||
      p.cost !== t.cost ||
      t.rows.some((m) => m.effective_cost !== t.values.get(m.id))
    )
      throw new Error('Yedek kronolojik maliyet sürümleri stokla uyuşmuyor.');
  }
  for (const e of db
    .prepare(
      'SELECT e.*,d.occurred_on FROM event_meta e LEFT JOIN event_days d ON d.entity=e.entity AND d.entity_id=e.entity_id',
    )
    .iterate() as Iterable<any>)
    if (e.occurred_on !== turkeyDay(e.occurred_at))
      throw new Error('Yedek işlem günü / zaman damgası uyuşmuyor.');
}
