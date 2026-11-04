import { app, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
const root = path.resolve(process.env.SUCUKCENTER_TEST_DOCUMENTS || '');
if (
  !root.startsWith(path.resolve(tmpdir()) + path.sep) ||
  !path.basename(root).startsWith('sucukcenter-startup-')
)
  throw Error('İzole test verisi gerekli');
mkdirSync(root, { recursive: true });
app.setPath('userData', path.join(root, 'electron-profile'));
const data: any = {
  pid: process.pid,
  delay: Number(process.env.SC_TEST_UI_DELAY || 0),
  windows: 0,
};
const file = path.join(root, process.pid + '.json');
const save = () => writeFileSync(file, JSON.stringify(data));
if (process.env.SC_TEST_EXPECT_FAILURE === '1')
  dialog.showMessageBox = (async (options: any) => {
    data.error = options.detail || options.message;
    save();
    return { response: 0, checkboxChecked: false };
  }) as any;
const originalOn = ipcMain.on.bind(ipcMain),
  originalRemove = ipcMain.removeListener.bind(ipcMain);
const replacements = new WeakMap<any, any>();
(ipcMain as any).on = (channel: string, listener: any) => {
  if (channel !== 'sc:ui-ready') return originalOn(channel, listener);
  const wrapped = (...args: any[]) => {
    data.rendererReadyAt = Date.now();
    save();
    setTimeout(() => {
      data.uiReadyAt = Date.now();
      save();
      listener(...args);
    }, data.delay);
  };
  replacements.set(listener, wrapped);
  return originalOn(channel, wrapped);
};
(ipcMain as any).removeListener = (channel: string, listener: any) =>
  originalRemove(channel, replacements.get(listener) || listener);
originalOn('sc:splash-painted', () => {
  data.paintedAt = Date.now();
  save();
});
app.on('browser-window-created', (_e, w) => {
  data.windows++;
  const splash = !w.isFocusable();
  w.on('show', () => {
    if (splash) data.splashShownAt = Date.now();
    else data.mainShownAt = Date.now();
    save();
  });
  w.on('closed', () => {
    data.windows--;
    save();
  });
});
app.on('second-instance', () => {
  data.secondInstances = (data.secondInstances || 0) + 1;
  save();
});
const alternate = process.env.SC_TEST_MAIN;
if (alternate && !path.resolve(alternate).startsWith(root + path.sep))
  throw new Error('Test giriş yolu izole klasörde olmalı.');
void import(alternate || '../electron/main');
