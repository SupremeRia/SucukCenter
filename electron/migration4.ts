import type Database from 'better-sqlite3';
export function migration4(db: Database.Database) {
  db.exec(`
 CREATE TABLE backup_history(id INTEGER PRIMARY KEY,file_name TEXT NOT NULL UNIQUE,status TEXT NOT NULL CHECK(status IN('creating','verified','failed','pruned')),created_at TEXT NOT NULL,error TEXT NOT NULL DEFAULT '') STRICT;
 INSERT INTO settings VALUES('autoBackup','true'),('backupRetention','7'),('autoBackupLastAt',''),('autoBackupLastError','');
 CREATE INDEX cash_kind_entity ON cash_transactions(kind,entity_id);
 CREATE INDEX stock_entity ON stock_movements(kind,entity_id,product_id);
 CREATE INDEX stock_product_sequence ON stock_movements(product_id,id DESC);
 CREATE INDEX ledger_event ON customer_ledger(kind,entity_id);
 CREATE INDEX supplier_ledger_event ON supplier_ledger(kind,entity_id);
 CREATE INDEX supplier_payments_party ON supplier_payments(supplier_id,id DESC);
 CREATE INDEX supplier_returns_purchase ON supplier_returns(purchase_id,id DESC);
 CREATE INDEX customer_sales ON sales(party_id,id DESC);
 CREATE INDEX supplier_purchases ON purchases(party_id,id DESC);
 CREATE INDEX collection_customer ON collections(customer_id,id DESC);
 CREATE INDEX activity_meta_date ON activity_meta(occurred_at,activity_id);
 CREATE INDEX purchase_product_last ON purchase_items(product_id,id DESC);
 CREATE INDEX return_original ON supplier_return_items(original_item_id,document_id);
`);
}
