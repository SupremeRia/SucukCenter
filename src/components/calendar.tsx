import { useId, useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Popover } from 'radix-ui';
import { dayISO, turkeyDay } from '../../shared/dates';
import { Input } from './ui/input';
import { Button } from './ui/button';
import './calendar.css';
export const monthNames = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];
export function displayDay(day: string) {
  return day ? day.split('-').reverse().join('.') : '';
}
export function parseDay(text: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if (!match) throw new Error('Tarihi gg.aa.yyyy biçiminde girin. Örnek: 15.08.2026');
  const day = `${match[3]}-${match[2]}-${match[1]}`;
  dayISO(day);
  if (Number(match[3]) < 1900 || Number(match[3]) > 9998)
    throw new Error('Yıl 1900–9998 arasında olmalı.');
  return day;
}
export function shiftDay(day: string, by: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}
export function shiftMonth(month: string, by: number) {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}
const fullDate = new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', dateStyle: 'full' });
export function CalendarPanel({
  month,
  onMonthChange,
  value,
  onSelect,
  start,
  end,
  max,
  label = 'Takvim',
}: {
  month: string;
  onMonthChange: (v: string) => void;
  value?: string;
  onSelect: (day: string) => void;
  start?: string;
  end?: string;
  max?: string;
  label?: string;
}) {
  const [active, setActive] = useState(value || turkeyDay());
  const grid = useRef<HTMLDivElement>(null),
    focusPending = useRef(false);
  const [year, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const firstCell = shiftDay(first, -weekday);
  const days = Array.from({ length: 42 }, (_, i) => shiftDay(firstCell, i));
  useEffect(() => {
    if (focusPending.current) {
      grid.current?.querySelector<HTMLButtonElement>(`[data-day="${active}"]`)?.focus();
      focusPending.current = false;
    }
  }, [active, month]);
  function move(day: string, key: string) {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    let next = key in offsets ? shiftDay(day, offsets[key]) : day;
    if (key === 'Home') next = shiftDay(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
    if (key === 'End')
      next = shiftDay(day, 6 - ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
    if (key === 'PageUp' || key === 'PageDown') {
      const target = shiftMonth(day.slice(0, 7), key === 'PageUp' ? -1 : 1);
      const last = new Date(
        Date.UTC(Number(target.slice(0, 4)), Number(target.slice(5, 7)), 0),
      ).getUTCDate();
      next = `${target}-${String(Math.min(Number(day.slice(8)), last)).padStart(2, '0')}`;
    }
    if (max && next > max) return;
    if (next.slice(0, 4) < '1900' || next.slice(0, 4) > '9998') return;
    focusPending.current = true;
    setActive(next);
    if (next.slice(0, 7) !== month) onMonthChange(next.slice(0, 7));
  }
  const tabDay =
    active.slice(0, 7) === month ? active : value?.slice(0, 7) === month ? value : first;
  return (
    <section className="calendar-panel" aria-label={label}>
      <div className="calendar-heading">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`${label}: önceki ay`}
          disabled={month === '1900-01'}
          onClick={() => onMonthChange(shiftMonth(month, -1))}
        >
          <ChevronLeft size={17} />
        </Button>
        <select
          aria-label={`${label}: ay`}
          value={m}
          onChange={(e) => onMonthChange(`${year}-${String(e.target.value).padStart(2, '0')}`)}
        >
          {monthNames.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <Input
          aria-label={`${label}: yıl`}
          type="number"
          min="1900"
          max="9998"
          value={year}
          onChange={(e) => {
            const y = Number(e.target.value);
            if (y >= 1900 && y <= 9998) onMonthChange(`${y}-${String(m).padStart(2, '0')}`);
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`${label}: sonraki ay`}
          disabled={month === '9998-12'}
          onClick={() => onMonthChange(shiftMonth(month, 1))}
        >
          <ChevronRight size={17} />
        </Button>
      </div>
      <div role="grid" aria-label={`${monthNames[m - 1]} ${year}`} ref={grid}>
        <div role="row" className="calendar-week">
          {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'].map((name) => (
            <span role="columnheader" key={name}>
              {name}
            </span>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, week) => (
          <div role="row" className="calendar-week" key={week}>
            {days.slice(week * 7, week * 7 + 7).map((day) => (
              <button
                type="button"
                role="gridcell"
                key={day}
                data-day={day}
                data-outside={day.slice(0, 7) !== month}
                data-between={!!(start && end && day > start && day < end)}
                data-edge={day === start || day === end || day === value}
                aria-selected={day === value || day === start || day === end}
                aria-current={day === turkeyDay() ? 'date' : undefined}
                aria-label={fullDate.format(new Date(`${day}T12:00:00Z`))}
                tabIndex={day === tabDay ? 0 : -1}
                disabled={!!max && day > max}
                onClick={() => onSelect(day)}
                onKeyDown={(e) => {
                  if (
                    [
                      'ArrowLeft',
                      'ArrowRight',
                      'ArrowUp',
                      'ArrowDown',
                      'Home',
                      'End',
                      'PageUp',
                      'PageDown',
                    ].includes(e.key)
                  ) {
                    e.preventDefault();
                    move(day, e.key);
                  }
                }}
              >
                {Number(day.slice(8))}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="calendar-legend">
        <span>
          <i className="legend-today" />
          Bugün
        </span>
        <span>
          <i className="legend-selected" />
          Seçim
        </span>
      </div>
    </section>
  );
}
export function CalendarPopover({
  open,
  onOpenChange,
  children,
  trigger,
  label,
  className = '',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
  trigger: React.ReactNode;
  label: string;
  className?: string;
}) {
  const content = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange} modal>
      <Popover.Trigger asChild ref={triggerRef}>
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={content}
          className={`calendar-popover ${className}`}
          aria-label={label}
          sideOffset={8}
          collisionPadding={12}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const focused = document.activeElement;
            // Radix restores focus on a later timer. A newer field interaction owns focus.
            if (
              !focused ||
              focused === document.body ||
              focused === triggerRef.current ||
              !focused.isConnected ||
              content.current?.contains(focused)
            )
              triggerRef.current?.focus({ preventScroll: true });
          }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() =>
              content.current
                ?.querySelector<HTMLButtonElement>(
                  '[role="gridcell"][tabindex="0"],button[aria-pressed="true"],button',
                )
                ?.focus({ preventScroll: true }),
            );
          }}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function DateField({
  id,
  name,
  label,
  initial = turkeyDay(),
  value,
  onChange,
  required = true,
  future = false,
}: {
  id?: string;
  name?: string;
  label: string;
  initial?: string;
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  future?: boolean;
}) {
  const generated = useId(),
    inputId = id || generated;
  const [stored, setStored] = useState(initial),
    [text, setText] = useState(displayDay(value ?? initial)),
    [error, setError] = useState(''),
    [open, setOpen] = useState(false),
    [month, setMonth] = useState((value || initial || turkeyDay()).slice(0, 7));
  const input = useRef<HTMLInputElement>(null);
  const lastSent = useRef<string | undefined>(undefined);
  const current = value ?? stored;
  useEffect(() => {
    if (value !== undefined && value !== lastSent.current) setText(displayDay(value));
  }, [value]);
  function change(text: string) {
    setText(text);
    let day = '',
      message = '';
    try {
      if (text) {
        day = parseDay(text);
        if (!future && day > turkeyDay())
          throw new Error('Gelecek tarihli işlem kaydedilemez. Bugün veya geçmiş bir tarih seçin.');
      } else if (required) throw new Error('İşlem tarihi gerekli.');
    } catch (e) {
      message = (e as Error).message;
    }
    setError(message);
    input.current?.setCustomValidity(message);
    lastSent.current = message ? '' : day;
    setStored(lastSent.current);
    onChange?.(lastSent.current);
    if (day && !message) setMonth(day.slice(0, 7));
  }
  return (
    <div className="field date-field">
      <label data-slot="label" htmlFor={inputId}>
        {label}
      </label>
      <div className="date-entry">
        <Input
          ref={input}
          id={inputId}
          aria-label={label}
          value={text}
          placeholder="gg.aa.yyyy"
          inputMode="numeric"
          required={required}
          maxLength={10}
          aria-invalid={!!error}
          aria-describedby={`${inputId}-help`}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if (e.altKey && e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
            }
          }}
        />
        <input type="hidden" name={name} value={current} />
        <CalendarPopover
          label={`${label} takvimi`}
          open={open}
          onOpenChange={setOpen}
          trigger={
            <Button type="button" variant="ghost" size="icon" aria-label={`${label}: takvimi aç`}>
              <CalendarDays size={18} />
            </Button>
          }
        >
          <CalendarPanel
            month={month}
            onMonthChange={setMonth}
            value={current}
            max={future ? undefined : turkeyDay()}
            onSelect={(day) => {
              change(displayDay(day));
              setOpen(false);
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="full"
            onClick={() => {
              change(displayDay(turkeyDay()));
              setOpen(false);
            }}
          >
            Bugün
          </Button>
        </CalendarPopover>
      </div>
      <small id={`${inputId}-help`} className={error ? 'field-error' : 'muted'}>
        {error || 'gg.aa.yyyy · Takvim için Alt + ↓'}
      </small>
    </div>
  );
}
