import type Database from 'better-sqlite3';
import { roundedRatio, MAX } from '../shared/contracts';
export function reconcilePreorders(db: Database.Database, fail: (s: string) => never) {
  const bad = (sql: string, message: string) => {
    if (db.prepare(sql).get()) fail(message);
  };
  bad(
    'SELECT id FROM preorder_summary WHERE remaining<0 OR delivered<0 OR cancelled<0 OR paid<0 OR reserved<0 OR reserved>paid OR paid>target OR recognized<0 OR recognized>target LIMIT 1',
    'sipariş miktar / ödeme bakiyesi',
  );
  for (const o of db.prepare('SELECT * FROM preorders').all() as any[]) {
    if (
      o.total !== roundedRatio(o.quantity, o.price, 1000) ||
      (o.unit === 'Adet' && o.quantity % 1000) ||
      (o.source === 'other' && (o.price !== 0 || o.total !== 0))
    )
      fail('sipariş sabit fiyatı / birimi');
    let delivered = 0,
      cancelled = 0,
      recognized = 0,
      target = o.total,
      paid = 0,
      reserved = 0;
    for (const e of db
      .prepare('SELECT * FROM preorder_events WHERE order_id=? ORDER BY id')
      .all(o.id) as any[]) {
      if (e.kind === 'preorder_delivery') {
        const remaining = o.quantity - delivered - cancelled;
        const expected =
          o.source === 'other'
            ? 0
            : e.quantity === remaining
              ? target - recognized
              : Math.min(
                  target - recognized,
                  Math.max(0, roundedRatio(delivered + e.quantity, o.price, 1000) - recognized),
                );
        if (
          e.quantity <= 0 ||
          e.quantity > remaining ||
          e.amount !== expected ||
          e.reserve_delta !== -Math.min(reserved, e.amount)
        )
          fail('sipariş teslim miktarı / tutarı');
        delivered += e.quantity;
        recognized += e.amount;
        if (o.source === 'prepaid') {
          const s = db.prepare('SELECT * FROM sales WHERE id=?').get(e.sale_id) as any;
          const returned = db
            .prepare("SELECT 1 FROM preorder_events WHERE kind='preorder_return' AND reverses_id=?")
            .get(e.id);
          if (
            !s ||
            s.party_id !== o.customer_id ||
            s.total !== e.amount ||
            (s.status === 'cancelled') !== !!returned
          )
            fail('teslimat / satış bağı');
        } else if (e.sale_id !== null) fail('diğer ürün borcu satış oluşturamaz');
      } else if (e.kind === 'preorder_return') {
        const original = db
          .prepare(
            "SELECT * FROM preorder_events WHERE id=? AND kind='preorder_delivery' AND order_id=?",
          )
          .get(e.reverses_id, o.id) as any;
        if (
          !original ||
          original.id >= e.id ||
          e.quantity !== original.quantity ||
          e.amount !== original.amount ||
          e.reserve_delta !== Math.max(0, paid - reserved - (recognized - e.amount))
        )
          fail('fiziksel iade ters kaydı');
        delivered -= e.quantity;
        recognized -= e.amount;
      } else if (e.kind === 'preorder_cancel') {
        const expected =
          o.source === 'other'
            ? 0
            : target -
              Math.max(
                recognized,
                roundedRatio(o.quantity - cancelled - e.quantity, o.price, 1000),
              );
        if (
          e.quantity <= 0 ||
          e.quantity > o.quantity - delivered - cancelled ||
          e.amount !== expected ||
          e.reserve_delta !== -Math.min(reserved, Math.max(0, paid - (target - expected)))
        )
          fail('teslim edilmemiş sipariş iptali');
        cancelled += e.quantity;
        target -= e.amount;
        paid += e.reserve_delta;
      } else if (e.kind === 'preorder_allocate') {
        if (
          o.source !== 'prepaid' ||
          e.amount <= 0 ||
          e.amount > target - paid ||
          e.reserve_delta !==
            e.amount - Math.min(e.amount, Math.max(0, recognized - (paid - reserved)))
        )
          fail('sipariş ödeme tahsisi');
        paid += e.amount;
        if (e.collection_id) {
          const c = db
            .prepare("SELECT * FROM collections WHERE id=? AND customer_id=? AND kind='collection'")
            .get(e.collection_id, o.customer_id);
          if (!c) fail('sipariş / tahsilat bağı');
        }
      } else if (e.kind === 'preorder_unallocate') {
        const original = db
          .prepare(
            "SELECT * FROM preorder_events WHERE id=? AND kind='preorder_allocate' AND order_id=?",
          )
          .get(e.reverses_id, o.id) as any;
        if (!original) fail('eksik ödeme tahsisi kaynağı');
        const before = db
          .prepare(
            'SELECT COALESCE(SUM(paid_delta),0) paid,COALESCE(SUM(reserve_delta),0) reserved FROM preorder_funding WHERE allocation_id=? AND event_id<?',
          )
          .get(original.id, e.id) as any;
        if (
          !original ||
          e.amount !== before.paid ||
          e.amount <= 0 ||
          e.reserve_delta !== -before.reserved
        )
          fail('ödeme tahsisi ters kaydı');
        paid -= e.amount;
      } else fail('bilinmeyen sipariş hareketi');
      reserved += e.reserve_delta;
      if (
        [delivered, cancelled, recognized, target, paid, reserved].some(
          (v) => !Number.isSafeInteger(v) || v < 0 || v > MAX,
        ) ||
        delivered + cancelled > o.quantity ||
        reserved > paid
      )
        fail('sipariş ara bakiyesi');
      if (o.source === 'other' && ['preorder_delivery', 'preorder_return'].includes(e.kind)) {
        const kind =
          e.kind === 'preorder_delivery' ? 'product_debt_delivery' : 'product_debt_return';
        const rows = db
          .prepare('SELECT * FROM stock_movements WHERE kind=? AND entity_id=?')
          .all(kind, e.id) as any[];
        if (
          rows.length !== 1 ||
          rows[0].product_id !== o.product_id ||
          rows[0].quantity !== e.quantity * (e.kind === 'preorder_return' ? 1 : -1)
        )
          fail('diğer ürün borcu stok bağlantısı');
      }
    }
  }
  bad(
    `SELECT e.id FROM preorder_events e LEFT JOIN (SELECT event_id,SUM(reserve_delta) reserve,SUM(paid_delta) paid FROM preorder_funding GROUP BY event_id) f ON f.event_id=e.id WHERE COALESCE(f.reserve,0)<>e.reserve_delta OR COALESCE(f.paid,0)<>CASE WHEN e.kind='preorder_allocate' THEN e.amount WHEN e.kind='preorder_unallocate' THEN -e.amount WHEN e.kind='preorder_cancel' THEN e.reserve_delta ELSE 0 END LIMIT 1`,
    'tahsis finansman toplamı',
  );
  bad(
    "SELECT f.event_id FROM preorder_funding f JOIN preorder_events e ON e.id=f.event_id JOIN preorder_events a ON a.id=f.allocation_id WHERE a.kind<>'preorder_allocate' OR a.order_id<>e.order_id OR a.id>e.id LIMIT 1",
    'tahsis kaynak bağlantısı',
  );
  bad(
    'WITH running AS(SELECT SUM(paid_delta) OVER(PARTITION BY allocation_id ORDER BY event_id ROWS UNBOUNDED PRECEDING) paid,SUM(reserve_delta) OVER(PARTITION BY allocation_id ORDER BY event_id ROWS UNBOUNDED PRECEDING) reserved FROM preorder_funding) SELECT 1 FROM running WHERE paid<0 OR reserved<0 OR reserved>paid LIMIT 1',
    'tahsis kaynağı tarihsel bakiyesi',
  );
  bad(
    'SELECT allocation_id FROM preorder_funding GROUP BY allocation_id HAVING SUM(paid_delta)<0 OR SUM(reserve_delta)<0 OR SUM(reserve_delta)>SUM(paid_delta) LIMIT 1',
    'tahsis kaynak bakiyesi',
  );
  bad(
    "SELECT c.id FROM collections c JOIN preorder_events a ON a.collection_id=c.id JOIN preorder_funding f ON f.allocation_id=a.id WHERE a.kind='preorder_allocate' GROUP BY c.id HAVING SUM(f.paid_delta)>c.amount OR (c.status='cancelled' AND SUM(f.paid_delta)>0) LIMIT 1",
    'aynı tahsilat iki kez tahsis edilmiş',
  );
}
