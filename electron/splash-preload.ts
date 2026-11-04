/// <reference lib="dom" />
import { ipcRenderer } from 'electron';
window.addEventListener(
  'DOMContentLoaded',
  () => {
    const img = document.querySelector('img');
    const painted = () =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => ipcRenderer.send('sc:splash-painted')),
      );
    if (img?.complete) painted();
    else img?.addEventListener('load', painted, { once: true });
  },
  { once: true },
);
