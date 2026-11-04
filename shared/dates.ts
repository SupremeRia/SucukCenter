const turkeyDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function turkeyDay(iso = new Date().toISOString()) {
  return turkeyDateFormatter.format(new Date(iso));
}
export function dayISO(day: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day
  )
    throw new Error('Geçerli tarih seçin.');
  return `${day}T12:00:00+03:00`;
}
export function dayBounds(start?: string, end?: string) {
  if (start) dayISO(start);
  if (end) dayISO(end);
  if (start && end && start > end) throw new Error('Bitiş tarihi başlangıçtan önce olamaz.');
  return {
    from: start ? turkeyMidnight(start) : undefined,
    to: end
      ? turkeyMidnight(
          new Date(Date.parse(`${end}T00:00:00Z`) + 86400000).toISOString().slice(0, 10),
        )
      : undefined,
  };
}
function turkeyMidnight(day: string) {
  const target = Date.parse(`${day}T00:00:00Z`);
  let guess = target;
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(
      format.formatToParts(new Date(guess)).map((r) => [r.type, r.value]),
    );
    const local = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
    );
    guess += target - local;
  }
  return new Date(guess).toISOString();
}
export function monthRange(year: number, month: number, today = turkeyDay()) {
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 9998 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    throw new Error('Geçerli yıl ve ay seçin.');
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const calendarEnd = `${start.slice(0, 8)}${last}`;
  const ongoing = today >= start && today <= calendarEnd;
  return { start, end: ongoing ? today : calendarEnd };
}
export function monthLabel(range: { start?: string; end?: string }, today = turkeyDay()) {
  const fmt = (day: string) =>
    new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Istanbul',
    }).format(new Date(dayISO(day)));
  if (!range.start || !range.end) return 'Tüm dönemler';
  return `${fmt(range.start)} – ${fmt(range.end)}${range.end === today && range.start.slice(0, 7) === today.slice(0, 7) ? ' / ay devam ediyor' : ''}`;
}
