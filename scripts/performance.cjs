const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { _electron } = require('playwright');
const root = mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-perf-'));
const electron = require('electron');
const worker = path.resolve('dist-electron/tests/performance.js');
let app;
function run(mode) {
  const result = spawnSync(electron, [worker, root, ...(mode ? [mode] : [])], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error('Performans işçisi başarısız.');
}
async function measure(auto) {
  const env = { ...process.env, SUCUKCENTER_TEST: '1', SUCUKCENTER_TEST_DOCUMENTS: root };
  delete env.ELECTRON_RUN_AS_NODE;
  const start = Date.now();
  app = await _electron.launch({
    executablePath: electron,
    args: [path.resolve('.')],
    env,
    timeout: 120000,
  });
  const page = await require('./electron-test-window.cjs').mainWindow(app);
  await page.getByRole('heading', { name: 'İşletme Özeti' }).waitFor({ timeout: 120000 });
  await page
    .getByText('Kayıtlar yükleniyor…', { exact: true })
    .waitFor({ state: 'hidden', timeout: 120000 });
  await page
    .getByText('Dönem raporu yükleniyor…', { exact: true })
    .waitFor({ state: 'hidden', timeout: 120000 });
  await page.waitForFunction(async () => {
    const r = await window.desktop.snapshot();
    return r.ok && r.data.counts.customers === 1000;
  });
  const ms = Date.now() - start;
  await page.screenshot({
    path: path.resolve(`artifacts/performance-ui-${auto ? 'auto' : 'manual'}.png`),
  });
  await app.close();
  app = null;
  return ms;
}
(async () => {
  run();
  const baseline = await measure(false);
  run('enable-auto');
  const withAuto = await measure(true);
  const data = JSON.parse(readFileSync('artifacts/performance.json', 'utf8'));
  data.electronWindowReadyMs = baseline;
  data.electronWindowWithVerifiedAutoBackupMs = withAuto;
  writeFileSync('artifacts/performance.json', JSON.stringify(data, null, 2));
  console.log('PASS: Ölçülmüş büyük veri seti ve gerçek Electron açılışı', JSON.stringify(data));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    const target = path.resolve(root);
    if (
      !target.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
      !path.basename(target).startsWith('sucukcenter-perf-')
    )
      throw new Error('Güvensiz test temizliği');
    rmSync(target, { recursive: true, force: true });
  });
