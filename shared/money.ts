export function decimalMoney(cents: number, group = false): string {
  if (!Number.isSafeInteger(cents)) throw new Error('Tutar güvenli tam sayı değil.');
  const value = BigInt(cents);
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 100n;
  const formatted = group
    ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(whole)
    : whole.toString();
  return `${value < 0n ? '-' : ''}${formatted},${(absolute % 100n).toString().padStart(2, '0')}`;
}
// Storage: positive = receivable from customer; negative = payable to customer.
export function customerBalance(cents: number): string {
  if (!cents) return 'Hesap kapalı / bakiye sıfır';
  return `${cents < 0 ? '+' : ''}${decimalMoney(Math.abs(cents), true)} TL · Müşteri ${cents < 0 ? 'alacaklı' : 'borçlu'}`;
}
