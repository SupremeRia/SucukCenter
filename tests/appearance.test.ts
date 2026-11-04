import test from 'node:test';
import assert from 'node:assert/strict';
import { themes, palette, contrast, resolveTheme } from '../shared/themes';
import { alphaRegions } from '../shared/alpha-mask';
test('20 temanın metin/vurgu kontrastı; sistem seçimi belirli temayı ezmez', () => {
  assert.equal(themes.length, 20);
  for (const t of themes) {
    const p = palette(t.id);
    const surfaces = [
      p.background,
      p.sidebar,
      p.card,
      p.muted,
      p['primary-soft'],
      p['positive-bg'],
      p['danger-bg'],
      p['orange-bg'],
      p.hover,
      ...('gradient' in t ? t.gradient : []),
    ];
    for (const color of [
      p.foreground,
      p['muted-foreground'],
      p.primary,
      p.positive,
      p.danger,
      p.warning,
      p.info,
    ])
      for (const s of surfaces) assert.ok(contrast(color, s) >= 4.5, t.id + ' ' + color + ' ' + s);
    assert.ok(contrast(p.primary, p['primary-foreground']) >= 4.5, t.id);
    assert.equal(resolveTheme(t.id, true).id, t.id);
    assert.equal(resolveTheme(t.id, false).id, t.id);
  }
  assert.equal(resolveTheme('system', true).id, 'classic');
  assert.equal(resolveTheme('system', false).id, 'gray');
});
test('alfa maskesi harf iç boşluğunu, eşik altını ve ayrı bölgeleri korur; dikey şeritleri birleştirir', () => {
  const b = new Uint8Array(7 * 7 * 4);
  for (let y = 1; y < 6; y++)
    for (let x = 1; x < 6; x++)
      if (x === 1 || x === 5 || y === 1 || y === 5) b[(y * 7 + x) * 4 + 3] = 255;
  b[3] = 23;
  const r = alphaRegions(b, 7, 7);
  const hit = (x: number, y: number) =>
    r.some((a) => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height);
  assert.equal(hit(3, 3), false);
  assert.equal(hit(0, 0), false);
  assert.equal(hit(1, 3), true);
  assert.ok(r.length < 16);
  assert.throws(() => alphaRegions(new Uint8Array(4), 1, 1));
});

import { Store } from '../electron/store';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
test('eski açık/koyu ayarı şema 11 görünümüne yedekli taşınır; geçersiz tema yedeği reddedilir', async () => {
  for (const theme of ['light', 'dark']) {
    const root = mkdtempSync(path.join(tmpdir(), 'sucukcenter-theme-migration-'));
    let s = new Store(path.join(root, 'data.db'));
    try {
      s.execute({ type: 'settings', company: 'Sentetik işletme', theme });
      s.db.prepare("DELETE FROM settings WHERE key='appearance'").run();
      s.db.pragma('user_version=10');
      s.close();
      s = await Store.openMigrating(path.join(root, 'data.db'));
      const settings = s.snapshot().settings;
      assert.equal(settings.theme, theme);
      assert.equal(settings.appearance, theme === 'light' ? 'gray' : 'classic');
      assert.equal(
        readdirSync(path.join(root, 'yedekler')).filter(
          (n) => n.startsWith('gecis-v10-') && n.endsWith('.db'),
        ).length,
        1,
      );
      s.execute({ type: 'settings', company: 'Sentetik işletme', theme, appearance: 'ocean' });
      s.close();
      s = new Store(path.join(root, 'data.db'));
      assert.equal(s.snapshot().settings.appearance, 'ocean');
      s.db.prepare("UPDATE settings SET value='geçersiz' WHERE key='appearance'").run();
      const backup = path.join(root, 'bad.db');
      await s.backup(backup);
      assert.throws(() => Store.validateBackup(backup), /görünüm/);
    } finally {
      s.close();
      rmSync(root, { recursive: true, force: true });
    }
  }
});
