import { BrowserWindow, ipcMain, nativeImage, screen, systemPreferences } from 'electron';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { alphaRegions } from '../shared/alpha-mask';
export class Splash {
  readonly workArea: Electron.Rectangle;
  readonly window: BrowserWindow;
  readonly ready: Promise<void>;
  private paintedAt = 0;
  private rejectReady?: (e: Error) => void;
  private timer?: ReturnType<typeof setTimeout>;
  private paintTimeout?: ReturnType<typeof setTimeout>;
  private paintListener: (e: Electron.IpcMainEvent) => void;
  readonly regions: ReturnType<typeof alphaRegions>;
  readonly minimumMs = 7000;
  constructor(folder: string) {
    const image = nativeImage.createFromPath(path.join(folder, 'brand/splash.png'));
    if (image.isEmpty()) throw new Error('Açılış logosu bulunamadı. Uygulamayı yeniden kurun.');
    const meta = JSON.parse(readFileSync(path.join(folder, 'brand/metadata.json'), 'utf8')).splash;
    if (!meta.zeroAlpha) throw new Error('Açılış logosunda gerçek şeffaflık bulunamadı.');
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()),
      area = display.workArea;
    this.workArea = area;
    const width = Math.min(
      600,
      area.width - 40,
      Math.floor(((area.height - 40) * meta.bounds.width) / meta.bounds.height),
    );
    const height = Math.round((width * meta.bounds.height) / meta.bounds.width);
    const cropped = image.crop(meta.bounds).resize({ width, height, quality: 'best' });
    this.regions = alphaRegions(cropped.toBitmap(), width, height);
    const win = (this.window = new BrowserWindow({
      width,
      height,
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      frame: false,
      thickFrame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: false,
      show: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, 'splash-preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    }));
    win.setShape(this.regions);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.paintListener = () => {};
    this.ready = new Promise((resolve, reject) => {
      this.rejectReady = reject;
      this.paintListener = (e) => {
        if (e.sender !== win.webContents || e.senderFrame !== win.webContents.mainFrame) return;
        this.paintedAt = Date.now();
        clearTimeout(this.paintTimeout);
        ipcMain.removeListener('sc:splash-painted', this.paintListener);
        resolve();
      };
      ipcMain.on('sc:splash-painted', this.paintListener);
      this.paintTimeout = setTimeout(
        () => reject(new Error('Açılış logosu görüntülenemedi.')),
        10000,
      );
    });
    // Mark rejection handled until main preparation awaits the readiness gate.
    void this.ready.catch(() => {});
    const motion = systemPreferences.getAnimationSettings().prefersReducedMotion ? 0 : 400;
    const html = `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;background:transparent;overflow:hidden;width:100%;height:100%;}img{display:block;width:100%;height:100%;animation:appear ${motion}ms ease-out both;user-select:none;-webkit-user-drag:none;}@keyframes appear{from{opacity:.01}to{opacity:1}}</style><title>SucukCenter Açılış</title></head><body><img alt="Sucuk Center" src="${cropped.toDataURL()}"></body></html>`;
    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) win.showInactive();
    });
    void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).catch((error) => {
      this.rejectReady?.(error);
      this.dispose();
    });
  }
  async finish() {
    await this.ready;
    await new Promise<void>((resolve) => {
      this.timer = setTimeout(resolve, Math.max(0, this.minimumMs - (Date.now() - this.paintedAt)));
    });
    if (
      !this.window.isDestroyed() &&
      !systemPreferences.getAnimationSettings().prefersReducedMotion
    ) {
      for (let i = 1; i <= 5; i++) {
        this.window.setOpacity(1 - i / 6);
        await new Promise<void>((resolve) => {
          this.timer = setTimeout(resolve, 25);
        });
      }
    }
    this.dispose();
  }
  dispose() {
    if (!this.paintedAt) this.rejectReady?.(new Error('Açılış iptal edildi.'));
    clearTimeout(this.timer);
    clearTimeout(this.paintTimeout);
    ipcMain.removeListener('sc:splash-painted', this.paintListener);
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}
