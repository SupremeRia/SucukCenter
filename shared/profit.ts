import type { PeriodReport } from './contracts';
export function netResult(r: PeriodReport) {
  const result = r.profit - r.expenses - r.fire - (r.productDebtCost || 0) + r.returnVariance;
  if (!Number.isSafeInteger(result))
    throw new Error('Net sonuç güvenli tam sayı sınırını aşıyor. Daha dar dönem seçin.');
  return result;
}
export function netMargin(r: PeriodReport): number | null {
  return r.revenue > 0 ? (netResult(r) / r.revenue) * 100 : null;
}
