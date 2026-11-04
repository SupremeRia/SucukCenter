import { palette, resolveTheme } from '../../shared/themes';
export function applyAppearance(id: string) {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const root = document.documentElement;
  const t = resolveTheme(id, dark);
  for (const [k, v] of Object.entries(palette(id, dark))) root.style.setProperty('--' + k, v);
  root.classList.toggle('dark', t.mode === 'dark');
  root.style.colorScheme = t.mode;
  root.dataset.appearance = id;
}
