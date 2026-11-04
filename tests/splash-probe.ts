import { app, BrowserWindow, screen, Menu } from 'electron';
import path from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Splash } from '../electron/splash';
const root = path.resolve(process.env.SUCUKCENTER_SPLASH_PROBE || '');
const allowed = path
  .basename(root)
  .startsWith(app.isPackaged ? 'sucukcenter-review-' : 'sucukcenter-splash-');
if (!root.startsWith(path.resolve(tmpdir()) + path.sep) || !allowed)
  throw Error('İzole maske test klasörü gerekli');
app.setPath('userData', path.join(root, 'profile'));
app.setName('SC Mask Test');
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()),
    a = display.workArea;
  const under = new BrowserWindow({
    title: 'SC MASK UNDER',
    width: 800,
    height: 600,
    x: Math.round(a.x + (a.width - 800) / 2),
    y: Math.round(a.y + (a.height - 600) / 2),
    frame: false,
    thickFrame: false,
    resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  await under.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        '<html><meta charset="UTF-8"><body style="margin:0;background:#dce8e8;color:#172733;font:16px Segoe UI"><h2>SC MASK UNDER — sentetik pencere</h2><p id="status">Olay: 0</p><script>window.events=[];document.addEventListener("pointerdown",e=>{window.events.push({point:e.target.id||"background",x:e.clientX,y:e.clientY,at:Date.now()});document.querySelector("#status").textContent="Olay: "+window.events.length;});</script></body></html>',
      ),
  );
  under.show();
  const splash = new Splash(path.join(__dirname, '../../dist'));
  splash.window.setTitle('SC MASK LOGO');
  await splash.ready;
  const b = splash.window.getBounds(),
    u = under.getContentBounds();
  const mask = new Uint8Array(b.width * b.height);
  for (const r of splash.regions)
    for (let y = r.y; y < r.y + r.height; y++)
      mask.fill(1, y * b.width + r.x, y * b.width + r.x + r.width);
  const choose = (x: number, y: number, opaque: boolean) => {
    for (let radius = 0; radius < 80; radius++)
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const px = x + dx,
            py = y + dy;
          if (px < 5 || py < 5 || px >= b.width - 5 || py >= b.height - 5) continue;
          let good = true;
          for (let oy = -3; oy <= 3; oy++)
            for (let ox = -3; ox <= 3; ox++)
              if (Boolean(mask[(py + oy) * b.width + px + ox]) !== opaque) good = false;
          if (good) return { x: px, y: py };
        }
    throw Error('Test pikseli bulunamadı');
  };
  const points = [
    { id: 'c-hole', name: 'C ici', ...choose(415, 95, false) },
    { id: 'letter-gap', name: 'Harf arasi', ...choose(305, 250, false) },
    { id: 'outside', name: 'Dis seffaf', ...choose(20, 20, false) },
    { id: 'visible', name: 'Gorunur logo alti', ...choose(350, 25, true) },
  ];
  await under.webContents.executeJavaScript(
    '(' +
      ((data: any) => {
        for (const p of data.points) {
          const button = document.createElement('button');
          button.id = p.id;
          button.textContent = p.name;
          button.setAttribute('aria-label', p.name);
          Object.assign(button.style, {
            position: 'absolute',
            left: data.dx + p.x - 8 + 'px',
            top: data.dy + p.y - 8 + 'px',
            width: '16px',
            height: '16px',
            padding: '0',
            fontSize: '1px',
          });
          document.body.append(button);
        }
      }).toString() +
      ')(' +
      JSON.stringify({ points, dx: b.x - u.x, dy: b.y - u.y }) +
      ')',
  );
  const visible = points[3];
  await splash.window.webContents.executeJavaScript(
    '(' +
      ((p: any) => {
        (window as any).events = [];
        document.addEventListener('pointerdown', (e) =>
          (window as any).events.push({ x: e.clientX, y: e.clientY, at: Date.now() }),
        );
        const button = document.createElement('button');
        button.setAttribute('aria-label', 'Gorunur logo');
        Object.assign(button.style, {
          position: 'absolute',
          left: p.x - 7 + 'px',
          top: p.y - 7 + 'px',
          width: '14px',
          height: '14px',
          border: '0',
          padding: '0',
          background: 'transparent',
          outline: 'none',
          zIndex: '5',
        });
        document.body.append(button);
      }).toString() +
      ')(' +
      JSON.stringify(visible) +
      ')',
  );
  mkdirSync(root, { recursive: true });
  writeFileSync(
    path.join(root, 'ready.json'),
    JSON.stringify({
      packaged: app.isPackaged,
      bounds: b,
      under: u,
      points,
      scale: display.scaleFactor,
      regions: splash.regions.length,
    }),
  );
  const write = async () =>
    writeFileSync(
      path.join(root, 'clicks.json'),
      JSON.stringify({
        under: await under.webContents.executeJavaScript('window.events'),
        logo: await splash.window.webContents.executeJavaScript('window.events'),
      }),
    );
  let done = false;
  const finish = async () => {
    if (done) return;
    done = true;
    clearInterval(timer);
    await write();
    splash.dispose();
    under.destroy();
    app.quit();
  };
  const timer = setInterval(() => {
    if (existsSync(path.join(root, 'stop'))) void finish();
    else void write();
  }, 250);
  setTimeout(() => void finish(), 180000);
  app.on('before-quit', () => {
    clearInterval(timer);
    splash.dispose();
  });
});
