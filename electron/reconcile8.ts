import type Database from 'better-sqlite3';
import { basicCommandSchema } from '../shared/contracts';
export function reconcileCorrections(db: Database.Database, fail: (message: string) => never) {
  const tables: Record<string, string> = {
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
  for (const c of db.prepare('SELECT * FROM corrections').iterate() as Iterable<any>) {
    const table = tables[c.entity];
    if (
      !table ||
      c.entity !== c.replacement_entity ||
      c.original_id === c.replacement_id ||
      !c.reason.trim() ||
      Number.isNaN(Date.parse(c.recorded_at))
    )
      fail('düzeltme kimliği veya gerekçesi');
    for (const id of [c.original_id, c.replacement_id])
      if (!db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(id))
        fail('düzeltme belge bağlantısı');
    const old = basicCommandSchema.safeParse(JSON.parse(c.old_json)),
      next = basicCommandSchema.safeParse(JSON.parse(c.new_json));
    if (!old.success || !next.success || old.data.type !== c.entity || next.data.type !== c.entity)
      fail('düzeltme önceki/yeni değerleri');
    if (
      !db
        .prepare('SELECT 1 FROM event_meta WHERE entity=? AND entity_id=?')
        .get(c.reversal_entity, c.reversal_id)
    )
      fail('düzeltme ters kayıt bağlantısı');
    if (c.entity === 'preorder') {
      if (
        !db
          .prepare(
            "SELECT 1 FROM preorder_events WHERE id=? AND order_id=? AND kind='preorder_cancel'",
          )
          .get(c.reversal_id, c.original_id)
      )
        fail('düzeltme sipariş iptali');
    } else if (c.entity === 'preorder_delivery') {
      if (
        !db
          .prepare(
            "SELECT 1 FROM preorder_events WHERE id=? AND reverses_id=? AND kind='preorder_return'",
          )
          .get(c.reversal_id, c.original_id)
      )
        fail('düzeltme teslimat tersi');
    } else {
      if (c.reversal_entity !== c.entity + '_cancel' || c.reversal_id !== c.original_id)
        fail('düzeltme ters kayıt türü');
      if (
        c.entity !== 'expense' &&
        (db.prepare(`SELECT status FROM ${table} WHERE id=?`).get(c.original_id) as any).status !==
          'cancelled'
      )
        fail('düzeltme özgün kayıt durumu');
    }
  }
}
