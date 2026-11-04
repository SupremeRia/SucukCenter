import { parentPort, workerData } from 'node:worker_threads';
import { Store } from './store';
import { AutomaticBackups } from './automatic-backups';
import { recordInfo } from './records';
import { view } from './view';
import { report, annualReport, statement, supplierStatement, customerCSV } from './reports';
import { recordSchema, viewSchema, rangeSchema } from '../shared/contracts';
import { z } from 'zod';
const lookupSchema = z
  .object({
    kind: z.enum(['products', 'customers', 'suppliers']),
    search: z.string().max(200),
    selected: z.number().int().positive().optional(),
  })
  .strict();
export function lookup(store: Store, input: unknown) {
  const q = lookupSchema.parse(input);
  const extra =
    q.kind === 'products'
      ? ",(SELECT i.price FROM purchase_items i JOIN purchases p ON p.id=i.document_id WHERE i.product_id=t.id AND p.status='active' ORDER BY i.id DESC LIMIT 1) last_purchase_price"
      : ',COALESCE((SELECT SUM(amount) FROM ' +
        (q.kind === 'customers'
          ? 'customer_ledger WHERE customer_id'
          : 'supplier_ledger WHERE supplier_id') +
        '=t.id),0) balance';
  return store.db
    .prepare(
      'SELECT t.*' +
        extra +
        ' FROM ' +
        q.kind +
        ' t WHERE (active=1 AND instr(tr_fold(' +
        (q.kind === 'products' ? "name||' ('||unit||')'" : 'name') +
        '),tr_fold(?))>0) OR id=? ORDER BY (id=?) DESC,tr_sort(name) LIMIT 50',
    )
    .all(q.search, q.selected || -1, q.selected || -1);
}
async function start() {
  const port = parentPort;
  if (!port) throw new Error('Veritabanı işçisi ayrı iş parçacığında başlatılmalı.');
  const store = await Store.openMigrating(workerData.file);
  const automatic = new AutomaticBackups(store);
  const tasks = {
    snapshot: (q: unknown) => view(store.db, store.file, viewSchema.parse(q || {})),
    record: (q: unknown) => recordInfo(store.db, recordSchema.parse(q)),
    lookup: (q: unknown) => lookup(store, q),
    report: (q: unknown) => report(store.db, rangeSchema.parse(q || {})),
    annual: (year: number) =>
      annualReport(store.db, z.number().int().min(1900).max(9998).parse(year)),
    statement: (q: { customerId: number; range: any; offset?: number; productOffset?: number }) =>
      statement(store.db, q.customerId, q.range, q.offset, 50, q.productOffset),
    supplierStatement: (q: { supplierId: number; range: any; offset?: number }) =>
      supplierStatement(store.db, q.supplierId, q.range, q.offset),
    customerCSV: (q: { customerId: number; range: any }) =>
      customerCSV(store.db, q.customerId, q.range),
    preview: (q: unknown) => store.preview(q),
    execute: (q: unknown, approval?: string) => store.execute(q, approval),
    autoBackup: (force = false) => automatic.run(force),
    backup: async (file: string) => {
      await store.backup(file);
      Store.validateBackup(file);
    },
    validateBackup: (file: string) => Store.validateBackup(file),
    restore: (file: string) => store.restore(file),
    close: () => store.close(),
  };
  // Serialize reads, writes, asynchronous backup and restore on one connection.
  // No timeout/automatic retry: a lost reply after a commit is an uncertain result.
  let queue = Promise.resolve();
  port.on('message', (message: { id: number; method: string; args: unknown[] }) => {
    queue = queue.then(async () => {
      try {
        if (!Object.hasOwn(tasks, message.method)) throw new Error('Geçersiz veritabanı işlemi.');
        const fn = tasks[message.method as keyof typeof tasks] as (...args: any[]) => unknown;
        const value = await fn(...message.args);
        port.postMessage({ id: message.id, value });
        if (message.method === 'close') port.close();
      } catch (error) {
        const e = error as Error & { code?: string };
        port.postMessage({
          id: message.id,
          error: { message: e.message, code: e.code, name: e.name },
        });
      }
    });
  });
  port.postMessage({ ready: true });
}
if (parentPort)
  start().catch((e) => {
    parentPort!.postMessage({ startupError: e instanceof Error ? e.message : String(e) });
    parentPort!.close();
  });
