import type Database from 'better-sqlite3';
import { turkeyDay, dayISO } from '../shared/dates';
export function occurred(c: { type?: string; occurredAt?: string; occurredOn?: string }) {
  const date = c.occurredOn ? dayISO(c.occurredOn) : c.occurredAt || new Date().toISOString();
  if (c.occurredOn && c.occurredAt && turkeyDay(c.occurredAt) !== c.occurredOn)
    throw new Error('İşlem günü ile zaman damgası uyuşmuyor.');
  if (turkeyDay(date) > turkeyDay()) throw new Error('Gelecek tarihli işlem kaydedilemez.');
  return new Date(date).toISOString();
}
export function stamp(
  db: Database.Database,
  entity: string,
  id: number,
  c: {
    type?: string;
    occurredAt?: string;
    occurredOn?: string;
    reference?: string;
    freeReason?: string;
  },
) {
  db.prepare(
    'INSERT INTO event_meta(entity,entity_id,occurred_at,recorded_at,reference,free_reason) VALUES(?,?,?,?,?,?)',
  ).run(entity, id, occurred(c), new Date().toISOString(), c.reference || '', c.freeReason || '');
  db.prepare('INSERT INTO event_days VALUES(?,?,?)').run(entity, id, turkeyDay(occurred(c)));
}
export function cancelDate(db: Database.Database, entity: string, id: number, date: string) {
  const row = db
    .prepare('SELECT occurred_at FROM event_meta WHERE entity=? AND entity_id=?')
    .get(entity, id) as { occurred_at: string } | undefined;
  if (row && turkeyDay(date) < turkeyDay(row.occurred_at))
    throw new Error('İptal tarihi asıl işlemden önce olamaz.');
}
