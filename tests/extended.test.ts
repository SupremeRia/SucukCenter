import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { Store } from '../electron/store';
import { decimalMoney } from '../shared/money';
import { AutomaticBackups } from '../electron/automatic-backups';
import { view } from '../electron/view';
import { viewSchema } from '../shared/contracts';
const root = mkdtempSync(path.join(tmpdir(), 'sucukcenter-extended-'));
const opened: Store[] = [];
export function setup(name: string) {
  const store = new Store(path.join(root, name, 'sucukcenter.db'));
  opened.push(store);
  const run = (c: any) => store.execute({ ...c, operationId: randomUUID() });
  const product = store.execute({
    type: 'product',
    name: 'Sentetik Sucuk',
    unit: 'Kg',
    price: 3500,
    critical: 0,
    active: true,
  });
  const supplier = store.execute({
    type: 'supplier',
    name: 'Sentetik Tedarikçi',
    address: '',
    contact: '',
    phone: '',
  });
  const customer = store.execute({
    type: 'customer',
    name: 'Sentetik Müşteri',
    address: '',
    contact: '',
    phone: '',
  });
  run({
    type: 'purchase',
    supplierId: supplier,
    lines: [{ productId: product, quantity: 10000, price: 2500 }],
    paid: false,
    note: '',
  });
  return { store, run, product, supplier, customer };
}
after(() => {
  for (const s of opened) if (s.db.open) s.close();
  const resolved = path.resolve(root);
  assert.ok(
    resolved.startsWith(path.resolve(tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith('sucukcenter-extended-'),
  );
  rmSync(resolved, { recursive: true, force: true });
});
test('otomatik yedek doğrulama, günlük atlama, saklama sınırı ve elle yedeği koruma', async () => {
  const x = setup('auto');
  x.store.db.prepare("UPDATE settings SET value='2' WHERE key='backupRetention'").run();
  let now = new Date('2026-10-01T12:00:00Z');
  const auto = new AutomaticBackups(x.store, () => now);
  const first = await auto.run();
  assert.ok(first);
  Store.validateBackup(first);
  assert.equal(await auto.run(), null);
  const manual = path.join(path.dirname(x.store.file), 'yedekler', 'elle-korunacak.db');
  await x.store.backup(manual);
  for (const day of [2, 3]) {
    now = new Date(`2026-10-0${day}T12:00:00Z`);
    await auto.run();
  }
  assert.equal(
    x.store.db.prepare("SELECT COUNT(*) n FROM backup_history WHERE status='verified'").get() &&
      (
        x.store.db
          .prepare("SELECT COUNT(*) n FROM backup_history WHERE status='verified'")
          .get() as any
      ).n,
    2,
  );
  assert.ok(existsSync(manual));
  assert.equal(
    readdirSync(path.dirname(manual)).filter((f) => f.startsWith('otomatik-') && f.endsWith('.db'))
      .length,
    2,
  );
});
test('başarısız otomatik yedek başarılı gösterilmez; son başarı zamanı korunur', async () => {
  const x = setup('auto-failure');
  const auto = new AutomaticBackups(x.store);
  await auto.run();
  const before = (
    x.store.db.prepare("SELECT value FROM settings WHERE key='autoBackupLastAt'").get() as any
  ).value;
  const backup = x.store.backup.bind(x.store);
  x.store.backup = async () => {
    throw Object.assign(new Error('Test ENOSPC: yedek diski dolu'), { code: 'ENOSPC' });
  };
  await assert.rejects(() => auto.run(true), /ENOSPC/);
  assert.equal(
    (x.store.db.prepare("SELECT value FROM settings WHERE key='autoBackupLastAt'").get() as any)
      .value,
    before,
  );
  assert.equal(
    (x.store.db.prepare('SELECT status FROM backup_history ORDER BY id DESC LIMIT 1').get() as any)
      .status,
    'failed',
  );
  x.store.backup = backup;
});
test('sayfalı SQL sorgusu, doğru toplam, sıfır dolgulu arama ve uzak belge odağı', () => {
  const x = setup('pages');
  for (let i = 0; i < 61; i++)
    x.store.execute({
      type: 'customer',
      name: `Sentetik ${String(i).padStart(3, '0')}`,
      address: '',
      contact: '',
      phone: '',
    });
  const first = view(x.store.db, x.store.file, viewSchema.parse({ page: 'customers' }));
  const second = view(
    x.store.db,
    x.store.file,
    viewSchema.parse({ page: 'customers', offset: 50 }),
  );
  assert.equal(first.customers.length, 50);
  assert.equal(second.customers.length, 12);
  assert.equal(first.pagination?.total, 62);
  assert.equal(first.counts?.customers, 62);
  x.run({
    type: 'sale',
    customerId: x.customer,
    lines: [{ productId: x.product, quantity: 1000, price: 3500 }],
    note: '',
  });
  const sale = view(
    x.store.db,
    x.store.file,
    viewSchema.parse({ page: 'sales', search: '#S-0001' }),
  );
  assert.equal(sale.sales.length, 1);
  assert.equal(sale.saleItems.length, 1);
  const focused = view(
    x.store.db,
    x.store.file,
    viewSchema.parse({
      page: 'history',
      range: { start: '2000-01-01', end: '2000-01-01' },
      focusEntity: 'sale',
      focusId: 1,
    }),
  );
  assert.equal(focused.sales.length, 1);
  assert.equal(focused.activities.length, 0);
});
test('gerçek SQLite SQLITE_FULL: disk kotasında bütün satış geri alınır', () => {
  const x = setup('full');
  x.store.db.exec(
    'CREATE TABLE pressure(payload BLOB); CREATE TRIGGER full_sale BEFORE INSERT ON sales BEGIN INSERT INTO pressure VALUES(zeroblob(1048576)); END;',
  );
  const pages = x.store.db.pragma('page_count', { simple: true }) as number;
  x.store.db.pragma(`max_page_count=${pages + 2}`);
  const before = x.store.snapshot();
  assert.throws(
    () =>
      x.run({
        type: 'sale',
        customerId: x.customer,
        lines: [{ productId: x.product, quantity: 1000, price: 3500 }],
        note: '',
      }),
    (e: any) => e.code === 'SQLITE_FULL',
  );
  assert.deepEqual(x.store.snapshot(), before);
  assert.equal((x.store.db.prepare('SELECT COUNT(*) n FROM pressure').get() as any).n, 0);
});
test('gerçek SQLite yazıcı kilidi: BUSY ve atomik koruma', () => {
  const x = setup('busy');
  const lock = new Database(x.store.file);
  lock.exec('BEGIN IMMEDIATE');
  x.store.db.pragma('busy_timeout=30');
  try {
    assert.throws(
      () => x.run({ type: 'expense', amount: 100, note: 'Yazılamaz' }),
      (e: any) => e.code === 'SQLITE_BUSY',
    );
  } finally {
    lock.exec('ROLLBACK');
    lock.close();
  }
  assert.equal(x.store.snapshot().cash.length, 0);
});
test('gerçek salt okunur SQLite bağlantısında yazma reddi', () => {
  const x = setup('readonly');
  x.store.close();
  x.store.db = new Database(x.store.file, { readonly: true });
  try {
    assert.throws(
      () => x.run({ type: 'expense', amount: 100, note: 'Yazılamaz' }),
      (e: any) => e.code === 'SQLITE_READONLY',
    );
  } finally {
    x.store.db.close();
  }
});
test(
  'Windows NTFS dosya yazma izni reddi; izinler mutlaka geri alınır',
  { skip: process.platform !== 'win32' },
  () => {
    const x = setup('acl');
    const file = x.store.file;
    assert.ok(path.resolve(file).startsWith(path.resolve(root) + path.sep));
    x.store.close();
    const who = spawnSync('whoami.exe', [], { encoding: 'utf8', windowsHide: true });
    assert.equal(who.status, 0);
    const identity = who.stdout.trim();
    let protectedStore: Store | undefined;
    try {
      const deny = spawnSync('icacls.exe', [file, '/deny', identity + ':(WD,AD,WEA,WA)'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      assert.equal(deny.status, 0, deny.stderr);
      assert.throws(() => {
        protectedStore = new Store(file);
        protectedStore.execute({
          type: 'expense',
          operationId: randomUUID(),
          amount: 100,
          note: 'İzin testi',
        });
      });
    } finally {
      if (protectedStore?.db.open) protectedStore.db.close();
      const reset = spawnSync('icacls.exe', [file, '/remove:d', identity], {
        encoding: 'utf8',
        windowsHide: true,
      });
      assert.equal(reset.status, 0, reset.stderr);
    }
    const check = new Store(file);
    opened.push(check);
    assert.equal(check.snapshot().cash.length, 0);
  },
);
test(
  'Windows FileShare.None kilidindeki yedek hedefi reddedilir',
  { skip: process.platform !== 'win32' },
  async () => {
    const x = setup('os-lock');
    const target = path.join(root, 'locked-target.db');
    writeFileSync(target, '');
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "$stream=[System.IO.File]::Open($env:SUCUKCENTER_LOCK_TARGET,[System.IO.FileMode]::Open,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None);[Console]::WriteLine('locked');[Console]::ReadLine() | Out-Null;$stream.Dispose()",
      ],
      {
        env: { ...process.env, SUCUKCENTER_LOCK_TARGET: target },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Dosya kilidi oluşturulamadı')), 8000);
        child.stdout.on('data', (chunk) => {
          if (String(chunk).includes('locked')) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.on('error', reject);
      });
      await assert.rejects(() => x.store.backup(target));
    } finally {
      child.stdin.end('\n');
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        setTimeout(() => {
          child.kill();
          resolve();
        }, 2000).unref();
      });
    }
  },
);
test('geri yükleme sırasında süreç kesilir; sonraki açılış özgün kaydı kurtarır', async () => {
  const x = setup('crash');
  x.run({
    type: 'sale',
    customerId: x.customer,
    lines: [{ productId: x.product, quantity: 1000, price: 3500 }],
    note: '',
  });
  const source = path.join(root, 'crash-source.db');
  await x.store.backup(source);
  x.run({ type: 'collection', customerId: x.customer, amount: 1000, method: 'Nakit', note: '' });
  x.store.close();
  const script = `const fs=require('node:fs');const {Store}=require(process.argv[1]);const file=process.argv[2];const s=new Store(file);const rename=fs.renameSync;fs.renameSync=(from,to)=>{rename(from,to);if(from===file&&to===file+'.before-restore')process.exit(91);};s.restore(process.argv[3]).catch(e=>{console.error(e);process.exit(1);});`;
  const child = spawnSync(
    process.execPath,
    ['-e', script, path.resolve('dist-electron/electron/store.js'), x.store.file, source],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(child.status, 91, child.stderr);
  const recovered = new Store(x.store.file);
  opened.push(recovered);
  assert.equal(recovered.balance(x.customer), 2500);
});

test('tedarikçi ödeme aktivitesi başarısızsa kasa, cari, zaman ve işlem anahtarı tamamen geri alınır', () => {
  const x = setup('payment-atomic');
  const before = x.store.snapshot();
  const n = (table: string) =>
    (x.store.db.prepare('SELECT COUNT(*) n FROM ' + table).get() as any).n;
  const meta = n('event_meta');
  const ops = n('operations');
  x.store.db.exec(
    "CREATE TRIGGER reject_payment_activity BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT,'forced payment activity failure'); END;",
  );
  assert.throws(
    () =>
      x.run({
        type: 'supplier_payment',
        supplierId: x.supplier,
        amount: 100,
        method: 'Banka',
        note: 'Test',
      }),
    /forced payment/,
  );
  assert.deepEqual(x.store.snapshot(), before);
  assert.equal(n('event_meta'), meta);
  assert.equal(n('operations'), ops);
});
test('başarısız v3-v4 geçişi: kısmi DDL geri alınır, kaynak ve doğrulanmış yedek korunur', async () => {
  const x = setup('migration-rollback');
  x.store.db.exec(
    "DROP TABLE backup_history;DELETE FROM settings WHERE key IN('autoBackup','backupRetention','autoBackupLastAt','autoBackupLastError');PRAGMA user_version=3;",
  );
  x.store.close();
  await assert.rejects(() => Store.openMigrating(x.store.file), /already exists/);
  const check = new Database(x.store.file, { readonly: true });
  try {
    assert.equal(check.pragma('user_version', { simple: true }), 3);
    assert.equal(
      (check.prepare('SELECT stock FROM products WHERE id=1').get() as any).stock,
      10000,
    );
    assert.equal(
      check.prepare("SELECT 1 FROM sqlite_master WHERE name='backup_history'").get(),
      undefined,
    );
    assert.equal(
      check.prepare("SELECT value FROM settings WHERE key='autoBackup'").get(),
      undefined,
    );
  } finally {
    check.close();
  }
  const folder = path.join(path.dirname(x.store.file), 'yedekler');
  const backups = readdirSync(folder).filter((f) => f.startsWith('gecis-') && f.endsWith('.db'));
  assert.equal(backups.length, 1);
  Store.validateBackup(path.join(folder, backups[0]));
});

test('çok parçalı tedarikçi iadesinde son kalem kuruş farkını kapatır', () => {
  const x = setup('return-rounding');
  const id = x.run({
    type: 'purchase',
    supplierId: x.supplier,
    lines: [{ productId: x.product, quantity: 1000, price: 100 }],
    paid: false,
    note: '',
  });
  const item = x.store.snapshot().purchaseItems.find((i) => i.document_id === id)!;
  x.store.db.transaction(() => {
    for (let i = 0; i < 250; i++)
      x.run({
        type: 'supplier_return',
        purchaseId: id,
        lines: [{ itemId: item.id, quantity: 4 }],
        note: 'Kesirli iade testi',
      });
  })();
  assert.equal(
    (
      x.store.db
        .prepare('SELECT SUM(total) n FROM supplier_returns WHERE purchase_id=?')
        .get(id) as any
    ).n,
    100,
  );
});

test('kasa ters kaydında asıl işlem sayfa dışında da detay bağlantısı taşınır', () => {
  const x = setup('cash-focus');
  const original = x.run({ type: 'expense', amount: 100, note: 'Eski gider' });
  for (let i = 0; i < 52; i++) x.run({ type: 'expense', amount: 100, note: 'Yeni gider' });
  x.run({ type: 'reverse', entity: 'expense', id: original, reason: 'Eski gider iptal' });
  const page = view(x.store.db, x.store.file, viewSchema.parse({ page: 'finance' }));
  const reversed = page.cash.find((c) => c.reverses_id === original)!;
  assert.equal(reversed.source_kind, 'expense');
  assert.equal(reversed.source_id, original);
  assert.equal(
    page.cash.some((c) => c.id === original),
    false,
  );
});

test('büyük parasal toplamda gösterim ve CSV kuruşu kayan noktaya bölmeden korunur', () => {
  assert.equal(decimalMoney(Number.MAX_SAFE_INTEGER), '90071992547409,91');
  assert.equal(decimalMoney(-123), '-1,23');
  assert.throws(() => decimalMoney(Number.MAX_SAFE_INTEGER + 1));
});
