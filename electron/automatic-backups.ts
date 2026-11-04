import Database from 'better-sqlite3';
import { mkdirSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { turkeyDay } from '../shared/dates';
import { Store } from './store';
export class AutomaticBackups {
  private running = false;
  constructor(
    private store: Store,
    private now: () => Date = () => new Date(),
  ) {}
  private setting(key: string) {
    return (
      (
        this.store.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as {
          value: string;
        }
      )?.value || ''
    );
  }
  private set(key: string, value: string) {
    this.store.db.prepare('UPDATE settings SET value=? WHERE key=?').run(value, key);
  }
  async run(force = false): Promise<string | null> {
    if (this.running) throw new Error('Otomatik yedekleme zaten sürüyor.');
    const current = this.now().toISOString();
    if (
      !force &&
      (this.setting('autoBackup') !== 'true' ||
        (this.setting('autoBackupLastAt') &&
          turkeyDay(this.setting('autoBackupLastAt')) === turkeyDay(current)))
    )
      return null;
    this.running = true;
    const folder = path.join(path.dirname(this.store.file), 'yedekler');
    const name = `otomatik-${turkeyDay(current)}-${randomUUID()}.db`;
    const destination = path.join(folder, name);
    let historyId: number | undefined;
    try {
      mkdirSync(folder, { recursive: true });
      this.store.db
        .prepare(
          "UPDATE backup_history SET status='failed',error='Önceki yedekleme sonucu bu anlık görüntüde doğrulanmamış; başarı varsayılmadı.' WHERE status='creating'",
        )
        .run();
      historyId = Number(
        this.store.db
          .prepare("INSERT INTO backup_history(file_name,status,created_at) VALUES(?,'creating',?)")
          .run(name, current).lastInsertRowid,
      );
      await this.store.backup(destination);
      Store.validateBackup(destination);
      this.store.db.transaction(() => {
        this.store.db
          .prepare("UPDATE backup_history SET status='verified' WHERE id=?")
          .run(historyId);
        this.set('autoBackupLastAt', current);
        this.set('autoBackupLastError', '');
      })();
      const recoveryWarnings: string[] = [];
      for (const fileName of readdirSync(folder)) {
        if (
          !/^otomatik-\d{4}-\d{2}-\d{2}-[0-9a-f-]+\.db$/.test(fileName) ||
          this.store.db.prepare('SELECT 1 FROM backup_history WHERE file_name=?').get(fileName)
        )
          continue;
        const orphan = path.join(folder, fileName);
        try {
          Store.validateBackup(orphan);
          this.store.db
            .prepare(
              "INSERT INTO backup_history(file_name,status,created_at) VALUES(?,'verified',?)",
            )
            .run(fileName, statSync(orphan).mtime.toISOString());
        } catch {
          recoveryWarnings.push('Kayıt dışı eski otomatik yedek doğrulanamadı; silinmedi.');
        }
      }
      const configuredRetention = Number(this.setting('backupRetention'));
      const retention = Math.max(
        1,
        Math.min(30, Number.isSafeInteger(configuredRetention) ? configuredRetention : 7),
      );
      const expired = this.store.db
        .prepare(
          "SELECT * FROM backup_history WHERE status='verified' ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET ?",
        )
        .all(retention) as { id: number; file_name: string }[];
      const warnings: string[] = [...recoveryWarnings];
      for (const row of expired) {
        if (
          !/^otomatik-\d{4}-\d{2}-\d{2}-[0-9a-f-]+\.db$/.test(row.file_name) ||
          path.basename(row.file_name) !== row.file_name
        ) {
          warnings.push('Geçersiz yedek adı nedeniyle eski kayıt silinmedi.');
          continue;
        }
        const target = path.resolve(folder, row.file_name);
        if (path.dirname(target) !== path.resolve(folder))
          throw new Error('Yedek saklama yolu geçersiz.');
        try {
          if (existsSync(target)) {
            const old = new Database(target, { fileMustExist: true, timeout: 100 });
            try {
              const check = old.pragma('wal_checkpoint(TRUNCATE)') as { busy: number }[];
              if (check[0]?.busy) throw new Error('Eski yedek başka programda açık.');
            } finally {
              old.close();
            }
            rmSync(target);
          }
          this.store.db.prepare("UPDATE backup_history SET status='pruned' WHERE id=?").run(row.id);
        } catch {
          warnings.push('Kullanımdaki eski yedek silinemedi; saklama sınırı geçici olarak aşıldı.');
        }
      }
      if (warnings.length) this.set('autoBackupLastError', [...new Set(warnings)].join(' '));
      return destination;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        if (historyId)
          this.store.db
            .prepare("UPDATE backup_history SET status='failed',error=? WHERE id=?")
            .run(message, historyId);
        this.set('autoBackupLastError', message);
      } catch {
        /* Disk failure must not be turned into a success indication. */
      }
      throw error;
    } finally {
      this.running = false;
    }
  }
}
