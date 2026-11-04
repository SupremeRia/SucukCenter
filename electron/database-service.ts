import { Worker } from 'node:worker_threads';
import path from 'node:path';
export type DatabaseMethod =
  | 'snapshot'
  | 'record'
  | 'lookup'
  | 'report'
  | 'annual'
  | 'statement'
  | 'supplierStatement'
  | 'customerCSV'
  | 'preview'
  | 'execute'
  | 'autoBackup'
  | 'backup'
  | 'validateBackup'
  | 'restore'
  | 'close';
export class DatabaseService {
  private worker: Worker;
  private sequence = 0;
  private pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  private fault: Error | null = null;
  private stopped = false;
  private closing = false;
  private closePromise?: Promise<void>;
  readonly ready: Promise<void>;
  constructor(readonly file: string) {
    this.worker = new Worker(path.join(__dirname, 'database-worker.js'), { workerData: { file } });
    this.ready = new Promise<void>((resolve, reject) => {
      this.worker.on('message', (message) => {
        if (message.ready) {
          resolve();
          return;
        }
        if (message.startupError) {
          this.fail(new Error(message.startupError));
          reject(this.fault!);
          return;
        }
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        if (message.error)
          request.reject(
            Object.assign(new Error(message.error.message), {
              code: message.error.code,
              name: message.error.name,
            }),
          );
        else request.resolve(message.value);
      });
      this.worker.on('error', (error) => {
        this.fail(error);
        reject(error);
      });
      this.worker.on('exit', (code) => {
        if (!this.stopped) {
          const e = new Error(
            'Veritabanı işçisi beklenmedik biçimde kapandı (' +
              code +
              '). Son işlemin sonucunu yeniden açılışta kontrol edin; otomatik tekrar yapılmadı.',
          );
          this.fail(e);
          reject(e);
        }
      });
    });
  }
  get failed() {
    return this.fault !== null;
  }
  private fail(error: Error) {
    this.fault = error;
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
  async call<T = any>(method: DatabaseMethod, ...args: unknown[]): Promise<T> {
    if (this.stopped || (this.closing && method !== 'close'))
      throw new Error('Veritabanı kapatılıyor.');
    await this.ready;
    if (this.fault) throw this.fault;
    if (this.stopped) throw new Error('Veritabanı kapatılıyor.');
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ id, method, args });
      } catch (error) {
        this.pending.delete(id);
        reject(error as Error);
      }
    });
  }
  async close() {
    if (this.stopped) return;
    if (this.closePromise) return this.closePromise;
    if (this.fault) {
      this.stopped = true;
      return;
    }
    this.closing = true;
    this.closePromise = this.call('close')
      .then(() => {
        this.stopped = true;
      })
      .catch((error) => {
        this.closing = false;
        this.closePromise = undefined;
        throw error;
      });
    return this.closePromise;
  }
}
