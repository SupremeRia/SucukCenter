import { useEffect, useId, useRef, useState } from 'react';
import { Input } from './ui/input';
import { Popover } from 'radix-ui';
export interface Choice {
  value: string;
  label: string;
  record?: any;
}
export function SearchableChoice({
  id,
  label,
  value,
  onChange,
  options,
  required = true,
  load,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string, record?: any) => void;
  options: Choice[];
  required?: boolean;
  load?: (search: string) => Promise<Choice[]>;
}) {
  const auto = useId();
  const inputId = id || auto;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<Choice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const ref = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [chosen, setChosen] = useState<Choice | null>(
    () => options.find((o) => o.value === value) || null,
  );
  const all = remote || options;
  const choices = all
    .filter((o) => o.label.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  const selected =
    options.find((o) => o.value === value) || (chosen?.value === value ? chosen : null);
  useEffect(
    () => () => {
      seq.current++;
    },
    [],
  );
  useEffect(() => {
    const list = listRef.current,
      option = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (!open || !list || !option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  }, [active, open, remote]);
  async function fetchOptions(q: string) {
    setError('');
    if (load) {
      const token = ++seq.current;
      setLoading(true);
      try {
        const result = await load(q);
        if (token === seq.current) {
          setRemote(result);
          setError('');
        }
      } catch {
        if (token === seq.current) setError('Seçenekler yüklenemedi. Yeniden arayın.');
      } finally {
        if (token === seq.current) setLoading(false);
      }
    }
  }
  function showList() {
    setQuery('');
    setActive(0);
    setOpen(true);
    void fetchOptions('');
  }
  function search(q: string) {
    setQuery(q);
    setActive(0);
    setOpen(true);
    onChange('');
    void fetchOptions(q);
  }
  function pick(c: Choice) {
    setChosen(c);
    onChange(c.value, c.record);
    setQuery('');
    setOpen(false);
    ref.current?.setCustomValidity('');
    ref.current?.focus();
  }
  return (
    <div className="searchable">
      <Popover.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery('');
        }}
      >
        <Popover.Anchor asChild>
          <Input
            ref={ref}
            id={inputId}
            role="combobox"
            aria-label={label}
            title={selected?.label || undefined}
            aria-expanded={open}
            aria-controls={`${inputId}-options`}
            aria-autocomplete="list"
            aria-activedescendant={
              open && choices[active] ? `${inputId}-option-${active}` : undefined
            }
            autoComplete="off"
            required={required}
            placeholder="Yazarak ara…"
            value={open ? query : selected?.label || ''}
            onClick={() => {
              if (!open) showList();
            }}
            onChange={(e) => search(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!open) {
                  showList();
                  setActive(e.key === 'ArrowDown' ? 0 : Math.max(0, choices.length - 1));
                } else
                  setActive((a) =>
                    Math.max(0, Math.min(choices.length - 1, a + (e.key === 'ArrowDown' ? 1 : -1))),
                  );
              } else if (e.key === 'Enter' && open) {
                e.preventDefault();
                if (choices[active]) pick(choices[active]);
              } else if (e.key === 'Escape' && open) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              } else if (e.key === 'Home' && open) {
                e.preventDefault();
                setActive(0);
              } else if (e.key === 'End' && open) {
                e.preventDefault();
                setActive(Math.max(0, choices.length - 1));
              } else if (e.key === 'Tab' && open) {
                setOpen(false);
                setQuery('');
              }
            }}
          />
        </Popover.Anchor>
        {open && (
          <Popover.Portal>
            <Popover.Content
              ref={listRef}
              className="choice-list"
              align="start"
              hideWhenDetached
              sideOffset={5}
              collisionPadding={12}
              style={{
                width: 'var(--radix-popover-trigger-width)',
                maxWidth: 'var(--radix-popover-content-available-width)',
                pointerEvents: 'auto',
              }}
              onInteractOutside={(e) => {
                if (e.target instanceof Node && ref.current?.contains(e.target)) e.preventDefault();
              }}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              id={`${inputId}-options`}
              role="listbox"
              aria-label={`${label} seçenekleri`}
            >
              {loading && <p role="status">Yükleniyor…</p>}
              {error && <p role="alert">{error}</p>}
              {choices.map((c, i) => (
                <button
                  type="button"
                  tabIndex={-1}
                  id={`${inputId}-option-${i}`}
                  role="option"
                  aria-selected={c.value === value}
                  data-active={i === active}
                  key={c.value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c)}
                >
                  {c.label}
                </button>
              ))}
              {!loading && !choices.length && <p>Sonuç bulunamadı.</p>}
            </Popover.Content>
          </Popover.Portal>
        )}
      </Popover.Root>
      {selected && selected.label.length > 36 && (
        <small className="choice-selected-label">{selected.label}</small>
      )}
    </div>
  );
}
