// Read-only package structure check. Never launch a migration against real Documents.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const asar = await import('@electron/asar');
  const folder = path.resolve(
    process.env.SUCUKCENTER_REVIEW_PACKAGE || 'review-builds/final/win-unpacked',
  );
  const archive = path.join(folder, 'resources/app.asar');
  assert.ok(fs.existsSync(archive), 'Önce inceleme paketini oluşturun.');
  const pkg = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  assert.equal(pkg.version, JSON.parse(fs.readFileSync('package.json', 'utf8')).version);
  for (const file of [
    'dist-electron/electron/costing.js',
    'dist-electron/electron/reports.js',
    'dist-electron/electron/events.js',
    'dist-electron/electron/migration5.js',
    'dist-electron/electron/migration6.js',
    'dist-electron/electron/migration7.js',
    'dist-electron/electron/preorders.js',
    'dist-electron/electron/reconcile-preorders.js',
    'dist-electron/electron/store.js',
    'dist-electron/electron/main.js',
    'dist-electron/electron/database-service.js',
    'dist-electron/electron/database-worker.js',
    'dist-electron/electron/migrations.js',
    'dist-electron/electron/migration8.js',
    'dist-electron/electron/reconcile8.js',
    'dist-electron/shared/dates.js',
    'dist-electron/shared/contracts.js',
    'dist-electron/shared/profit.js',
    'dist-electron/shared/themes.js',
    'dist-electron/shared/alpha-mask.js',
    'dist-electron/electron/splash.js',
    'dist-electron/electron/splash-preload.js',
    'dist-electron/electron/records.js',
    'dist-electron/electron/view.js',
    'dist-electron/electron/reconcile3.js',
    'dist/index.html',
  ])
    assert.ok(
      asar.extractFile(archive, path.normalize(file)).equals(fs.readFileSync(file)),
      `Paket güncel derleme ile uyuşmalı: ${file}`,
    );
  const peIcons = require('./pe-icons.cjs')(path.join(folder, 'SucukCenter.exe'));
  const ico = fs.readFileSync('build/icon.ico');
  for (let i = 0; i < 7; i++) {
    const a = 6 + i * 16,
      start = ico.readUInt32LE(a + 12),
      length = ico.readUInt32LE(a + 8);
    assert.ok(
      peIcons.some((b) => b.equals(ico.subarray(start, start + length))),
      'Paket EXE ikon katmanı ' + i,
    );
  }
  for (const name of ['program.png', 'splash.png', 'program.ico', 'metadata.json'])
    assert.ok(
      asar
        .extractFile(archive, path.normalize('dist/brand/' + name))
        .equals(fs.readFileSync('public/brand/' + name)),
    );
  assert.equal(
    asar
      .listPackage(archive)
      .some((p) => /startup-main|splash-probe|app-icon.svg|symbol-light/.test(p)),
    false,
    'Test girişleri ve eski simgeler üretim paketine giremez',
  );
  assert.equal(pkg.main, 'dist-electron/electron/main.js');
  function verifyAssets(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) verifyAssets(file);
      else
        assert.ok(
          asar.extractFile(archive, path.normalize(file)).equals(fs.readFileSync(file)),
          `Paket varlığı güncel olmalı: ${file}`,
        );
    }
  }
  verifyAssets('dist');
  assert.ok(
    fs
      .readFileSync(path.join(folder, 'resources/icon.ico'))
      .equals(fs.readFileSync('build/icon.ico')),
    'Paketli Windows simgesi güncel olmalı',
  );
  assert.equal(
    asar.listPackage(archive).some((file) => file.includes('review-main')),
    false,
    'Üretim paketi test Documents yönlendirmesini içermemeli',
  );
  assert.ok(
    asar.extractFile(archive, path.normalize(pkg.main)).toString().includes('DatabaseService'),
  );
  assert.ok(
    asar
      .extractFile(archive, path.normalize('dist-electron/electron/database-worker.js'))
      .toString()
      .includes('openMigrating'),
  );
  assert.ok(fs.existsSync(path.join(folder, 'SucukCenter.exe')));
  console.log('PASS: İnceleme paketinin ASAR/ana süreç yapısı. Gerçek işletme verisi açılmadı.');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
