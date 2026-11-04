// Read-only Windows shell screenshots of the isolated review package. Never launch the installed business app.
const { _electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sucukcenter-review-'));
const output = path.resolve('artifacts/redesign');
fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, SUCUKCENTER_REVIEW_ROOT: root };
delete env.ELECTRON_RUN_AS_NODE;
let app;
(async () => {
  app = await _electron.launch({
    executablePath: path.resolve('review-builds/runtime-test/win-unpacked/SucukCenterReview.exe'),
    env,
    timeout: 30000,
  });
  const page = await require('./electron-test-window.cjs').mainWindow(app);
  await page.getByRole('heading', { name: 'İşletme Özeti', exact: true }).waitFor();
  await page.context().setOffline(true);
  const info = await app.evaluate(
    async ({ app, BrowserWindow, screen, desktopCapturer, nativeImage }, icon) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setSize(1440, 940);
      win.show();
      win.focus();
      if (nativeImage.createFromPath(icon).isEmpty())
        throw new Error('Paketli Windows simgesi yok.');
      const result = {
        packaged: app.isPackaged,
        documents: app.getPath('documents'),
        iconResource: true,
        taskbarCaptured: false,
        windowCaptured: false,
      };
      try {
        const windows = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 1600, height: 1100 },
        });
        const target = windows.find((s) => s.id === win.getMediaSourceId());
        if (target && !target.thumbnail.isEmpty()) {
          result.windowPNG = target.thumbnail.toPNG().toString('base64');
          result.windowCaptured = true;
        }
        const d = screen.getPrimaryDisplay(),
          b = d.bounds,
          w = d.workArea;
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: Math.ceil(b.width * d.scaleFactor),
            height: Math.ceil(b.height * d.scaleFactor),
          },
        });
        const source = sources.find((s) => s.display_id === String(d.id)) || sources[0];
        if (source && !source.thumbnail.isEmpty()) {
          const image = source.thumbnail,
            size = image.getSize(),
            sx = size.width / b.width,
            sy = size.height / b.height;
          let strip;
          if (w.y + w.height < b.y + b.height)
            strip = {
              x: 0,
              y: Math.round((w.y + w.height - b.y) * sy),
              width: size.width,
              height: size.height - Math.round((w.y + w.height - b.y) * sy),
            };
          else if (w.x > b.x)
            strip = { x: 0, y: 0, width: Math.round((w.x - b.x) * sx), height: size.height };
          else if (w.x + w.width < b.x + b.width)
            strip = {
              x: Math.round((w.x + w.width - b.x) * sx),
              y: 0,
              width: size.width - Math.round((w.x + w.width - b.x) * sx),
              height: size.height,
            };
          else if (w.y > b.y)
            strip = { x: 0, y: 0, width: size.width, height: Math.round((w.y - b.y) * sy) };
          if (strip && strip.width > 0 && strip.height > 0) {
            result.taskbarPNG = image.crop(strip).toPNG().toString('base64');
            result.taskbarCaptured = true;
          } else
            result.captureNote = 'Görev çubuğu çalışma alanından ayrı görünür bir bölge sağlamadı.';
        }
      } catch (error) {
        result.captureNote = String(error.message || error);
      }
      return result;
    },
    path.resolve('review-builds/runtime-test/win-unpacked/resources/icon.ico'),
  );
  assert.equal(info.packaged, true);
  assert.equal(info.documents, root);
  assert.equal(info.iconResource, true);
  if (info.windowPNG) {
    fs.writeFileSync(
      path.join(output, 'native-packaged-window.png'),
      Buffer.from(info.windowPNG, 'base64'),
    );
    delete info.windowPNG;
  }
  if (info.taskbarPNG) {
    fs.writeFileSync(
      path.join(output, 'native-taskbar.png'),
      Buffer.from(info.taskbarPNG, 'base64'),
    );
    delete info.taskbarPNG;
  }
  await page.screenshot({
    path: path.join(output, 'packaged-content.png'),
    animations: 'disabled',
  });
  fs.writeFileSync(path.join(output, 'native-verification.json'), JSON.stringify(info, null, 2));
  console.log(
    'READY: İzole paketli pencere ve görev çubuğu incelemesi',
    JSON.stringify({
      taskbarCaptured: info.taskbarCaptured,
      windowCaptured: info.windowCaptured,
      captureNote: info.captureNote || null,
    }),
  );
  if (process.env.SUCUKCENTER_VISUAL_HOLD === '1')
    await new Promise((resolve) => setTimeout(resolve, 60000));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close().catch(() => {});
    const safe = path.resolve(root);
    assert.ok(
      safe.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
        path.basename(safe).startsWith('sucukcenter-review-'),
    );
    fs.rmSync(safe, { recursive: true, force: true });
  });
