import { netResult, netMargin } from '../../shared/profit';
import { useEffect, useState } from 'react';
import type { DateRange, PeriodReport, Snapshot } from '../../shared/contracts';
import { monthRange, turkeyDay } from '../../shared/dates';
import { tl, signedTl, quantity, date, time } from '../lib/format';
import { DataTable, Row, Cell } from './views';
import { Button } from './ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { SummaryGrid } from './summary-grid';
export function MonthlyFinance({
  report,
  range,
  onChange,
  revision,
  dataRevision,
}: {
  report: PeriodReport | null;
  range: DateRange;
  onChange: (r: DateRange) => void;
  revision: Snapshot;
  dataRevision: number;
}) {
  const [tab, setTab] = useState('summary');
  const year = Number((range.start || turkeyDay()).slice(0, 4));
  const [annual, setAnnual] = useState<{ month: number; report: PeriodReport }[]>([]),
    [error, setError] = useState(''),
    [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let alive = true;
    if (tab !== 'annual') return;
    setAnnual([]);
    setError('');
    window.desktop
      .annual(year)
      .then((r) => {
        if (alive) {
          if (r.ok) setAnnual(r.data);
          else setError(r.error);
        }
      })
      .catch(() => {
        if (alive) setError('Yıllık rapor yüklenemedi.');
      });
    return () => {
      alive = false;
    };
  }, [year, dataRevision, tab]);
  return (
    <section aria-label="Aylık işletme raporu" className="finance-panels">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Rapor görünümleri">
          <TabsTrigger value="summary">Aylık özet</TabsTrigger>
          <TabsTrigger value="purchases">Alış dökümü</TabsTrigger>
          <TabsTrigger value="annual">Yıllık karşılaştırma</TabsTrigger>
          <TabsTrigger value="revisions">Maliyet revizyonları</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <div className="report-section">
            <h3>Aylık işletme raporu</h3>
            {report && (
              <>
                <SummaryGrid
                  items={[
                    {
                      label: 'Mal alış bedeli',
                      value: tl(report.grossPurchases),
                      hint: 'Bu dönemin mal girişleri',
                    },
                    { label: 'Alış iade / iptal', value: tl(report.purchaseReturns) },
                    { label: 'Net alış', value: tl(report.purchases), hint: 'Alış − iade / iptal' },
                  ]}
                />
                <h3>Satış ve işletme sonucu</h3>
                <SummaryGrid
                  items={[
                    { label: 'Net satış', value: tl(report.revenue) },
                    { label: 'Satılan mal maliyeti', value: tl(report.cogs) },
                    { label: 'Brüt kâr / zarar', value: tl(report.profit) },
                    { label: 'İşletme giderleri', value: tl(report.expenses) },
                    {
                      label: netResult(report) < 0 ? 'Net zarar' : 'Net kâr',
                      value: signedTl(netResult(report)),
                    },
                    {
                      label: 'Net kâr/zarar marjı',
                      value:
                        netMargin(report) === null
                          ? 'Hesaplanamıyor'
                          : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(
                              netMargin(report)!,
                            ) + '%',
                    },
                    { label: 'Fire maliyeti', value: tl(report.fire) },
                    {
                      label: 'Diğer ürün borcu teslim maliyeti',
                      value: tl(report.productDebtCost || 0),
                    },
                    { label: 'Tedarikçi iade maliyet farkı', value: tl(report.returnVariance) },
                  ]}
                />
                <h3>Nakit ve ödemeler</h3>
                <SummaryGrid
                  items={[
                    { label: 'Tahsilat', value: tl(report.collected) },
                    { label: 'Müşteriye para iadesi', value: tl(report.refunds) },
                    {
                      label: 'Tedarikçiye ödeme',
                      value: tl(report.supplierPaid),
                      hint: 'Mal alış bedelinden ayrı nakit çıkışı',
                    },
                    { label: 'Tedarikçiden para iadesi', value: tl(report.supplierRefunds) },
                    { label: 'Net nakit hareketi', value: tl(report.cash) },
                    {
                      label: 'Dönem faaliyet sonucu',
                      value: tl(netResult(report)),
                    },
                  ]}
                />
              </>
            )}
          </div>
        </TabsContent>
        <TabsContent value="purchases">
          <div className="report-section">
            <h3>Ürün ve tedarikçi bazında mal alışları</h3>
            {report && (
              <>
                <DataTable
                  headers={[
                    'Ürün',
                    'Tedarikçi',
                    'Birim',
                    'Alış miktarı',
                    'İade miktarı',
                    'Alış bedeli',
                    'İade / iptal',
                    'Net alış',
                  ]}
                  empty={!report.purchaseBreakdown.length}
                >
                  {report.purchaseBreakdown.map((r, i) => (
                    <Row key={i}>
                      <Cell>{r.product}</Cell>
                      <Cell>{r.supplier}</Cell>
                      <Cell>{r.unit}</Cell>
                      <Cell>
                        {quantity(r.quantity)} {r.unit}
                      </Cell>
                      <Cell>
                        {quantity(r.returnsQuantity)} {r.unit}
                      </Cell>
                      <Cell>{tl(r.amount)}</Cell>
                      <Cell>{tl(r.returned)}</Cell>
                      <Cell>{tl(r.amount - r.returned)}</Cell>
                    </Row>
                  ))}
                </DataTable>
                <SummaryGrid
                  items={['Kg', 'Litre', 'Adet'].map((unit) => {
                    const rows = report.purchaseBreakdown.filter((r) => r.unit === unit);
                    return {
                      label: `Net miktar · ${unit}`,
                      value: `${quantity(rows.reduce((s, r) => s + r.quantity - r.returnsQuantity, 0))} ${unit}`,
                      hint: `Alış: ${quantity(rows.reduce((s, r) => s + r.quantity, 0))} ${unit}`,
                    };
                  })}
                />
              </>
            )}
          </div>
        </TabsContent>
        <TabsContent value="annual">
          <div className="report-section">
            <div className="toolbar">
              <h3>{year} · Ocak–Aralık özeti</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={expanded}
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? 'Önemli sütunlar' : 'Tüm sütunları göster'}
              </Button>
            </div>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            {!annual.length && !error && (
              <p role="status" className="loading-state">
                <span className="loading-spinner" aria-hidden />
                Yıllık rapor yükleniyor…
              </p>
            )}
            {!!annual.length && (
              <DataTable
                stickyFirst
                headers={
                  expanded
                    ? [
                        'Ay',
                        'Alış',
                        'İade / iptal',
                        'Net alış',
                        'Net satış',
                        'Maliyet',
                        'Brüt kâr',
                        'Gider',
                        'Fire',
                        'Diğer ürün borcu maliyeti',
                        'Tahsilat',
                        'Para iadesi',
                        'Tedarikçi ödeme',
                        'İade farkı',
                        'Net nakit',
                        'Net kâr / zarar',
                        '',
                      ]
                    : [
                        'Ay',
                        'Net alış',
                        'Net satış',
                        'Brüt kâr',
                        'Gider',
                        'Net kâr / zarar',
                        'Net nakit',
                        '',
                      ]
                }
              >
                {annual.map(({ month, report: r }) => (
                  <Row key={month}>
                    <Cell>
                      {new Intl.DateTimeFormat('tr-TR', { month: 'long', timeZone: 'UTC' }).format(
                        new Date(Date.UTC(year, month - 1, 1)),
                      )}
                    </Cell>
                    {(expanded
                      ? [
                          r.grossPurchases,
                          r.purchaseReturns,
                          r.purchases,
                          r.revenue,
                          r.cogs,
                          r.profit,
                          r.expenses,
                          r.fire,
                          r.productDebtCost || 0,
                          r.collected,
                          r.refunds,
                          r.supplierPaid,
                          r.returnVariance,
                          r.cash,
                          netResult(r),
                        ]
                      : [r.purchases, r.revenue, r.profit, r.expenses, netResult(r), r.cash]
                    ).map((v, i) => (
                      <Cell className={v < 0 ? 'text-negative' : undefined} key={i}>
                        {(expanded ? i === 14 : i === 4) ? signedTl(v) : tl(v)}
                      </Cell>
                    ))}
                    <Cell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onChange(monthRange(year, month))}
                      >
                        Ayrıntı
                      </Button>
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </div>
        </TabsContent>
        <TabsContent value="revisions">
          <div className="report-section">
            <h3>Son 50 onaylı maliyet revizyonu</h3>
            <DataTable
              headers={['Sürüm', 'İşlem günü', 'Kaydedilme', 'Etkilenen ay ve brüt kâr farkı']}
              empty={!revision.costRevisions?.length}
            >
              {revision.costRevisions?.map((r) => (
                <Row key={r.id}>
                  <Cell>#{r.id}</Cell>
                  <Cell>{r.occurred_on.split('-').reverse().join('.')}</Cell>
                  <Cell>
                    {date(r.recorded_at)} {time(r.recorded_at)}
                  </Cell>
                  <Cell>
                    {(
                      JSON.parse(r.impact_json).changes as { month: string; profitDelta: number }[]
                    ).map((c) => (
                      <p key={c.month}>
                        {c.month}: {tl(c.profitDelta)}
                      </p>
                    ))}
                  </Cell>
                </Row>
              ))}
            </DataTable>
          </div>
        </TabsContent>
      </Tabs>
      {report && (
        <aside className="report-info" aria-label="Rapor oluşturulma bilgisi">
          <strong>
            Oluşturulma: {date(report.generatedAt)} {time(report.generatedAt)}
          </strong>
          <p>
            Geçmiş döneme sonradan eklenen: {report.lateEntries} hareket · Dönemi etkileyen maliyet
            revizyonu: {report.costRevisionCount}.
          </p>
          <p>
            Geçmiş kayıtlar güncel raporu değiştirebilir. Daha önce dışa aktarılan dosyalar korunur.
          </p>
        </aside>
      )}
    </section>
  );
}
