import type Database from 'better-sqlite3';
import { migration3 } from './migration3';
import { migration4 } from './migration4';
import { migration5 } from './migration5';
import { migration6 } from './migration6';
import { migration8 } from './migration8';
import { migration7 } from './migration7';
export const APPLICATION_ID = 0x53434354;
export const SCHEMA_VERSION = 11;
export const schema1 = `
CREATE TABLE products (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, unit TEXT NOT NULL CHECK(unit IN ('Kg','Litre','Adet')),
 price INTEGER NOT NULL CHECK(price BETWEEN 0 AND 1000000000000), critical INTEGER NOT NULL CHECK(critical BETWEEN 0 AND 1000000000000),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 stock INTEGER NOT NULL DEFAULT 0 CHECK(stock BETWEEN 0 AND 1000000000000),
 cost INTEGER NOT NULL DEFAULT 0 CHECK(cost BETWEEN 0 AND 1000000000000)
) STRICT;
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, address TEXT NOT NULL, contact TEXT NOT NULL, phone TEXT NOT NULL) STRICT;
CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, address TEXT NOT NULL, contact TEXT NOT NULL, phone TEXT NOT NULL) STRICT;
CREATE TABLE purchases (
 id INTEGER PRIMARY KEY, party_id INTEGER NOT NULL REFERENCES suppliers(id), total INTEGER NOT NULL CHECK(total>=0),
 cost INTEGER NOT NULL CHECK(cost>=0), status TEXT NOT NULL DEFAULT 'active', note TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE purchase_items (
 id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES purchases(id), product_id INTEGER NOT NULL REFERENCES products(id),
 product TEXT NOT NULL, unit TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), price INTEGER NOT NULL CHECK(price>=0),
 total INTEGER NOT NULL CHECK(total>=0), cost INTEGER NOT NULL CHECK(cost>=0)
) STRICT;
CREATE TABLE sales (
 id INTEGER PRIMARY KEY, party_id INTEGER NOT NULL REFERENCES customers(id), total INTEGER NOT NULL CHECK(total>=0),
 cost INTEGER NOT NULL CHECK(cost>=0), status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')), note TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE sale_items (
 id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES sales(id), product_id INTEGER NOT NULL REFERENCES products(id),
 product TEXT NOT NULL, unit TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), price INTEGER NOT NULL CHECK(price>=0),
 total INTEGER NOT NULL CHECK(total>=0), cost INTEGER NOT NULL CHECK(cost>=0)
) STRICT;
CREATE TABLE collections (
 id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), amount INTEGER NOT NULL CHECK(amount>0),
 method TEXT NOT NULL, note TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('collection','refund')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE customer_ledger (
 id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), amount INTEGER NOT NULL,
 kind TEXT NOT NULL, entity_id INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE stock_movements (
 id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, cost INTEGER NOT NULL,
 kind TEXT NOT NULL, entity_id INTEGER NOT NULL, note TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE cash_transactions (
 id INTEGER PRIMARY KEY, kind TEXT NOT NULL, entity_id INTEGER NOT NULL, amount INTEGER NOT NULL, note TEXT NOT NULL,
 reverses_id INTEGER UNIQUE REFERENCES cash_transactions(id),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE activity (
 id INTEGER PRIMARY KEY, entity TEXT NOT NULL, entity_id INTEGER NOT NULL, customer_id INTEGER REFERENCES customers(id), description TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
INSERT INTO settings VALUES ('theme','dark'),('company','SucukCenter');
CREATE INDEX ledger_customer ON customer_ledger(customer_id);
CREATE INDEX activity_date ON activity(created_at);
CREATE INDEX activity_customer ON activity(customer_id, created_at);
CREATE INDEX sale_document ON sale_items(document_id);
CREATE INDEX purchase_document ON purchase_items(document_id);
CREATE INDEX movement_product ON stock_movements(product_id);
`;
export function migrate(db: Database.Database, backedUp = false) {
  const version = db.pragma('user_version', { simple: true }) as number;
  const applicationId = db.pragma('application_id', { simple: true });
  if (
    (version > 0 && applicationId !== APPLICATION_ID) ||
    (version === 0 &&
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
        )
        .get())
  )
    throw new Error('Dosya bir SucukCenter veritabanı değil.');
  if (version > SCHEMA_VERSION)
    throw new Error('Veritabanı daha yeni bir uygulama sürümüne ait. Uygulamayı güncelleyin.');
  if (version > 0 && version < SCHEMA_VERSION && !backedUp)
    throw new Error('Şema geçişi için doğrulanmış geçiş yedeği gerekli.');
  db.transaction(() => {
    if (version < 1) {
      db.exec(schema1);
      for (const table of [
        'activity',
        'customer_ledger',
        'stock_movements',
        'cash_transactions',
        'sale_items',
        'purchase_items',
      ]) {
        for (const action of ['UPDATE', 'DELETE'])
          db.exec(
            `CREATE TRIGGER immutable_${table}_${action} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'Geçmiş kayıtları değiştirilemez'); END;`,
          );
      }
      for (const table of ['sales', 'purchases', 'collections'])
        db.exec(
          `CREATE TRIGGER no_delete_${table} BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Finansal kayıtlar silinemez'); END;`,
        );
      db.pragma(`application_id = ${APPLICATION_ID}`);
      db.pragma('user_version = 1');
    }
    if (version < 2) {
      db.exec(`CREATE TABLE operations(operation_id TEXT PRIMARY KEY,content_hash TEXT NOT NULL,request_json TEXT NOT NULL,result INTEGER NOT NULL,recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))) STRICT;
      CREATE TRIGGER immutable_operations_update BEFORE UPDATE ON operations BEGIN SELECT RAISE(ABORT,'İşlem anahtarları değiştirilemez'); END;
      CREATE TRIGGER immutable_operations_delete BEFORE DELETE ON operations BEGIN SELECT RAISE(ABORT,'İşlem anahtarları silinemez'); END;`);
      db.pragma('user_version = 2');
    }
    if (version < 3) {
      migration3(db);
      db.pragma('user_version=3');
    }
    if (version < 4) {
      migration4(db);
      db.pragma('user_version=4');
    }
    if (version < 5) {
      migration5(db);
      db.pragma('user_version=5');
    }
    if (version < 6) {
      db.exec(migration6);
      db.pragma('user_version = 6');
    }
    if (version < 7) {
      db.exec(migration7);
      for (const table of ['preorders', 'preorder_events', 'preorder_funding'])
        for (const action of ['UPDATE', 'DELETE'])
          db.exec(
            `CREATE TRIGGER immutable_${table}_${action} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'Sipariş geçmişi değiştirilemez; ters işlem kullanın'); END;`,
          );
      db.pragma('user_version=7');
    }
    if (version < 8) {
      migration8(db);
      db.pragma('user_version=8');
    }
    if (version < 9) {
      db.exec(`CREATE INDEX IF NOT EXISTS operations_result_date ON operations(result,recorded_at DESC);
      CREATE INDEX IF NOT EXISTS funding_allocation ON preorder_funding(allocation_id,event_id);
      CREATE INDEX IF NOT EXISTS corrections_replacement ON corrections(replacement_entity,replacement_id);`);
      db.pragma('user_version=9');
    }
    if (version < 10) {
      db.exec(`CREATE TABLE expense_details (
        cash_id INTEGER PRIMARY KEY REFERENCES cash_transactions(id),
        name TEXT NOT NULL CHECK(length(trim(name))>0 AND length(name)<=200),
        description TEXT NOT NULL,
        method TEXT CHECK(method IS NULL OR method IN('Nakit','Banka','Kart'))
      ) STRICT;
      INSERT INTO expense_details SELECT id,note,note,NULL FROM cash_transactions WHERE kind='expense';
      CREATE TRIGGER immutable_expense_details_update BEFORE UPDATE ON expense_details BEGIN SELECT RAISE(ABORT,'Gider geçmişi değiştirilemez'); END;
      CREATE TRIGGER immutable_expense_details_delete BEFORE DELETE ON expense_details BEGIN SELECT RAISE(ABORT,'Gider geçmişi silinemez'); END;
      CREATE INDEX IF NOT EXISTS cash_kind_id ON cash_transactions(kind,id);
      CREATE INDEX IF NOT EXISTS cash_entity_kind ON cash_transactions(entity_id,kind);`);
      db.pragma('user_version=10');
    }
    if (version < 11) {
      db.exec(
        "INSERT OR IGNORE INTO settings(key,value) SELECT 'appearance',CASE value WHEN 'light' THEN 'gray' ELSE 'classic' END FROM settings WHERE key='theme'",
      );
      db.pragma('user_version=11');
    }
  })();
}
