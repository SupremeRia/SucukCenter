import type Database from 'better-sqlite3';
import { turkeyDay } from '../shared/dates';
export function migration5(db: Database.Database) {
  db.exec(`
    CREATE TABLE event_days(entity TEXT NOT NULL,entity_id INTEGER NOT NULL,occurred_on TEXT NOT NULL,PRIMARY KEY(entity,entity_id),FOREIGN KEY(entity,entity_id) REFERENCES event_meta(entity,entity_id)) STRICT;
    CREATE TABLE cost_revisions(id INTEGER PRIMARY KEY,operation_id TEXT NOT NULL UNIQUE,occurred_on TEXT NOT NULL,impact_json TEXT NOT NULL,recorded_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))) STRICT;
    CREATE TABLE movement_cost_versions(id INTEGER PRIMARY KEY,revision_id INTEGER NOT NULL REFERENCES cost_revisions(id),movement_id INTEGER NOT NULL REFERENCES stock_movements(id),cost INTEGER NOT NULL,UNIQUE(revision_id,movement_id)) STRICT;
    CREATE INDEX cost_movement_latest ON movement_cost_versions(movement_id,id DESC);
    CREATE INDEX event_days_date ON event_days(occurred_on,entity,entity_id);
    CREATE VIEW effective_movements AS SELECT m.*,COALESCE((SELECT v.cost FROM movement_cost_versions v WHERE v.movement_id=m.id ORDER BY v.id DESC LIMIT 1),m.cost) effective_cost FROM stock_movements m;
  `);
  const insert = db.prepare('INSERT INTO event_days VALUES(?,?,?)');
  for (const row of db
    .prepare('SELECT entity,entity_id,occurred_at FROM event_meta')
    .all() as any[])
    insert.run(row.entity, row.entity_id, turkeyDay(row.occurred_at));
  for (const table of ['event_days', 'cost_revisions', 'movement_cost_versions'])
    for (const action of ['UPDATE', 'DELETE'])
      db.exec(
        `CREATE TRIGGER immutable_${table}_${action} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'Maliyet ve tarih geçmişi değiştirilemez'); END;`,
      );
}
