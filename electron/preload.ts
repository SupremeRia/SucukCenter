import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI, Command, DateRange, ViewQuery } from '../shared/contracts';
const api: DesktopAPI = Object.freeze({
  record: (input: import('../shared/contracts').RecordRef) =>
    ipcRenderer.invoke('sc:record', input),
  preview: (command: Command) => ipcRenderer.invoke('sc:preview', command),
  annual: (year: number) => ipcRenderer.invoke('sc:annual', year),
  supplierStatement: (input: { supplierId: number; range: DateRange; offset?: number }) =>
    ipcRenderer.invoke('sc:supplierStatement', input),
  lookup: (input: {
    kind: 'products' | 'customers' | 'suppliers';
    search: string;
    selected?: number;
  }) => ipcRenderer.invoke('sc:lookup', input),
  report: (range: DateRange) => ipcRenderer.invoke('sc:report', range),
  statement: (input: { customerId: number; range: DateRange; offset?: number }) =>
    ipcRenderer.invoke('sc:statement', input),
  exportCustomer: (input: { customerId: number; range: DateRange }) =>
    ipcRenderer.invoke('sc:exportCustomer', input),
  snapshot: (query?: Partial<ViewQuery>) => ipcRenderer.invoke('sc:snapshot', query),
  autoBackup: () => ipcRenderer.invoke('sc:autoBackup'),
  execute: (command: Command, approval?: string) =>
    approval
      ? ipcRenderer.invoke('sc:executeApproved', { command, approval })
      : ipcRenderer.invoke('sc:execute', command),
  backup: () => ipcRenderer.invoke('sc:backup'),
  restore: () => ipcRenderer.invoke('sc:restore'),
  openFolder: () => ipcRenderer.invoke('sc:folder'),
});
contextBridge.exposeInMainWorld('desktop', api);

contextBridge.exposeInMainWorld(
  'initialAppearance',
  process.argv.find((a) => a.startsWith('--sc-appearance='))?.split('=')[1] || 'classic',
);

let notified = false;
contextBridge.exposeInMainWorld('notifyReady', (error?: string) => {
  if (notified) return;
  notified = true;
  ipcRenderer.send('sc:ui-ready', typeof error === 'string' ? error.slice(0, 400) : null);
});
