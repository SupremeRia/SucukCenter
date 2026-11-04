import type Database from 'better-sqlite3';
export function migration8(db: Database.Database) {
  db.exec(`ALTER TABLE customers ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1));
 ALTER TABLE suppliers ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1));
 CREATE TABLE deleted_records(entity TEXT NOT NULL,entity_id INTEGER NOT NULL,name TEXT NOT NULL,PRIMARY KEY(entity,entity_id)) STRICT;
 CREATE TABLE corrections(id INTEGER PRIMARY KEY,entity TEXT NOT NULL,original_id INTEGER NOT NULL,replacement_entity TEXT NOT NULL,replacement_id INTEGER NOT NULL,reversal_entity TEXT NOT NULL,reversal_id INTEGER NOT NULL,reason TEXT NOT NULL,old_json TEXT NOT NULL,new_json TEXT NOT NULL,recorded_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(entity,original_id)) STRICT;`);
  // Audit rows keep their original numeric reference and name in description, even after an unused card is deleted.
  // Rebuild both audit tables together; all existing rows, timestamps, indexes and immutable triggers survive.
  const schemas = db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN('activity','activity_meta')",
    )
    .all() as { name: string; sql: string }[];
  const objects = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE tbl_name IN('activity','activity_meta') AND type IN('index','trigger') AND sql IS NOT NULL",
    )
    .all() as { sql: string }[];
  db.exec(
    `CREATE TEMP TABLE audit_rows AS SELECT * FROM activity; CREATE TEMP TABLE audit_dates AS SELECT * FROM activity_meta; DROP TABLE activity_meta; DROP TABLE activity;`,
  );
  for (const name of ['activity', 'activity_meta'])
    db.exec(schemas.find((s) => s.name === name)!.sql.replace('REFERENCES customers(id)', ''));
  db.exec(
    `INSERT INTO activity SELECT * FROM audit_rows; INSERT INTO activity_meta SELECT * FROM audit_dates; DROP TABLE audit_rows; DROP TABLE audit_dates;`,
  );
  for (const o of objects) db.exec(o.sql);
  for (const action of ['UPDATE', 'DELETE'])
    for (const table of ['deleted_records', 'corrections'])
      db.exec(
        `CREATE TRIGGER immutable_${table}_${action} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'Gecmis degistirilemez'); END;`,
      );
}
