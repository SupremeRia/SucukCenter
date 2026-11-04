import { Splash } from './splash';
import { resolveTheme } from '../shared/themes';
import { recordSchema } from '../shared/contracts';
import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  type IpcMainInvokeEvent,
  session,
  nativeTheme,
} from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { DatabaseService } from './database-service';
import { ZodError, z } from 'zod';
import { rangeSchema, viewSchema } from '../shared/contracts';
import { writeFile } from 'node:fs/promises';

const readOnlyChannels = new Set([
  'sc:snapshot',
  'sc:record',
  'sc:lookup',
  'sc:report',
  'sc:annual',
  'sc:statement',
  'sc:supplierStatement',
]);
let store: DatabaseService;
let closing = false;
let closed = false;
let window: BrowserWindow;
let maintenance = false;
let splash: Splash | undefined;
let starting = true;
let secondRequested = false;
const testing = !app.isPackaged && process.env.SUCUKCENTER_TEST === '1';
// Test-only override is deliberately ignored by installed applications.
const isolatedDocuments = testing ? process.env.SUCUKCENTER_TEST_DOCUMENTS : undefined;
if (isolatedDocuments) {
  mkdirSync(isolatedDocuments, { recursive: true });
  app.setPath('userData', path.join(isolatedDocuments, 'electron-profile'));
}
const entry = path.join(__dirname, '../../dist/index.html');
const trustedURL = pathToFileURL(entry).href;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window && !starting) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    } else secondRequested = true;
  });
  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);
      app.setAppUserModelId(
        testing || app.getName() === 'SucukCenterReview'
          ? 'com.sucukcenter.review-test'
          : 'com.sucukcenter.desktop',
      );
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      // Every asset is shipped with the application. No network requests are necessary.
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
        (_details, callback) => callback({ cancel: true }),
      );
      splash = new Splash(path.dirname(entry));
      store = new DatabaseService(
        path.join(isolatedDocuments || app.getPath('documents'), 'SucukCenter', 'sucukcenter.db'),
      );
      await store.ready;
      const initial = await store.call<any>('snapshot', { page: 'settings' });
      const appearance =
        initial.settings.appearance || (initial.settings.theme === 'light' ? 'gray' : 'classic');
      const initialTheme = resolveTheme(appearance, nativeTheme.shouldUseDarkColors);
      const area = splash.workArea;
      const width = Math.min(1440, area.width),
        height = Math.min(940, area.height);
      window = new BrowserWindow({
        width,
        height,
        x: Math.round(area.x + (area.width - width) / 2),
        y: Math.round(area.y + (area.height - height) / 2),
        minWidth: 860,
        minHeight: 640,
        show: false,
        title: 'SucukCenter',
        icon: app.isPackaged
          ? path.join(process.resourcesPath, 'icon.ico')
          : path.join(__dirname, '../../build/icon.ico'),
        backgroundColor: initialTheme.background,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          additionalArguments: ['--sc-appearance=' + appearance],
          backgroundThrottling: false,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      window.on('close', (event) => {
        if (closed) return;
        if (maintenance || closing) {
          event.preventDefault();
          return;
        }
        if (!closed) {
          event.preventDefault();
          app.quit();
        }
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => {
        if (url !== trustedURL) event.preventDefault();
      });
      window.webContents.on('will-attach-webview', (event) => event.preventDefault());
      function handler(channel: string, fn: (arg: unknown) => unknown | Promise<unknown>) {
        ipcMain.handle(channel, async (event: IpcMainInvokeEvent, arg: unknown) => {
          try {
            if (
              event.sender !== window.webContents ||
              event.senderFrame !== window.webContents.mainFrame ||
              event.senderFrame.url !== trustedURL
            )
              throw new Error('Yetkisiz istek.');
            if (closing) throw new Error('Uygulama güvenli biçimde kapatılıyor.');
            if (maintenance && !readOnlyChannels.has(channel))
              throw new Error('Yedekleme veya geri yükleme sürüyor. Lütfen bekleyin.');
            return { ok: true, data: await fn(arg) };
          } catch (error) {
            const raw = error instanceof Error ? error.message : 'İşlem tamamlanamadı.';
            const code = (error as { code?: string })?.code || '';
            const systemMessages: Record<string, string> = {
              SQLITE_NOTADB: 'Seçilen dosya geçerli bir SQLite veritabanı değil.',
              SQLITE_CORRUPT: 'Veritabanı bütünlüğü bozulmuş. Güvenli bir yedekten geri yükleyin.',
              SQLITE_BUSY: 'Veritabanı kullanımda. Biraz sonra yeniden deneyin.',
              SQLITE_READONLY: 'Veritabanına yazılamıyor. Klasörün yazma izinlerini kontrol edin.',
              SQLITE_FULL: 'Diskte yeterli boş alan yok. İşlem kaydedilmedi.',
              SQLITE_IOERR: 'Diske erişilemedi. Disk bağlantısını ve boş alanı kontrol edin.',
              EACCES: 'Bu dosya veya klasör için erişim izni yok.',
              EPERM:
                'Dosya işlemi engellendi. Dosyanın başka bir programda açık olmadığını kontrol edin.',
              ENOSPC: 'Diskte yeterli boş alan yok.',
            };
            const message =
              error instanceof ZodError || (error instanceof Error && error.name === 'ZodError')
                ? 'Alanları kontrol edin; geçerli tutar ve miktarlar girin.'
                : raw.includes('UNIQUE constraint')
                  ? 'Bu isimle kayıt zaten var.'
                  : raw.includes('CHECK constraint')
                    ? 'İşlem stok veya tutar sınırını aşıyor.'
                    : systemMessages[code] || raw;
            return { ok: false, error: message };
          }
        });
      }
      const automatic = { run: (force = false) => store.call<string | null>('autoBackup', force) };
      try {
        await automatic.run();
      } catch {
        /* The failure stays visible in settings; the app remains usable. */
      }
      if (closing || closed) return;
      const backupTimer = setInterval(
        async () => {
          if (maintenance || closing) return;
          maintenance = true;
          try {
            await automatic.run();
          } catch {
            /* See settings for the last error. */
          } finally {
            maintenance = false;
          }
        },
        60 * 60 * 1000,
      );
      backupTimer.unref();
      handler('sc:autoBackup', async () => {
        maintenance = true;
        try {
          return await automatic.run(true);
        } finally {
          maintenance = false;
        }
      });
      handler('sc:record', (arg) => store.call('record', recordSchema.parse(arg)));
      handler('sc:snapshot', (arg) => store.call('snapshot', viewSchema.parse(arg || {})));
      handler('sc:execute', (arg) => store.call('execute', arg));
      handler('sc:preview', (arg) => store.call('preview', arg));
      handler('sc:executeApproved', (arg) => {
        const q = z
          .object({ command: z.unknown(), approval: z.string().max(64) })
          .strict()
          .parse(arg);
        return store.call('execute', q.command, q.approval);
      });
      handler('sc:lookup', (arg) => store.call('lookup', arg));
      handler('sc:report', (arg) => store.call('report', rangeSchema.parse(arg || {})));
      handler('sc:annual', (arg) =>
        store.call('annual', z.number().int().min(1900).max(9998).parse(arg)),
      );
      const statementSchema = z
        .object({
          customerId: z.number().int().positive(),
          range: rangeSchema,
          offset: z.number().int().min(0).optional(),
        })
        .strict();
      handler('sc:supplierStatement', (arg) => {
        const q = z
          .object({
            supplierId: z.number().int().positive(),
            range: rangeSchema,
            offset: z.number().int().min(0).optional(),
          })
          .strict()
          .parse(arg);
        return store.call('supplierStatement', q);
      });
      handler('sc:statement', (arg) => {
        const q = statementSchema
          .extend({ productOffset: z.number().int().min(0).max(10000000).optional() })
          .parse(arg);
        return store.call('statement', q);
      });
      handler('sc:exportCustomer', async (arg) => {
        const q = statementSchema.parse(arg);
        const result = await dialog.showSaveDialog(window, {
          title: 'Müşteri ekstresi',
          buttonLabel: 'CSV kaydet',
          defaultPath: 'Musteri-Ekstresi.csv',
          filters: [{ name: 'CSV ekstre', extensions: ['csv'] }],
        });
        if (result.canceled || !result.filePath) return null;
        await writeFile(result.filePath, await store.call<string>('customerCSV', q), 'utf8');
        return result.filePath;
      });
      handler('sc:folder', async () => {
        const error = await shell.openPath(path.dirname(store.file));
        if (error) throw new Error(error);
        return null;
      });
      handler('sc:backup', async () => {
        maintenance = true;
        try {
          const { canceled, filePath } = await dialog.showSaveDialog(window, {
            title: 'Güvenli yedek oluştur',
            buttonLabel: 'Yedeği kaydet',
            defaultPath: path.join(
              app.getPath('documents'),
              `SucukCenter-Yedek-${new Date().toISOString().slice(0, 10)}.db`,
            ),
            filters: [{ name: 'SucukCenter yedeği', extensions: ['db'] }],
          });
          if (canceled || !filePath) return null;
          await store.call('backup', filePath);
          return filePath;
        } finally {
          maintenance = false;
        }
      });
      handler('sc:restore', async () => {
        maintenance = true;
        try {
          const { canceled, filePaths } = await dialog.showOpenDialog(window, {
            title: 'Geri yüklenecek yedeği seçin',
            buttonLabel: 'Yedeği seç',
            properties: ['openFile'],
            filters: [{ name: 'SucukCenter yedeği', extensions: ['db'] }],
          });
          if (canceled || !filePaths[0]) return null;
          await store.call('validateBackup', filePaths[0]);
          const answer = await dialog.showMessageBox(window, {
            type: 'warning',
            title: 'Yedekten geri yükle',
            message: 'Mevcut kayıtlar seçilen yedekle değiştirilecek.',
            detail:
              'Mevcut verilerin güvenli geri dönüş yedeği Belgeler/SucukCenter klasörüne oluşturulacak. Gerekirse bu dosyayı seçerek geri dönebilirsiniz.',
            buttons: ['Vazgeç', 'Geri yükle'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          });
          if (answer.response !== 1) return null;
          return await store.call('restore', filePaths[0]);
        } finally {
          maintenance = false;
        }
      });
      let readinessTimer: ReturnType<typeof setTimeout>;
      let readyListener: (e: Electron.IpcMainEvent, error: unknown) => void;
      const uiReady = new Promise<void>((resolve, reject) => {
        readyListener = (event, error) => {
          if (
            event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame ||
            event.senderFrame.url !== trustedURL
          )
            return;
          clearTimeout(readinessTimer);
          ipcMain.removeListener('sc:ui-ready', readyListener);
          if (error) reject(new Error(String(error)));
          else resolve();
        };
        ipcMain.on('sc:ui-ready', readyListener);
        readinessTimer = setTimeout(
          () => reject(new Error('Ana ekran hazırlanamadı. Yeniden deneyin.')),
          120000,
        );
      });
      try {
        await window.loadFile(entry);
        await uiReady;
        await splash.finish();
      } finally {
        clearTimeout(readinessTimer!);
        ipcMain.removeListener('sc:ui-ready', readyListener!);
      }
      if (!closing && !closed) {
        starting = false;
        window.show();
        window.webContents.setBackgroundThrottling(true);
        if (secondRequested) window.focus();
      }
    })
    .catch(async (error) => {
      if (closing || closed) return;
      splash?.dispose();
      const choice = await dialog.showMessageBox({
        type: 'error',
        title: 'SucukCenter açılamadı',
        message: 'Uygulama hazırlanamadı. Kayıtlarınız korunuyor.',
        detail: error instanceof Error ? error.message : String(error),
        buttons: ['Çıkış', 'Yeniden dene'],
        defaultId: 0,
        cancelId: 0,
      });
      try {
        await store?.close();
      } catch {
        /* A failed worker has no pending accepted writes. */
      }
      if (choice.response === 1) app.relaunch();
      app.exit(1);
    });
  app.on('window-all-closed', () => {
    if (!starting) app.quit();
  });
  app.on('before-quit', (event) => {
    splash?.dispose();
    if (closed) return;
    event.preventDefault();
    if (maintenance || closing) return;
    closing = true;
    Promise.resolve(store?.close())
      .then(() => {
        closed = true;
        app.quit();
      })
      .catch((error) => {
        closing = false;
        dialog.showErrorBox('Veritabanı kapatılamadı', String(error));
      });
  });
}
