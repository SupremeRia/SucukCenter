import { useEffect, useState, useRef } from 'react';
import { themes, resolveTheme, palette, type Appearance } from '../../shared/themes';
import { applyAppearance } from '../lib/appearance';
import { Button } from './ui/button';
import type { Command, Snapshot } from '../../shared/contracts';
export function AppearanceGallery({
  settings,
  onSave,
}: {
  settings: Snapshot['settings'];
  onSave: (c: Command) => Promise<void>;
}) {
  const saved = settings.appearance || (settings.theme === 'light' ? 'gray' : 'classic');
  const [draft, setDraft] = useState(saved),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const savedRef = useRef(saved);
  savedRef.current = saved;
  useEffect(() => {
    setDraft(saved);
    applyAppearance(saved);
  }, [saved]);
  useEffect(() => () => applyAppearance(savedRef.current), []);
  function preview(id: string) {
    setDraft(id);
    applyAppearance(id);
    setError('');
  }
  return (
    <section className="appearance-gallery" aria-label="Tema galerisi">
      <h2>Görünüm</h2>
      <p>Temayı seçerek anında önizleyin. Uygula seçimi kaydeder; Vazgeç önceki tercihe döner.</p>
      <label className="check">
        <input
          type="checkbox"
          checked={draft === 'system'}
          disabled={busy}
          onChange={(e) =>
            preview(e.target.checked ? 'system' : saved === 'system' ? 'classic' : saved)
          }
        />
        Sistem temasını takip et
      </label>
      <div className="theme-grid">
        {themes.map((t) => {
          const p = palette(t.id);
          return (
            <button
              key={t.id}
              className="theme-tile"
              type="button"
              aria-pressed={draft === t.id}
              aria-label={t.name}
              disabled={busy}
              onClick={() => preview(t.id)}
            >
              <span
                className="theme-preview"
                style={{ background: p['app-gradient'], color: p.foreground }}
              >
                <i style={{ background: p.sidebar }} />
                <span style={{ background: p.card, borderColor: p.border }}>
                  <b style={{ background: p.primary }} />
                  <em style={{ background: p.muted }} />
                  <em style={{ background: p.muted }} />
                </span>
              </span>
              <strong>{t.name}</strong>
              {draft === t.id && <span aria-label="Seçili">✓</span>}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="theme-actions">
        <span role="status">
          {draft === saved ? 'Kaydedilmiş tema' : 'Önizleme; henüz kaydedilmedi'}
        </span>
        <Button type="button" variant="outline" disabled={busy} onClick={() => preview(saved)}>
          Vazgeç
        </Button>
        <Button
          type="button"
          disabled={busy || draft === saved}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                type: 'settings',
                company: settings.company,
                theme: resolveTheme(draft, matchMedia('(prefers-color-scheme: dark)').matches).mode,
                appearance: draft as Appearance,
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Uygula
        </Button>
      </div>
    </section>
  );
}
