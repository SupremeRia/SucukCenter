const { setTimeout, clearTimeout } = require('node:timers');
const { _electron } = require('playwright');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { spawn } = require('node:child_process');
const roots = [];
let app;
const outcomes = [];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (const preparation of [0, 8500]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-startup-'));
    roots.push(root);
    const env = {
      ...process.env,
      SUCUKCENTER_TEST: '1',
      SUCUKCENTER_TEST_DOCUMENTS: root,
      SC_TEST_UI_DELAY: String(preparation),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    fs.mkdirSync('artifacts/desktop/startup-video', { recursive: true });
    app = await _electron.launch({
      executablePath: require('electron'),
      args: [path.resolve('dist-electron/tests/startup-main.js')],
      env,
      recordVideo:
        preparation === 0
          ? { dir: 'artifacts/desktop/startup-video', size: { width: 600, height: 375 } }
          : undefined,
      timeout: 30000,
    });
    const splash =
      app.windows().find((p) => p.url().startsWith('data:')) || (await app.firstWindow());
    const video = splash.video();
    const page = await require('./electron-test-window.cjs').mainWindow(app);
    await page.getByRole('heading', { name: 'İşletme Özeti', exact: true }).waitFor();
    const mainPid = await app.evaluate(() => process.pid);
    const file = path.join(root, mainPid + '.json');
    console.log('startup fixture', mainPid, fs.readdirSync(root));
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(data.paintedAt >= data.splashShownAt);
    assert.ok(data.mainShownAt - data.paintedAt >= 7000, JSON.stringify(data));
    assert.ok(data.mainShownAt >= data.uiReadyAt);
    assert.ok(data.uiReadyAt - data.rendererReadyAt >= preparation);
    assert.equal(data.windows, 1);
    const counts = await app.evaluate(({ BrowserWindow, ipcMain }) => ({
      windows: BrowserWindow.getAllWindows().length,
      ready: ipcMain.listenerCount('sc:ui-ready'),
      shape: BrowserWindow.getAllWindows().map((w) => w.isVisible()),
    }));
    assert.equal(counts.windows, 1);
    assert.equal(counts.ready, 0);
    await (await app.browserWindow(page)).evaluate((w) => w.minimize());
    const second = spawn(
      require('electron'),
      [path.resolve('dist-electron/tests/startup-main.js')],
      { env, windowsHide: true, stdio: 'ignore' },
    );
    await new Promise((resolve, reject) => {
      second.once('close', resolve);
      second.once('error', reject);
    });
    await delay(150);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).secondInstances, 1);
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      1,
    );
    assert.equal(await (await app.browserWindow(page)).evaluate((w) => w.isMinimized()), false);
    outcomes.push({
      ...data,
      visibleDurationMs: data.mainShownAt - data.paintedAt,
      remainingWindows: counts.windows,
    });
    await app.close();
    app = null;
    if (video) {
      fs.mkdirSync('docs/media', { recursive: true });
      await video.saveAs('docs/media/splash.webm');
    }
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-startup-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'SucukCenter'));
  fs.writeFileSync(path.join(root, 'SucukCenter/sucukcenter.db'), 'sentetik bozuk DB');
  const env = {
    ...process.env,
    SUCUKCENTER_TEST: '1',
    SUCUKCENTER_TEST_DOCUMENTS: root,
    SC_TEST_EXPECT_FAILURE: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [path.resolve('dist-electron/tests/startup-main.js')], {
    env,
    windowsHide: true,
    stdio: 'ignore',
  });
  await new Promise((resolve, reject) => {
    child.once('close', resolve);
    child.once('error', reject);
  });
  const failed = JSON.parse(fs.readFileSync(path.join(root, child.pid + '.json'), 'utf8'));
  assert.ok(failed.error);
  assert.equal(failed.windows, 0);
  outcomes.push({ failureHandled: true });
  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-startup-'));
  roots.push(missingRoot);
  const copy = path.join(missingRoot, 'copy/dist-electron');
  fs.cpSync('dist-electron/electron', path.join(copy, 'electron'), { recursive: true });
  fs.cpSync('dist-electron/shared', path.join(copy, 'shared'), { recursive: true });
  fs.cpSync('node_modules/zod', path.join(missingRoot, 'copy/node_modules/zod'), {
    recursive: true,
  });
  const missingEnv = {
    ...env,
    SUCUKCENTER_TEST_DOCUMENTS: missingRoot,
    SC_TEST_MAIN: path.join(copy, 'electron/main.js'),
    NODE_PATH: path.resolve('node_modules'),
  };
  const missing = spawn(
    require('electron'),
    [path.resolve('dist-electron/tests/startup-main.js')],
    { env: missingEnv, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let missingDiagnostics = '';
  missing.stderr.on('data', (chunk) => {
    missingDiagnostics += String(chunk);
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      missing.kill();
      reject(new Error('Missing-logo fixture timed out: ' + missingDiagnostics));
    }, 15000);
    missing.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });
    missing.once('error', reject);
  });
  const missingData = JSON.parse(
    fs.readFileSync(path.join(missingRoot, missing.pid + '.json'), 'utf8'),
  );
  assert.match(missingData.error, /logo/);
  assert.equal(missingData.windows, 0);
  outcomes.push({ missingLogoHandled: true });
  fs.mkdirSync('artifacts/desktop', { recursive: true });
  fs.writeFileSync('artifacts/desktop/startup-results.json', JSON.stringify(outcomes, null, 2));
  console.log(
    'PASS startup 7 seconds from painted frame; 8.5s delayed renderer never revealed early; actual second process reuses main; no extra windows/readiness listeners; corrupt DB and missing logo errors exit; captured splash.webm. Native mouse-through not asserted.',
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    for (const root of roots) {
      assert.ok(
        path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
          path.basename(root).startsWith('sucukcenter-startup-'),
      );
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
