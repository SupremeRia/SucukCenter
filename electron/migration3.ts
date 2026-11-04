import type Database from 'better-sqlite3';
export function migration3(db: Database.Database) {
  db.exec(`
    ALTER TABLE products ADD COLUMN default_supplier_id INTEGER REFERENCES suppliers(id);
    CREATE TABLE event_meta(entity TEXT NOT NULL,entity_id INTEGER NOT NULL,occurred_at TEXT NOT NULL,recorded_at TEXT NOT NULL,reference TEXT NOT NULL DEFAULT '',free_reason TEXT NOT NULL DEFAULT '',PRIMARY KEY(entity,entity_id)) STRICT;
    CREATE INDEX event_occurred ON event_meta(occurred_at,entity,entity_id);
CREATE TABLE activity_meta(activity_id INTEGER PRIMARY KEY REFERENCES activity(id),occurred_at TEXT NOT NULL,recorded_at TEXT NOT NULL) STRICT;
INSERT INTO activity_meta SELECT id,created_at,created_at FROM activity;
    CREATE TABLE supplier_payments(id INTEGER PRIMARY KEY,supplier_id INTEGER NOT NULL REFERENCES suppliers(id),purchase_id INTEGER REFERENCES purchases(id),amount INTEGER NOT NULL CHECK(amount>0),method TEXT NOT NULL,note TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('supplier_payment','supplier_refund')),status TEXT NOT NULL DEFAULT 'active',legacy_cash_id INTEGER UNIQUE REFERENCES cash_transactions(id),created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))) STRICT;
    CREATE TABLE supplier_ledger(id INTEGER PRIMARY KEY,supplier_id INTEGER NOT NULL REFERENCES suppliers(id),amount INTEGER NOT NULL,kind TEXT NOT NULL,entity_id INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))) STRICT;
    CREATE INDEX supplier_balance ON supplier_ledger(supplier_id);
    CREATE TABLE supplier_returns(id INTEGER PRIMARY KEY,purchase_id INTEGER NOT NULL REFERENCES purchases(id),supplier_id INTEGER NOT NULL REFERENCES suppliers(id),total INTEGER NOT NULL,cost INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'active',note TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))) STRICT;
    CREATE TABLE supplier_return_items(id INTEGER PRIMARY KEY,document_id INTEGER NOT NULL REFERENCES supplier_returns(id),original_item_id INTEGER NOT NULL REFERENCES purchase_items(id),product_id INTEGER NOT NULL REFERENCES products(id),quantity INTEGER NOT NULL CHECK(quantity>0),price INTEGER NOT NULL,total INTEGER NOT NULL,cost INTEGER NOT NULL) STRICT;
    CREATE TABLE migration_review(id INTEGER PRIMARY KEY,entity TEXT NOT NULL,entity_id INTEGER NOT NULL,classification TEXT NOT NULL,explanation TEXT NOT NULL) STRICT;
    INSERT INTO supplier_ledger(supplier_id,amount,kind,entity_id,created_at) SELECT party_id,total,'purchase',id,created_at FROM purchases;
    INSERT INTO supplier_payments(supplier_id,purchase_id,amount,method,note,kind,legacy_cash_id,created_at) SELECT p.party_id,p.id,-c.amount,'Eski kayıt','Eski kasa kaydıyla doğrulanmış ödeme','supplier_payment',c.id,c.created_at FROM cash_transactions c JOIN purchases p ON p.id=c.entity_id WHERE c.kind='purchase' AND c.reverses_id IS NULL AND c.amount<0;
    INSERT INTO supplier_ledger(supplier_id,amount,kind,entity_id,created_at) SELECT supplier_id,-amount,kind,id,created_at FROM supplier_payments;
    INSERT INTO migration_review(entity,entity_id,classification,explanation) SELECT 'purchase',p.id,CASE WHEN EXISTS(SELECT 1 FROM cash_transactions c WHERE c.kind='purchase' AND c.entity_id=p.id) THEN 'cash_verified' ELSE 'no_payment_record' END,CASE WHEN EXISTS(SELECT 1 FROM cash_transactions c WHERE c.kind='purchase' AND c.entity_id=p.id) THEN 'Ödeme mevcut kasa kaydıyla doğrulandı; eski kayıtta ödeme yöntemi belirtilmemiştir.' ELSE 'Ödeme kasa kaydı yok; ödendiği varsayılmadı. Gerçekte yapılmış fakat kaydedilmemiş ödeme varsa belgeyle inceleyin.' END FROM purchases p;
    INSERT INTO migration_review(entity,entity_id,classification,explanation) SELECT 'purchase',document_id,'legacy_zero_price','Eski sıfır fiyatlı kalem korundu; gerekçe veya fiyat uydurulmadı.' FROM purchase_items WHERE price=0 GROUP BY document_id;
  `);
  const tables: Record<string, string> = {
    sale: 'sales',
    purchase: 'purchases',
    collection: 'collections',
    refund: 'collections',
    expense: 'cash_transactions',
    adjust: 'stock_movements',
    supplier_payment: 'supplier_payments',
  };
  for (const [entity, table] of Object.entries(tables)) {
    const clause =
      entity === 'collection' || entity === 'refund'
        ? `WHERE kind='${entity}'`
        : entity === 'expense'
          ? "WHERE kind='expense' AND reverses_id IS NULL"
          : entity === 'adjust'
            ? "WHERE kind='adjust'"
            : '';
    db.exec(
      `INSERT INTO event_meta(entity,entity_id,occurred_at,recorded_at) SELECT '${entity}',id,created_at,created_at FROM ${table} ${clause}`,
    );
  }
  for (const [entity, table] of [
    ['sale', 'sales'],
    ['collection', 'collections'],
    ['refund', 'collections'],
  ]) {
    const rows = db
      .prepare(
        `SELECT * FROM ${table} WHERE status='cancelled' ${table === 'collections' ? `AND kind='${entity}'` : ''}`,
      )
      .all() as any[];
    for (const row of rows) {
      const e = db
        .prepare(
          `SELECT created_at FROM activity WHERE entity=? AND entity_id=? AND description LIKE '%iptal%' ORDER BY id DESC LIMIT 1`,
        )
        .get(entity, row.id) as { created_at: string } | undefined;
      if (!e)
        throw new Error(
          `Geçiş incelemesi gerekli: ${entity} #${row.id} iptal tarihi belirlenemedi. Eski veri korunuyor.`,
        );
      db.prepare(
        'INSERT INTO event_meta(entity,entity_id,occurred_at,recorded_at) VALUES(?,?,?,?)',
      ).run(`${entity}_cancel`, row.id, e.created_at, e.created_at);
    }
  }
  for (const c of db
    .prepare("SELECT * FROM cash_transactions WHERE kind='expense_cancel'")
    .all() as any[])
    db.prepare(
      'INSERT INTO event_meta(entity,entity_id,occurred_at,recorded_at) VALUES(?,?,?,?)',
    ).run('expense_cancel', c.entity_id, c.created_at, c.created_at);
  for (const table of [
    'event_meta',
    'activity_meta',
    'supplier_ledger',
    'supplier_return_items',
    'migration_review',
  ])
    for (const action of ['UPDATE', 'DELETE'])
      db.exec(
        `CREATE TRIGGER immutable_${table}_${action} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'Geçmiş kayıtları değiştirilemez'); END;`,
      );
  for (const table of ['supplier_payments', 'supplier_returns'])
    db.exec(
      `CREATE TRIGGER no_delete_${table} BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Finansal kayıtlar silinemez'); END;`,
    );
}
