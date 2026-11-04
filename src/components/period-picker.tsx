import { useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import type { DateRange } from '../../shared/contracts';
import { dayBounds, monthRange, turkeyDay } from '../../shared/dates';
import {
  CalendarPanel,
  CalendarPopover,
  DateField,
  monthNames,
  shiftMonth,
  displayDay,
} from './calendar';
import { Button } from './ui/button';
import { Input } from './ui/input';
export function periodCaption(value: DateRange) {
  if (!value.start && !value.end) return 'Tüm zamanlar';
  if (value.start === value.end) return displayDay(value.start || '');
  if (value.start && value.end && value.start.slice(0, 7) === value.end.slice(0, 7)) {
    const [year, month] = value.start.split('-').map(Number),
      whole = monthRange(year, month);
    if (value.start === whole.start && value.end === whole.end)
      return `${monthNames[month - 1]} ${year}`;
    return `${Number(value.start.slice(8))}–${Number(value.end.slice(8))} ${monthNames[month - 1]} ${year}`;
  }
  return `${value.start ? displayDay(value.start) : 'Başlangıç'} – ${value.end ? displayDay(value.end) : 'Bugüne kadar'}`;
}
export function PeriodPicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
}) {
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState<'month' | 'day' | 'range'>('month'),
    [draft, setDraft] = useState<DateRange>(value),
    [year, setYear] = useState(Number((value.start || turkeyDay()).slice(0, 4))),
    [month, setMonth] = useState((value.start || turkeyDay()).slice(0, 7)),
    [selectingEnd, setSelectingEnd] = useState(false);
  let error = '';
  try {
    dayBounds(draft.start, draft.end);
    if (mode !== 'month' && (!draft.start || !draft.end))
      error = 'Başlangıç ve bitiş için geçerli bir tarih seçin.';
  } catch (e) {
    error = (e as Error).message;
  }
  const ongoing = !!(
    value.start &&
    value.start.slice(0, 7) === turkeyDay().slice(0, 7) &&
    value.end === turkeyDay() &&
    value.start.endsWith('-01')
  );
  function setRange(r: DateRange) {
    setDraft(r);
    setMonth((r.start || turkeyDay()).slice(0, 7));
    setYear(Number((r.start || turkeyDay()).slice(0, 4)));
    setSelectingEnd(false);
  }
  function openChange(o: boolean) {
    if (o) {
      setRange(value);
      setMode(
        value.start === value.end && value.start
          ? 'day'
          : value.start?.endsWith('-01')
            ? 'month'
            : 'range',
      );
    }
    setOpen(o);
  }
  function select(day: string) {
    if (mode === 'day') {
      setDraft({ start: day, end: day });
      return;
    }
    if (!selectingEnd) {
      setDraft({ start: day, end: undefined });
      setSelectingEnd(true);
    } else {
      setDraft({ start: draft.start, end: day });
      setSelectingEnd(false);
    }
  }
  return (
    <div className="period-bar">
      <div>
        <span className="period-eyebrow">RAPOR DÖNEMİ</span>
        <CalendarPopover
          open={open}
          onOpenChange={openChange}
          label="Dönem seçimi"
          className={`period-popover period-mode-${mode}`}
          trigger={
            <Button
              variant="outline"
              type="button"
              aria-label={`Dönem seç: ${periodCaption(value)}`}
            >
              <CalendarDays size={18} />
              <span>{periodCaption(value)}</span>
              <ChevronDown size={15} />
            </Button>
          }
        >
          <div className="period-dialog-title">
            <strong>Dönem seçimi</strong>
            <span>Seçimler Uygula ile rapora yansır.</span>
          </div>
          <div className="period-modes" role="group" aria-label="Dönem seçim biçimi">
            {(
              [
                ['month', 'Ay'],
                ['day', 'Tek gün'],
                ['range', 'Tarih aralığı'],
              ] as const
            ).map(([key, label]) => (
              <Button
                type="button"
                variant={mode === key ? 'default' : 'ghost'}
                key={key}
                aria-pressed={mode === key}
                onClick={() => {
                  setMode(key);
                  setSelectingEnd(false);
                  if (key === 'day')
                    setDraft({
                      start: draft.start || turkeyDay(),
                      end: draft.start || turkeyDay(),
                    });
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          {mode === 'month' ? (
            <>
              <div className="year-choice">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Önceki yıl"
                  disabled={year <= 1900}
                  onClick={() => setYear((y) => y - 1)}
                >
                  <ChevronLeft size={18} />
                </Button>
                <label>
                  Yıl
                  <Input
                    aria-label="Dönem yılı"
                    type="number"
                    min="1900"
                    max="9998"
                    value={year}
                    onChange={(e) => {
                      const y = Number(e.target.value);
                      if (y >= 1900 && y <= 9998) setYear(y);
                    }}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Sonraki yıl"
                  disabled={year >= 9998}
                  onClick={() => setYear((y) => y + 1)}
                >
                  <ChevronRight size={18} />
                </Button>
              </div>
              <div className="month-grid" role="group" aria-label={`${year} ayları`}>
                {monthNames.map((name, i) => (
                  <button
                    type="button"
                    key={name}
                    aria-pressed={
                      draft.start === monthRange(year, i + 1).start &&
                      draft.end === monthRange(year, i + 1).end
                    }
                    onClick={() => setDraft(monthRange(year, i + 1))}
                    onKeyDown={(e) => {
                      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
                        e.preventDefault();
                        const next =
                          (i +
                            ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key] ||
                              0) +
                            12) %
                          12;
                        const buttons =
                          e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                            'button',
                          );
                        buttons?.[next]?.focus();
                      }
                    }}
                  >
                    {name}
                    {draft.start === monthRange(year, i + 1).start && <Check size={14} />}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="period-date-fields">
                <DateField
                  label={mode === 'day' ? 'Tarih' : 'Başlangıç tarihi'}
                  value={draft.start || ''}
                  future
                  onChange={(day) =>
                    setDraft((r) => ({ ...r, start: day, ...(mode === 'day' ? { end: day } : {}) }))
                  }
                />
                {mode === 'range' && (
                  <DateField
                    label="Bitiş tarihi"
                    value={draft.end || ''}
                    future
                    onChange={(day) => setDraft((r) => ({ ...r, end: day }))}
                  />
                )}
              </div>
              <p className="calendar-range-hint">
                {mode === 'range'
                  ? selectingEnd
                    ? 'Şimdi bitiş gününü seçin.'
                    : 'Önce başlangıç, ardından bitiş gününü seçin.'
                  : 'Bir gün seçin.'}
              </p>
              <div className="calendar-pair">
                <CalendarPanel
                  label="Başlangıç takvimi"
                  month={month}
                  onMonthChange={setMonth}
                  value={mode === 'day' ? draft.start : undefined}
                  start={draft.start}
                  end={draft.end}
                  onSelect={select}
                />
                {mode === 'range' && (
                  <div className="second-calendar">
                    <CalendarPanel
                      label="Bitiş takvimi"
                      month={shiftMonth(month, 1)}
                      onMonthChange={(m) => setMonth(shiftMonth(m, -1))}
                      start={draft.start}
                      end={draft.end}
                      onSelect={select}
                    />
                  </div>
                )}
              </div>
            </>
          )}
          <div className="period-shortcuts">
            {['Bugün', 'Bu ay', 'Önceki ay', 'Bu yıl', 'Tüm zamanlar'].map((label) => (
              <Button
                type="button"
                key={label}
                size="sm"
                variant="outline"
                onClick={() => {
                  const today = turkeyDay(),
                    y = Number(today.slice(0, 4)),
                    m = Number(today.slice(5, 7));
                  if (label === 'Bugün') {
                    setMode('day');
                    setRange({ start: today, end: today });
                  } else if (label === 'Bu ay') {
                    setMode('month');
                    setRange(monthRange(y, m));
                  } else if (label === 'Önceki ay') {
                    const prev = shiftMonth(today.slice(0, 7), -1);
                    setMode('month');
                    setRange(monthRange(Number(prev.slice(0, 4)), Number(prev.slice(5, 7))));
                  } else if (label === 'Bu yıl') {
                    setMode('range');
                    setRange({ start: `${y}-01-01`, end: today });
                  } else {
                    setMode('month');
                    setRange({});
                  }
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="period-selection" aria-live="polite">
            {error ? 'Tarihleri kontrol edin' : periodCaption(draft)}
          </div>
          <footer className="period-footer">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="button"
              disabled={!!error}
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              Uygula
            </Button>
          </footer>
        </CalendarPopover>
      </div>
      <div className="period-description">
        <strong>{ongoing ? 'Ay devam ediyor' : 'Seçili dönem'}</strong>
        <span>
          {value.start && value.end
            ? `${displayDay(value.start)} – ${displayDay(value.end)}`
            : 'Kayıtların tamamı'}{' '}
          · Güncel stok ve bakiye ayrı gösterilir.
        </span>
      </div>
    </div>
  );
}
