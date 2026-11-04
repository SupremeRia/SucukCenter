import { RecordSurface, recordFor } from './record-actions';
import {
  useState,
  useEffect,
  Children,
  cloneElement,
  isValidElement,
  createContext,
  useContext,
  lazy,
  Suspense,
  type ReactNode,
  type ReactElement,
} from 'react';
import { SummaryGrid } from './summary-grid';
import { usePeriod } from './period';
import type { Statement } from '../../shared/contracts';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Package,
  Search,
  ReceiptText,
  CircleDashed,
  Truck,
  ShoppingBag,
  HandCoins,
  Wallet,
  RotateCcw,
  Settings,
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from './ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { date, time, tl, quantity, localDay, kindLabel, customerBalance } from '../lib/format';
import type { Activity, Snapshot } from '../../shared/contracts';
import type { Reversal } from './forms';
import type { Command } from '../../shared/contracts';
const PreordersPanel = lazy(() =>
  import('./preorders').then((m) => ({ default: m.PreordersPanel })),
);
export function Empty({
  title = 'Henüz kayıt yok',
  description = 'Yeni bir kayıt eklediğinizde burada görünecek.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <CircleDashed size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function DataTable({
  headers,
  children,
  empty,
  stickyFirst = false,
  filtered = false,
  sort,
}: {
  headers: string[];
  children: ReactNode;
  empty?: boolean;
  stickyFirst?: boolean;
  filtered?: boolean;
  sort?: { index: number; direction: 'asc' | 'desc'; onSort: (index: number) => void };
}) {
  const searching = useContext(SearchStateContext);
  const numeric = headers.map(
    (h) =>
      !/adı|tarih|durum|belge|firma|ürün|müşteri|tedarikçi$|tür/i.test(h) &&
      h !== 'Satış' &&
      /tutar|fiyat|maliyet|kâr|borç|alacak|bakiye|stok|miktar|alış|satış|tahsilat|iade|gider|fire|nakit|giriş|çıkış/i.test(
        h,
      ),
  );
  return empty ? (
    <Empty
      title={filtered || searching ? 'Aramanızla eşleşen kayıt yok' : 'Henüz kayıt yok'}
      description={
        filtered || searching
          ? 'Aramayı değiştirin veya filtreleri temizleyin.'
          : 'İlk kaydınızı ekleyerek başlayın. Kaydettiğiniz işlemler burada listelenir.'
      }
    />
  ) : (
    <div className={`table-scroll ${stickyFirst ? 'sticky-first' : ''}`}>
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h, i) => (
              <TableHead
                aria-sort={
                  sort?.index === i
                    ? sort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined
                }
                className={numeric[i] ? 'numeric' : undefined}
                key={`${h}-${i}`}
              >
                {sort && i < 4 ? (
                  <button className="table-sort" onClick={() => sort.onSort(i)}>
                    {h}
                    {sort.index === i ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
                  </button>
                ) : (
                  h
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Children.map(children, (row) => {
            if (!isValidElement(row)) return row;
            const r = row as ReactElement<{ children: ReactNode }>;
            return cloneElement(
              r,
              {},
              Children.map(r.props.children, (cell, i) =>
                isValidElement(cell)
                  ? cloneElement(cell as ReactElement<{ className?: string }>, {
                      className: `${(cell.props as { className?: string }).className || ''} ${numeric[i] ? 'numeric' : ''}`,
                    })
                  : cell,
              ),
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
export { TableRow as Row, TableCell as Cell };
export const SearchStateContext = createContext(false);
export function Metric({
  label,
  value,
  hint,
  icon,
  accent = false,
  scope,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: ReactNode;
  accent?: boolean;
  scope?: 'current' | 'period';
}) {
  const negative = /^[−-]/.test(String(value));
  return (
    <Card
      data-scope={scope}
      className={`metric ${accent ? 'metric-accent' : ''} ${negative ? 'metric-negative' : ''}`}
    >
      <CardContent>
        {scope && (
          <div className="scope-label">
            {scope === 'current' ? 'GÜNCEL DURUM' : 'SEÇİLEN DÖNEM'}
            {negative ? ' · EKSİ BAKİYE / ZARAR' : ''}
          </div>
        )}
        <div className="metric-head">
          <span>{label}</span>
          <i>{icon}</i>
        </div>
        <strong>{value}</strong>
        <small>{hint}</small>
      </CardContent>
    </Card>
  );
}
export function Status({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={status === 'active' ? 'badge-green' : 'badge-muted'}>
      {status === 'active' ? 'Tamamlandı' : status === 'corrected' ? 'Düzeltildi' : 'İptal / iade'}
    </Badge>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = 'Kayıtlarda ara…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="searchbox">
      <Search size={16} />
      <Input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function ActivityList({
  rows,
  onOpen,
  compact = false,
}: {
  rows: Activity[];
  onOpen: (a: Activity) => void;
  compact?: boolean;
}) {
  const { start, end } = usePeriod();
  const invalid = !!(start && end && start > end);
  const filtered = rows.filter(
    (a) => (!start || localDay(a.created_at) >= start) && (!end || localDay(a.created_at) <= end),
  );
  return (
    <>
      <div className="activity-toolbar">
        <div>
          <h3>{compact ? 'Son işlemler' : 'İşlem akışı'}</h3>
          <p>{filtered.length} işlem • En yeniden eskiye</p>
        </div>
      </div>
      {invalid ? (
        <div className="error-box">Bitiş tarihi başlangıçtan önce olamaz.</div>
      ) : !filtered.length ? (
        <Empty
          title="Bu tarihlerde işlem bulunmuyor"
          description="Tek bir gün için başlangıç ve bitiş tarihini aynı seçebilirsiniz."
        />
      ) : (
        <div className="activity-list">
          {filtered.flatMap((a, i) => [
            ...(i === 0 || localDay(filtered[i - 1].created_at) !== localDay(a.created_at)
              ? [
                  <div className="activity-day" key={`day-${a.id}`}>
                    {new Intl.DateTimeFormat('tr-TR', {
                      timeZone: 'Europe/Istanbul',
                      dateStyle: 'full',
                    }).format(new Date(a.created_at))}
                  </div>,
                ]
              : []),
            <RecordSurface key={a.id} record={recordFor(a.entity, a.entity_id)}>
              <button className="activity-row" onClick={() => onOpen(a)}>
                <span
                  className={`activity-icon ${a.entity === 'collection' ? 'green' : a.entity === 'sale' ? 'orange' : ''}`}
                >
                  {(() => {
                    const Icon = /iptal|iade/i.test(a.description)
                      ? RotateCcw
                      : (
                          {
                            purchase: Truck,
                            sale: ShoppingBag,
                            collection: HandCoins,
                            expense: Wallet,
                            settings: Settings,
                          } as Record<string, typeof Package>
                        )[a.entity] || Package;
                    return <Icon size={18} />;
                  })()}
                </span>
                <span className="activity-description">
                  <strong>{a.description}</strong>
                  <span>
                    {kindLabel[a.entity] || a.entity} <b>·</b> #
                    {String(a.entity_id).padStart(4, '0')}
                  </span>
                </span>
                <span className="activity-date">
                  {date(a.created_at)}
                  <small>{time(a.created_at)}</small>
                </span>
                <ChevronRight size={15} />
              </button>
            </RecordSurface>,
          ])}
        </div>
      )}
    </>
  );
}
export function CustomerDetail({
  revision,
  data,
  id,
  onEdit,
  onNew,
  onOpen,
  onBack,
  onSave,
}: {
  data: Snapshot;
  id: number;
  revision: number;
  onEdit: () => void;
  onNew: (kind: 'sale' | 'collection' | 'refund' | 'customer_debt' | 'customer_credit') => void;
  onOpen: (a: Activity) => void;
  onBack: () => void;
  onSave: (c: Command) => Promise<void>;
}) {
  const range = usePeriod();
  const [statement, setStatement] = useState<Statement | null>(null);
  const [statementError, setStatementError] = useState('');
  const [offset, setOffset] = useState(0);
  const [productOffset, setProductOffset] = useState(0),
    [creditChoice, setCreditChoice] = useState(false),
    [newProduct, setNewProduct] = useState(false);
  useEffect(() => {
    let alive = true;
    setStatement(null);
    window.desktop.statement({ customerId: id, range, offset, productOffset }).then((r) => {
      if (alive) {
        if (r.ok) {
          setStatement(r.data);
          setStatementError('');
        } else setStatementError(r.error);
      }
    });
    return () => {
      alive = false;
    };
  }, [id, range.start, range.end, offset, productOffset, revision]);
  useEffect(() => {
    setOffset(0);
    setProductOffset(0);
  }, [id, range.start, range.end]);
  const p = data.customers.find((c) => c.id === id);
  if (!p) return <Empty title="Müşteri bulunamadı" />;
  const activities = data.activities.filter((a) => a.customer_id === id);
  return (
    <>
      <Button variant="ghost" onClick={onBack}>
        ← Müşterilere dön
      </Button>
      <div className="customer-header">
        <div className="avatar large">{p.name.slice(0, 2).toLocaleUpperCase('tr')}</div>
        <div>
          <h2>{p.name}</h2>
          <p>{p.address || 'Adres eklenmedi'}</p>
          <p>
            {p.contact || 'Yetkili eklenmedi'} • {p.phone || 'Telefon eklenmedi'}
          </p>
        </div>
        <Button variant="outline" onClick={onEdit}>
          Bilgileri düzenle
        </Button>
      </div>
      <div className="metrics three">
        <Metric
          label="Dönem satış hareketi"
          value={tl(statement?.sales || 0)}
          hint="İptaller düşülmüş toplam"
          icon={<ArrowUpRight size={18} />}
        />
        <Metric
          label="Dönem tahsilatı"
          value={tl(statement?.collections || 0)}
          hint="Geçerli tahsilatlar"
          icon={<ArrowDownLeft size={18} />}
        />
        <Metric
          label={p.balance < 0 ? 'Müşteri alacağı' : 'Kalan borç'}
          value={customerBalance(p.balance)}
          hint={
            p.balance < 0
              ? 'Müşteriye ödenebilecek tutar'
              : 'Tüm cari hareketler dahil güncel bakiye'
          }
          icon={<ReceiptText size={18} />}
          accent
        />
      </div>
      <div className="toolbar">
        <span>Aylık Ekstre / Cari hesap hareketleri</span>
        <Button
          variant="outline"
          onClick={async () => {
            const r = await window.desktop.exportCustomer({ customerId: id, range });
            if (!r.ok) setStatementError(r.error);
            else if (r.data) setStatementError('CSV ekstresi kaydedildi.');
          }}
        >
          CSV müşteri ekstresi
        </Button>
        <div>
          <Button variant="outline" onClick={() => onNew('collection')}>
            Tahsilat al
          </Button>
          {p.balance < 0 && (
            <Button variant="outline" onClick={() => onNew('refund')}>
              Para iadesi yap
            </Button>
          )}
          <details className="account-actions">
            <summary>Cari işlem</summary>
            <div>
              <Button variant="outline" onClick={() => onNew('customer_debt')}>
                Borç ekle
              </Button>
              <Button variant="outline" onClick={() => setCreditChoice(true)}>
                Alacak ekle
              </Button>
            </div>
          </details>
          <Button onClick={() => onNew('sale')}>Yeni satış</Button>
        </div>
      </div>
      {statementError && (
        <p role="status" className="notice">
          {statementError}
        </p>
      )}
      {statement && (
        <>
          <SummaryGrid
            items={[
              { label: 'Dönem başı bakiye', value: customerBalance(statement.opening) },
              { label: 'Dönem sonu bakiye', value: customerBalance(statement.closing) },
              { label: 'Bugünkü güncel bakiye', value: customerBalance(statement.current || 0) },
              { label: 'Brüt satış', value: tl(statement.grossSales || 0) },
              { label: 'Satış iade / iptal', value: tl(statement.salesReturns || 0) },
              { label: 'Net satış', value: tl(statement.sales) },
              { label: 'Tahsilat', value: tl(statement.collections) },
              { label: 'Para iadesi', value: tl(statement.refunds) },
              { label: 'Net cari ekleme', value: tl(statement.adjustments || 0) },
            ]}
          />
          <p className="report-info">
            Oluşturulma: {date(statement.generatedAt || '')} {time(statement.generatedAt || '')} ·
            Geçmiş döneme sonradan eklenen: {statement.lateEntries || 0} hareket. Cari eklemeler
            satış veya tahsilat toplamına dahil değildir.
          </p>
          <DataTable
            headers={['İşlem tarihi', 'Kayıt zamanı', 'Tür', 'Tutar (+ borç / − alacak)', 'Bakiye']}
            empty={!statement.rows.length}
          >
            {statement.rows.map((r) => (
              <TableRow
                key={r.id}
                record={
                  [
                    'sale',
                    'purchase',
                    'collection',
                    'refund',
                    'customer_debt',
                    'customer_credit',
                    'expense',
                    'supplier_payment',
                    'supplier_refund',
                  ].includes(r.kind.replace(/_cancel$/, ''))
                    ? { entity: r.kind.replace(/_cancel$/, '') as any, id: r.entity_id }
                    : undefined
                }
              >
                <TableCell>{date(r.occurred_at)}</TableCell>
                <TableCell>
                  {date(r.recorded_at)} {time(r.recorded_at)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      onOpen({
                        id: r.id,
                        entity: r.kind.replace(/_cancel$/, ''),
                        entity_id: r.entity_id,
                        customer_id: id,
                        description: r.note || '',
                        created_at: r.occurred_at,
                      })
                    }
                  >
                    {kindLabel[r.kind] || r.kind} #{r.entity_id}
                  </Button>
                  {r.category && (
                    <p className="muted">
                      {r.category === 'carry'
                        ? 'Geçmişten devreden borç'
                        : r.category === 'other'
                          ? 'Diğer cari borç'
                          : 'Doğrudan müşteri alacağı'}
                    </p>
                  )}
                  {r.note && <p>{r.note}</p>}
                  {r.reference && <p>Referans: {r.reference}</p>}
                  {r.items?.map((i, index) => (
                    <p className="muted" key={index}>
                      {i.product} · {quantity(i.quantity)} {i.unit} × {tl(i.price)} = {tl(i.total)}
                    </p>
                  ))}
                </TableCell>
                <TableCell>{tl(r.amount)}</TableCell>
                <TableCell>{customerBalance(r.balance)}</TableCell>
              </TableRow>
            ))}
          </DataTable>
          <div className="toolbar">
            <Button
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - 50))}
            >
              Önceki hareketler
            </Button>
            <span>{statement.total} hareket</span>
            <Button
              variant="outline"
              disabled={offset + 50 >= statement.total}
              onClick={() => setOffset((o) => o + 50)}
            >
              Sonraki hareketler
            </Button>
          </div>
        </>
      )}
      {creditChoice && (
        <Dialog open onOpenChange={setCreditChoice}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Alacak türünü seçin</DialogTitle>
              <DialogDescription>
                Para alacağı ile ürün teslim yükümlülüğü ayrı izlenir.
              </DialogDescription>
            </DialogHeader>
            <Button
              onClick={() => {
                setCreditChoice(false);
                onNew('customer_credit');
              }}
            >
              Para alacağı
            </Button>
            <Button
              onClick={() => {
                setCreditChoice(false);
                setNewProduct(true);
              }}
            >
              Ürün alacağı — müşteriye teslim edilecek ürün
            </Button>
          </DialogContent>
        </Dialog>
      )}
      <Suspense fallback={<p>Ürün yükümlülükleri yükleniyor…</p>}>
        <PreordersPanel
          revision={revision}
          customerId={id}
          data={data}
          onSave={onSave}
          createOpen={newProduct}
          onCreateClose={() => setNewProduct(false)}
        />
      </Suspense>
      {statement && (
        <section>
          <h3>Dönem ürün yükümlülükleri</h3>
          <SummaryGrid
            items={[
              ...(statement.openingProducts || []).map((p) => ({
                label: `Dönem başı · ${p.product} (${p.unit})`,
                value: `${quantity(p.quantity)} ${p.unit}`,
              })),
              ...(statement.closingProducts || []).map((p) => ({
                label: `Dönem sonu · ${p.product} (${p.unit})`,
                value: `${quantity(p.quantity)} ${p.unit}`,
              })),
              { label: 'Dönem sonu ayrılmış ödeme', value: tl(statement.reserved || 0) },
            ]}
          />
          <DataTable
            headers={[
              'İşlem tarihi',
              'Kayıt zamanı',
              'Sipariş / hareket',
              'Ürün / miktar',
              'Hareket tutarı',
            ]}
            empty={!statement.productRows?.length}
          >
            {statement.productRows?.map((e) => (
              <TableRow key={`${e.kind}-${e.id}`}>
                <TableCell>{date(e.occurred_at)}</TableCell>
                <TableCell>{date(e.recorded_at)}</TableCell>
                <TableCell>
                  #{e.order_id} · {kindLabel[e.kind]}
                  <p>{e.note}</p>
                </TableCell>
                <TableCell>
                  {e.product} · {quantity(e.quantity)} {e.unit}
                </TableCell>
                <TableCell>{tl(e.amount)}</TableCell>
              </TableRow>
            ))}
          </DataTable>
          <div className="toolbar">
            <Button
              variant="outline"
              disabled={!productOffset}
              onClick={() => setProductOffset((n) => n - 50)}
            >
              Önceki ürün hareketleri
            </Button>
            <span>{statement.productEventTotal || 0} ürün hareketi</span>
            <Button
              variant="outline"
              disabled={productOffset + 50 >= (statement.productEventTotal || 0)}
              onClick={() => setProductOffset((n) => n + 50)}
            >
              Sonraki ürün hareketleri
            </Button>
          </div>
        </section>
      )}
      <Card>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">Tüm Aktiviteler</TabsTrigger>
              <TabsTrigger value="sales">Siparişler</TabsTrigger>
              <TabsTrigger value="payments">Tahsilatlar</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <ActivityList rows={activities} onOpen={onOpen} />
            </TabsContent>
            <TabsContent value="sales">
              <ActivityList rows={activities.filter((a) => a.entity === 'sale')} onOpen={onOpen} />
            </TabsContent>
            <TabsContent value="payments">
              <ActivityList
                rows={activities.filter((a) => a.entity === 'collection' || a.entity === 'refund')}
                onOpen={onOpen}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
export interface Detail {
  entity: string;
  id: number;
}
export function DetailModal({
  value,
  data,
  onClose,
  onCustomer,
  onReverse,
  onReturn,
}: {
  value: Detail;
  data: Snapshot;
  onClose: () => void;
  onCustomer: (id: number) => void;
  onReverse: (r: Reversal) => void;
  onReturn: (id: number) => void;
}) {
  const doc = (
    value.entity === 'sale' ? data.sales : value.entity === 'purchase' ? data.purchases : []
  ).find((d) => d.id === value.id);
  const payment = data.collections.find(
    (p) => p.id === value.id && (value.entity === 'collection' || value.entity === 'refund'),
  );
  const adjustment = data.customerAdjustments?.find(
    (a) => a.id === value.id && a.kind === value.entity,
  );
  const expense = data.cash.find(
    (c) => c.id === value.id && c.kind === 'expense' && value.entity === 'expense',
  );
  const items = (value.entity === 'sale' ? data.saleItems : data.purchaseItems).filter(
    (i) => i.document_id === value.id,
  );
  const logs = data.activities.filter((a) => a.entity === value.entity && a.entity_id === value.id);
  const product =
    value.entity === 'product' ? data.products.find((p) => p.id === value.id) : undefined;
  const supplierPayment = data.supplierPayments.find(
    (p) => p.id === value.id && p.kind === value.entity,
  );
  const supplierReturn =
    value.entity === 'supplier_return'
      ? data.supplierReturns.find((r) => r.id === value.id)
      : undefined;
  const supplier =
    value.entity === 'supplier' ? data.suppliers.find((p) => p.id === value.id) : undefined;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="wide-dialog">
        <DialogHeader>
          <div className="eyebrow">KAYIT DETAYI / #{String(value.id).padStart(4, '0')}</div>
          <DialogTitle>{kindLabel[value.entity] || 'İşlem'} bilgileri</DialogTitle>
          <DialogDescription>Kaydedilen işlem bilgileri ve ilişkili hareketler.</DialogDescription>
        </DialogHeader>
        <div className="detail-body">
          {(payment || expense || supplierPayment || supplierReturn) && (
            <p className="muted">
              İşlem tarihi:{' '}
              {date(
                (payment || expense || supplierPayment || supplierReturn).occurred_at ||
                  (payment || expense || supplierPayment || supplierReturn).created_at,
              )}{' '}
              · Programa kaydedilme:{' '}
              {date(
                (payment || expense || supplierPayment || supplierReturn).recorded_at ||
                  (payment || expense || supplierPayment || supplierReturn).created_at,
              )}{' '}
              {time(
                (payment || expense || supplierPayment || supplierReturn).recorded_at ||
                  (payment || expense || supplierPayment || supplierReturn).created_at,
              )}
            </p>
          )}
          {doc && (
            <>
              <div className="receipt-heading">
                <div>
                  <h3>{doc.party}</h3>
                  <p>{date(doc.occurred_at || doc.created_at)}</p>
                </div>
                <Status status={doc.status} />
              </div>
              <DataTable headers={['Ürün', 'Miktar', 'Birim fiyat', 'Tutar']} empty={!items.length}>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <strong>{i.product}</strong>
                    </TableCell>
                    <TableCell>
                      {quantity(i.quantity)} {i.unit}
                    </TableCell>
                    <TableCell>{tl(i.price)}</TableCell>
                    <TableCell>{tl(i.total)}</TableCell>
                  </TableRow>
                ))}
              </DataTable>
              <div className="receipt-totals">
                {value.entity === 'sale' && (
                  <>
                    <p>
                      Çıkış maliyeti <strong>{tl(doc.cost)}</strong>
                    </p>
                    <p>
                      Brüt kâr <strong>{tl(doc.total - doc.cost)}</strong>
                    </p>
                  </>
                )}
                <p className="total">
                  Toplam <strong>{tl(doc.total)}</strong>
                </p>
              </div>
              <p className="muted">
                İşlem tarihi: {date(doc.occurred_at || doc.created_at)} · Değişmez kayıt zamanı:{' '}
                {date(doc.recorded_at || doc.created_at)} {time(doc.recorded_at || doc.created_at)}
              </p>
              {doc.original_cost !== undefined && doc.original_cost !== doc.cost && (
                <p className="notice">
                  Özgün maliyet: {tl(doc.original_cost)} · Güncel türetilmiş maliyet: {tl(doc.cost)}
                  . Geçmiş kayıt nedeniyle izlenebilir maliyet sürümü uygulanmıştır.
                </p>
              )}
              {doc.reference && <p>Tedarikçi belge numarası: {doc.reference}</p>}
              {doc.free_reason && <p>Bedelsiz işlem: {doc.free_reason}</p>}
              {doc.note && <p className="note">{doc.note}</p>}
              {value.entity === 'purchase' && doc.status === 'active' && (
                <div className="toolbar">
                  <Button
                    variant="outline"
                    onClick={() => {
                      onClose();
                      onReturn(doc.id);
                    }}
                  >
                    Tedarikçiye İade
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      onClose();
                      onReverse({ entity: 'purchase', id: doc.id });
                    }}
                  >
                    Alışı iptal et
                  </Button>
                </div>
              )}
              {value.entity === 'sale' && (
                <div className="toolbar">
                  <Button
                    variant="outline"
                    onClick={() => {
                      onClose();
                      onCustomer(doc.party_id);
                    }}
                  >
                    Müşteri cari hesabını aç
                  </Button>
                  {doc.status === 'active' && (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        onClose();
                        onReverse({ entity: 'sale', id: doc.id });
                      }}
                    >
                      Tam iade / iptal
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
          {adjustment && (
            <>
              <div className="receipt-heading">
                <h3>{adjustment.party}</h3>
                <Status status={adjustment.status} />
              </div>
              <p>
                İşlem tarihi: {date(adjustment.occurred_at || adjustment.created_at)} · Kayıt
                zamanı: {date(adjustment.recorded_at || adjustment.created_at)}{' '}
                {time(adjustment.recorded_at || adjustment.created_at)}
              </p>
              <p>
                {adjustment.category === 'carry'
                  ? 'Geçmişten devreden borç'
                  : adjustment.category === 'other'
                    ? 'Diğer cari borç'
                    : 'Doğrudan müşteri alacağı'}
              </p>
              <div className="form-summary">
                <span>Tutar</span>
                <strong>{tl(adjustment.amount)}</strong>
              </div>
              <p>{adjustment.note}</p>
              <p>Referans: {adjustment.reference || '—'}</p>
              <p className="muted">Bu kayıt stok, satış, kâr veya kasa hareketi oluşturmaz.</p>
              {adjustment.status === 'active' && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    onClose();
                    onReverse({
                      entity: adjustment.kind as 'customer_debt' | 'customer_credit',
                      id: adjustment.id,
                    });
                  }}
                >
                  İşlemi iptal et
                </Button>
              )}
            </>
          )}
          {payment && (
            <>
              <div className="receipt-heading">
                <div>
                  <h3>{payment.party}</h3>
                  <p>
                    {date(payment.created_at)} • {payment.method}
                  </p>
                </div>
                <Status status={payment.status} />
              </div>
              <div className="form-summary total">
                <span>İşlem tutarı</span>
                <strong>{tl(payment.amount)}</strong>
              </div>
              <p>{payment.note || 'Açıklama girilmedi.'}</p>
              <div className="toolbar">
                <Button
                  variant="outline"
                  onClick={() => {
                    onClose();
                    onCustomer(payment.customer_id);
                  }}
                >
                  Müşteri cari hesabını aç
                </Button>
                {payment.status === 'active' && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      onClose();
                      onReverse({
                        entity: payment.kind as 'collection' | 'refund',
                        id: payment.id,
                      });
                    }}
                  >
                    İşlemi iptal et
                  </Button>
                )}
              </div>
            </>
          )}
          {supplierPayment && (
            <>
              <div className="receipt-heading">
                <h3>{supplierPayment.party}</h3>
                <Status status={supplierPayment.status} />
              </div>
              <p>
                {supplierPayment.method} • {supplierPayment.note}
              </p>
              <div className="form-summary total">
                <span>İşlem tutarı</span>
                <strong>{tl(supplierPayment.amount)}</strong>
              </div>
              {supplierPayment.status === 'active' && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    onClose();
                    onReverse({ entity: supplierPayment.kind, id: supplierPayment.id });
                  }}
                >
                  Tedarikçi işlemini iptal et
                </Button>
              )}
            </>
          )}
          {supplierReturn && (
            <>
              <div className="receipt-heading">
                <h3>
                  {supplierReturn.party} • Asıl alış #G-{supplierReturn.purchase_id}
                </h3>
                <Status status={supplierReturn.status} />
              </div>
              <p>{supplierReturn.note}</p>
              <div className="form-summary">
                <span>Cari azaltım: {tl(supplierReturn.total)}</span>
                <span>Çıkan stok maliyeti: {tl(supplierReturn.cost)}</span>
              </div>
              <p>Maliyet farkı: {tl(supplierReturn.total - supplierReturn.cost)}</p>
              {supplierReturn.original_cost !== supplierReturn.cost && (
                <p className="notice">
                  Özgün çıkış maliyeti: {tl(supplierReturn.original_cost)} · İzlenebilir sürümle
                  güncellendi.
                </p>
              )}
              {supplierReturn.status === 'active' && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    onClose();
                    onReverse({ entity: 'supplier_return', id: supplierReturn.id });
                  }}
                >
                  Tedarikçi iadesini iptal et
                </Button>
              )}
            </>
          )}
          {expense && (
            <>
              <div className="form-summary total">
                <span>{expense.note}</span>
                <strong>{tl(-expense.amount)}</strong>
              </div>
              <p>{date(expense.occurred_at || expense.created_at)}</p>
              {!data.cash.some((c) => c.reverses_id === expense.id) && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    onClose();
                    onReverse({ entity: 'expense', id: expense.id });
                  }}
                >
                  Gideri iptal et
                </Button>
              )}
            </>
          )}
          {product && (
            <div className="form-summary">
              <span>{product.name}</span>
              <strong>
                {quantity(product.stock)} {product.unit} • {tl(product.cost)} stok değeri
              </strong>
            </div>
          )}
          {supplier && (
            <div>
              <h3>{supplier.name}</h3>
              <p>{supplier.address}</p>
              <p>
                {supplier.contact} • {supplier.phone}
              </p>
            </div>
          )}
          <h3 className="section-label">Kayıt geçmişi</h3>
          {logs.map((a) => (
            <div className="detail-log" key={a.id}>
              <small>
                İşlem tarihi: {date(a.created_at)} · Programa kaydedilme:{' '}
                {date(a.recorded_at || a.created_at)} {time(a.recorded_at || a.created_at)}
              </small>
              <p>{a.description}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
