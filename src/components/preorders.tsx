import { useDebouncedValue } from '../lib/use-debounced-value';
import { RecordSurface, recordFor } from './record-actions';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  decimal,
  roundedRatio,
  type Command,
  type Snapshot,
  type Preorder,
  type PreorderEvent,
} from '../../shared/contracts';
import { turkeyDay } from '../../shared/dates';
import { tl, quantity, date, kindLabel } from '../lib/format';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from './ui/table';
import { SearchableChoice, type Choice } from './searchable';
import { Field, SelectField } from './form-fields';
import { DateField } from './calendar';
import { useDraftGuard } from './draft-guard';
import { SummaryGrid } from './summary-grid';
type Save = (c: Command) => Promise<void>;
function Editor({
  title,
  children,
  onClose,
  submit,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  submit: (f: FormData, operationId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const lock = useRef(false);
  const op = useRef(crypto.randomUUID());
  const guard = useDraftGuard(onClose, busy);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await submit(new FormData(e.currentTarget), op.current);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem kaydedilemedi.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) guard.requestClose();
      }}
    >
      <DialogContent className="editor-dialog" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            İşlemler ürün ve para bakiyelerine ayrı kaydedilir. Tarih ve miktarları kontrol edin.
          </DialogDescription>
        </DialogHeader>
        <form className="editor-form" onSubmit={save} onChangeCapture={guard.markDirty}>
          <div className="form-scroll">
            <fieldset disabled={busy}>
              {children}
              <DateField label="İşlem tarihi" name="occurredOn" initial={turkeyDay()} />
              <Label htmlFor="fulfillment-note">Açıklama</Label>
              <Textarea id="fulfillment-note" name="note" required maxLength={1000} />
            </fieldset>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer className="form-footer">
            <Button variant="outline" type="button" disabled={busy} onClick={guard.requestClose}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </footer>
        </form>
        {guard.confirmation}
      </DialogContent>
    </Dialog>
  );
}
async function lookup(kind: 'products' | 'customers', search: string): Promise<Choice[]> {
  const r = await window.desktop.lookup({ kind, search });
  if (!r.ok) throw new Error(r.error);
  return r.data.map((p) => ({
    value: String(p.id),
    label: kind === 'products' ? `${p.name} (${p.unit})` : p.name,
    record: p,
  }));
}
export function NewProductDebt({
  customerId,
  data,
  onSave,
  onClose,
}: {
  customerId?: number;
  data: Snapshot;
  onSave: Save;
  onClose: () => void;
}) {
  const [customer, setCustomer] = useState(String(customerId || '')),
    [product, setProduct] = useState(''),
    [p, setP] = useState<any>(null),
    [source, setSource] = useState('prepaid'),
    [price, setPrice] = useState(''),
    [qty, setQty] = useState('');
  let total: number | null = null;
  try {
    if (price && qty) total = roundedRatio(decimal(qty, 3), decimal(price, 2), 1000);
  } catch {
    /* Save validates exact decimals. */
  }
  return (
    <Editor
      title="Ürün alacağı / ön sipariş"
      onClose={onClose}
      submit={async (f, operationId) => {
        await onSave({
          type: 'preorder',
          operationId,
          customerId: Number(customer),
          productId: Number(product),
          quantity: decimal(qty, 3),
          price: source === 'other' ? 0 : decimal(price, 2),
          source: source as 'prepaid' | 'other',
          note: String(f.get('note') || ''),
          occurredOn: String(f.get('occurredOn')),
          reference: String(f.get('reference') || ''),
          plannedOn: String(f.get('plannedOn') || ''),
        });
      }}
    >
      <SearchableChoice
        label="Müşteri"
        value={customer}
        onChange={setCustomer}
        options={data.customers.map((c) => ({ value: String(c.id), label: c.name }))}
        load={(s) => lookup('customers', s)}
      />
      <SearchableChoice
        label="Ürün"
        value={product}
        onChange={(v, r) => {
          setProduct(v);
          const record = r || data.products.find((p) => p.id === Number(v));
          setP(record || null);
          if (record) setPrice(String(record.price / 100).replace('.', ','));
        }}
        options={data.products.map((p) => ({
          value: String(p.id),
          label: `${p.name} (${p.unit})`,
          record: p,
        }))}
        load={(s) => lookup('products', s)}
      />
      <p>
        Birim: {p?.unit || 'Ürün seçin'} · Fiziksel stok: {p ? quantity(p.stock) : '—'} {p?.unit}
      </p>
      <SelectField label="Kaynak" name="source" initial="prepaid" onChange={setSource}>
        <option value="prepaid">Ön ödemeli sipariş</option>
        <option value="other">Diğer ürün borcu</option>
      </SelectField>
      <Label htmlFor="pre-qty">Miktar</Label>
      <Input id="pre-qty" required value={qty} onChange={(e) => setQty(e.target.value)} />
      {source === 'prepaid' ? (
        <>
          <Label htmlFor="pre-price">Anlaşılan birim fiyat (TL)</Label>
          <Input id="pre-price" required value={price} onChange={(e) => setPrice(e.target.value)} />
          <p className="notice">
            Sabit sipariş bedeli: {total === null ? '—' : tl(total)}. Fiyat değişiklikleri bu
            siparişi değiştirmez. Ödeme sonraki adımda ayrıca bağlanır.
          </p>
        </>
      ) : (
        <p className="notice">
          Para borcu veya satış oluşturmaz. Teslim maliyeti “Diğer ürün borcu maliyeti” olarak
          ayrıca raporlanır.
        </p>
      )}
      <Field label="Belge / referans numarası" name="reference" required={false} maxLength={100} />
      <Label htmlFor="plannedOn">Planlanan teslim tarihi (isteğe bağlı)</Label>
      <Input id="plannedOn" name="plannedOn" type="date" />
      <p className="muted">Sipariş oluştururken stok düşmez ve stok bulunması gerekmez.</p>
    </Editor>
  );
}
type Action = {
  kind: 'pay' | 'deliver' | 'cancel' | 'return' | 'unallocate';
  order: Preorder;
  event?: PreorderEvent;
};
function ActionEditor({
  action,
  onClose,
  onSave,
}: {
  action: Action;
  onClose: () => void;
  onSave: Save;
}) {
  const { order: o, kind, event } = action;
  const [mode, setMode] = useState('new'),
    [payments, setPayments] = useState<any[]>([]),
    [payOffset, setPayOffset] = useState(0),
    [paySearch, setPaySearch] = useState(''),
    [payError, setPayError] = useState('');
  useEffect(() => {
    let alive = true;
    if (kind === 'pay' && mode === 'collection')
      window.desktop
        .snapshot({
          page: 'collections',
          customerId: o.customer_id,
          range: {},
          offset: payOffset,
          search: paySearch,
        })
        .then((r) => {
          if (!alive) return;
          if (r.ok) {
            setPayments(
              r.data.collections.filter((p) => p.kind === 'collection' && p.status === 'active'),
            );
            setPayError('');
          } else setPayError(r.error);
        });
    return () => {
      alive = false;
    };
  }, [kind, mode, o.customer_id, payOffset, paySearch]);
  const title = {
    pay: 'Siparişe ödeme bağla',
    deliver: 'Ürün teslim et',
    cancel: 'Teslim edilmemiş kısmı iptal et',
    return: 'Teslimatı fiziksel iadeyle geri al',
    unallocate: 'Ödeme bağlantısını iptal et',
  }[kind];
  return (
    <Editor
      title={title}
      onClose={onClose}
      submit={async (f, operationId) => {
        const note = String(f.get('note') || ''),
          occurredOn = String(f.get('occurredOn'));
        const common = { operationId, note, occurredOn };
        let c: Command;
        if (kind === 'pay')
          c = {
            type: 'preorder_allocate',
            ...common,
            orderId: o.id,
            amount: decimal(String(f.get('amount')), 2),
            mode: mode as 'new' | 'advance' | 'collection',
            ...(mode === 'new'
              ? { method: String(f.get('method')) as 'Nakit' | 'Banka' | 'Kart' }
              : {}),
            ...(mode === 'collection' ? { collectionId: Number(f.get('collection')) } : {}),
          };
        else if (kind === 'deliver' || kind === 'cancel')
          c = {
            type: kind === 'deliver' ? 'preorder_delivery' : 'preorder_cancel',
            ...common,
            orderId: o.id,
            quantity: decimal(String(f.get('quantity')), 3),
          };
        else if (kind === 'return') {
          if (f.get('physical') !== 'on')
            throw new Error('Ürünün fiziksel geri dönüşünü onaylayın.');
          c = { type: 'preorder_return', ...common, deliveryId: event!.id, physicalReturn: true };
        } else c = { type: 'preorder_unallocate', ...common, allocationId: event!.id };
        await onSave(c);
      }}
    >
      <p>
        <strong>
          #{o.id} · {o.customer}
          {o.corrected && <p>Düzeltildi · yeni kayıt bağlı</p>} · {o.product}
        </strong>
      </p>
      <p>
        Kalan teslim: {quantity(o.remaining)} {o.unit} · Fiziksel stok: {quantity(o.stock)} {o.unit}
      </p>
      {kind === 'pay' && (
        <>
          <p>
            Sipariş bedeli: {tl(o.target)} · Yapılan ödeme: {tl(o.paid)} · Kalan ödeme:{' '}
            {tl(o.target - o.paid)}
          </p>
          <p>
            Kullanılabilir para avansı: {tl(Math.max(0, -(o.free_balance || 0)))}. Siparişe ayrılan:{' '}
            {tl(o.reserved)}.
          </p>
          <SelectField label="Ödeme yolu" name="mode" initial="new" onChange={setMode}>
            <option value="new">Yeni ödeme al ve bağla</option>
            <option value="advance">Kullanılabilir para avansından ayır</option>
            <option value="collection">Mevcut tahsilatı bağla</option>
          </SelectField>
          <Field
            label="Ödeme tutarı (TL)"
            name="amount"
            initial={String((o.target - o.paid) / 100).replace('.', ',')}
          />
          {mode === 'new' && (
            <SelectField label="Ödeme yöntemi" name="method" initial="Nakit">
              <option>Nakit</option>
              <option>Banka</option>
              <option>Kart</option>
            </SelectField>
          )}
          {mode === 'collection' && (
            <>
              <Label htmlFor="payment-search">Tahsilat açıklaması ara</Label>
              <Input
                id="payment-search"
                value={paySearch}
                onChange={(e) => {
                  setPaySearch(e.target.value);
                  setPayOffset(0);
                }}
              />
              <SelectField
                key={`${payOffset}-${paySearch}`}
                label="Mevcut tahsilat"
                name="collection"
              >
                <option value="">Tahsilat seçin</option>
                {payments.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id} · {date(p.occurred_at || p.created_at)} · Bağlanabilir{' '}
                    {tl(Math.max(0, p.amount - (p.allocated || 0)))} · {p.note}
                  </option>
                ))}
              </SelectField>
              <div className="toolbar">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!payOffset}
                  onClick={() => setPayOffset((n) => n - 50)}
                >
                  Önceki tahsilatlar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={payments.length < 50}
                  onClick={() => setPayOffset((n) => n + 50)}
                >
                  Sonraki tahsilatlar
                </Button>
              </div>
              {payError && <p role="alert">{payError}</p>}
            </>
          )}
          <p className="notice">
            Yalnız yeni ödeme kasaya girer. Yeni ödemede sipariş bedelini aşan kısım serbest avans
            olarak kalır. Mevcut avans/tahsilat tekrar kasaya yazılmaz.
          </p>
        </>
      )}
      {(kind === 'deliver' || kind === 'cancel') && (
        <Field
          label={kind === 'deliver' ? 'Teslim edilecek miktar' : 'İptal edilecek miktar'}
          name="quantity"
          initial={String(o.remaining / 1000).replace('.', ',')}
        />
      )}
      {kind === 'deliver' && (
        <p className="notice">
          {o.source === 'other' ? (
            'Bedelli satış veya para borcu oluşmaz. Stok maliyeti ayrı “Diğer ürün borcu teslim maliyeti” olarak raporlanır.'
          ) : (
            <>
              Anlaşılan birim fiyat: {tl(o.price)}/{o.unit}. Ayrılmış ödeme uygulanır; ikinci
              tahsilat yapılmaz. Ödenmemiş teslim bedeli cari borca geçer.
            </>
          )}
        </p>
      )}
      {kind === 'cancel' && (
        <p className="notice">
          Stok ve kasa değişmez. Kullanılmamış tahsis serbest para avansına döner. Para ödemek için
          ayrıca Para iadesi yap kullanın.
        </p>
      )}
      {kind === 'return' && (
        <>
          <p>
            Teslimat #{event!.id}: {quantity(event!.quantity)} {o.unit}. Bu kaydın tamamı geri
            alınır; stok ve maliyeti ters çevrilir.
          </p>
          <label>
            <input type="checkbox" name="physical" required /> Ürün fiziksel olarak geri alındı
          </label>
        </>
      )}
      {kind === 'unallocate' && (
        <p>
          Ödeme bağlantısı #{event!.id} · İlk bağlanan tutar: {tl(event!.amount)}. Kalan bağlantı
          geri alınır; kullanılmamış kısmı serbest avansa döner. Teslim bedelini kapatan ödeme genel
          cari hesapta kalır. Kasa ve stok değişmez; gerçek tahsilatı iptal etmek ayrı işlemdir.
        </p>
      )}
    </Editor>
  );
}
function History({
  order,
  onAction,
  revision,
}: {
  order: Preorder;
  onAction: (a: Action) => void;
  revision: unknown;
}) {
  const [events, setEvents] = useState<PreorderEvent[]>([]),
    [offset, setOffset] = useState(0),
    [total, setTotal] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    window.desktop
      .snapshot({
        page: 'preorders',
        preorderId: order.id,
        range: {},
        offset: 0,
        eventOffset: offset,
      })
      .then((r) => {
        if (!alive) return;
        if (r.ok) {
          setEvents(r.data.preorderEvents || []);
          setTotal(r.data.fulfillmentEventCount || 0);
          setError('');
        } else setError(r.error);
      });
    return () => {
      alive = false;
    };
  }, [order.id, offset, revision]);
  return (
    <div className="preorder-history">
      <h4>Sipariş #{order.id} hareketleri</h4>
      {error && <p role="alert">{error}</p>}
      {events.map((e) => (
        <RecordSurface key={e.id} record={recordFor(e.kind, e.id)}>
          <div className="preorder-event">
            <span>
              {date(e.occurred_at)} · {kindLabel[e.kind]} #{e.id} · {quantity(e.quantity)}{' '}
              {order.unit} · {tl(e.amount)}
              <small className="muted">
                {' '}
                Kayıt: {date(e.recorded_at)} · {e.note}
                {e.sale_id ? ` · Satış #${e.sale_id}` : ''}
                {e.collection_id ? ` · Tahsilat #${e.collection_id}` : ''}
              </small>
            </span>

            {e.kind === 'preorder_delivery' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAction({ kind: 'return', order, event: e })}
              >
                Fiziksel iade
              </Button>
            )}
            {e.kind === 'preorder_allocate' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAction({ kind: 'unallocate', order, event: e })}
              >
                Bağlantıyı iptal et
              </Button>
            )}
          </div>
        </RecordSurface>
      ))}
      <div className="toolbar">
        <Button variant="outline" disabled={!offset} onClick={() => setOffset((n) => n - 50)}>
          Önceki sipariş hareketleri
        </Button>
        <span>{total} hareket</span>
        <Button
          variant="outline"
          disabled={offset + 50 >= total}
          onClick={() => setOffset((n) => n + 50)}
        >
          Sonraki sipariş hareketleri
        </Button>
      </div>
    </div>
  );
}
export function PreordersPanel({
  revision,
  customerId,
  data,
  onSave,
  createOpen = false,
  onCreateClose = () => {},
}: {
  customerId?: number;
  data: Snapshot;
  onSave: Save;
  revision: number;
  createOpen?: boolean;
  onCreateClose?: () => void;
}) {
  const [result, setResult] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [search, setSearch] = useState(''),
    [offset, setOffset] = useState(0),
    [pending, setPending] = useState(!customerId),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [plannedFrom, setPlannedFrom] = useState(''),
    [plannedTo, setPlannedTo] = useState(''),
    [create, setCreate] = useState(false),
    [action, setAction] = useState<Action | null>(null),
    [expanded, setExpanded] = useState<number | null>(null);
  const querySearch = useDebouncedValue(search, 150, String(customerId || ''));
  useEffect(() => setOffset(0), [customerId, search, pending, start, end, plannedFrom, plannedTo]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    window.desktop
      .snapshot({
        page: 'preorders',
        customerId,
        search: querySearch,
        range: { start: start || undefined, end: end || undefined },
        offset,
        pendingOnly: pending,
        plannedFrom,
        plannedTo,
      })
      .then((r) => {
        if (!alive) return;
        setLoading(false);
        if (r.ok) {
          setResult(r.data);
          setError('');
        } else setError(r.error);
      });
    return () => {
      alive = false;
    };
  }, [customerId, revision, querySearch, offset, pending, start, end, plannedFrom, plannedTo]);
  const rows = result?.preorders || [];
  const save: Save = async (c) => {
    await onSave(c);
  };
  return (
    <section className="preorders-panel">
      <div className="toolbar">
        <h3>{customerId ? 'Müşteriye teslim edilecek ürünler' : 'Bekleyen teslimatlar'}</h3>
        <Button onClick={() => setCreate(true)}>Ürün alacağı / ön sipariş ekle</Button>
      </div>
      {customerId && result?.fulfillmentSummary && (
        <SummaryGrid
          items={[
            { label: 'Müşterinin bize para borcu', value: tl(result.fulfillmentSummary.debt) },
            {
              label: 'Kullanılabilir para alacağı / avansı',
              value: tl(result.fulfillmentSummary.available),
            },
            { label: 'Siparişlere ayrılmış ödeme', value: tl(result.fulfillmentSummary.reserved) },
            {
              label: 'Açık ürün yükümlülüğü',
              value: String(result.fulfillmentSummary.pending),
              hint: 'Miktarlar aşağıda ürün ve birim bazındadır.',
            },
          ]}
        />
      )}
      <div className="preorder-filters">
        <label>
          Müşteri / ürün / referans ara
          <Input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          Sipariş başlangıcı
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          Sipariş bitişi
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label>
          Planlanan teslim başlangıcı
          <Input type="date" value={plannedFrom} onChange={(e) => setPlannedFrom(e.target.value)} />
        </label>
        <label>
          Planlanan teslim bitişi
          <Input type="date" value={plannedTo} onChange={(e) => setPlannedTo(e.target.value)} />
        </label>
        <label>
          <input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} />{' '}
          Yalnız bekleyenler
        </label>
      </div>
      {result?.fulfillmentProducts && (
        <SummaryGrid
          items={result.fulfillmentProducts.map((p) => ({
            label: `Bekleyen · ${p.product} (${p.unit})`,
            value: `${quantity(p.quantity)} ${p.unit}`,
          }))}
        />
      )}
      {error ? (
        <p className="error-box" role="alert">
          {error}
        </p>
      ) : loading ? (
        <p role="status">Ürün yükümlülükleri yükleniyor…</p>
      ) : (
        <>
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    'Sipariş / müşteri',
                    'Ürün / teslim yükümlülüğü',
                    'Fiziksel stok',
                    'Sabit fiyat / bedel',
                    'Ödeme',
                    'Teslim durumu',
                    'İşlemler',
                  ].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => (
                  <TableRow key={o.id} record={{ entity: 'preorder', id: o.id }}>
                    <TableCell>
                      #{o.id} · {o.customer}
                      <p>{date(o.occurred_at || o.created_at)}</p>
                      {o.planned_on && <p>Plan: {o.planned_on.split('-').reverse().join('.')}</p>}
                      <p>{o.reference}</p>
                    </TableCell>
                    <TableCell>
                      <strong>
                        {o.product}: {quantity(o.remaining)} {o.unit} teslim edilecek
                      </strong>
                      <p>
                        {quantity(o.quantity)} {o.unit} sipariş · {quantity(o.delivered)} teslim ·{' '}
                        {quantity(o.cancelled)} iptal
                      </p>
                      <p>{o.source === 'other' ? 'Diğer ürün borcu' : 'Ön ödemeli sipariş'}</p>
                    </TableCell>
                    <TableCell>
                      {quantity(o.stock)} {o.unit}
                    </TableCell>
                    <TableCell>
                      {o.source === 'other' ? (
                        'Bedelli satış değil'
                      ) : (
                        <>
                          {tl(o.price)}/{o.unit}
                          <p>Anlaşılan bedel: {tl(o.total)}</p>
                          {o.target !== o.total && <p>İptal sonrası bedel: {tl(o.target)}</p>}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      {o.source === 'other' ? (
                        'Para işlemi yok'
                      ) : (
                        <>
                          <strong>
                            {o.target === 0
                              ? 'Ödeme gerekmiyor'
                              : o.paid >= o.target
                                ? 'Ödendi'
                                : o.paid > 0
                                  ? 'Kısmen ödendi'
                                  : 'Ödenmedi'}
                          </strong>
                          <p>Ödenen: {tl(o.paid)}</p>
                          <p>Kalan: {tl(o.target - o.paid)}</p>
                          <p>Ayrılmış: {tl(o.reserved)}</p>
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      {o.remaining === 0
                        ? o.cancelled > 0
                          ? 'İptal'
                          : 'Tamamlandı'
                        : o.delivered > 0
                          ? 'Kısmen teslim edildi'
                          : 'Teslim bekliyor'}
                    </TableCell>
                    <TableCell>
                      <div className="preorder-actions">
                        {o.remaining > 0 && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => setAction({ kind: 'deliver', order: o })}
                            >
                              Ürün teslim et
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAction({ kind: 'cancel', order: o })}
                            >
                              Kalanı iptal et
                            </Button>
                          </>
                        )}
                        {o.source === 'prepaid' && o.paid < o.target && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAction({ kind: 'pay', order: o })}
                          >
                            Ödeme bağla
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                        >
                          Sipariş hareketleri
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!rows.length && <p>Filtrelerle eşleşen ürün yükümlülüğü yok.</p>}
          <div className="toolbar">
            <Button variant="outline" disabled={!offset} onClick={() => setOffset((n) => n - 50)}>
              Önceki siparişler
            </Button>
            <span>{result?.pagination?.total || 0} kayıt</span>
            <Button
              variant="outline"
              disabled={offset + 50 >= (result?.pagination?.total || 0)}
              onClick={() => setOffset((n) => n + 50)}
            >
              Sonraki siparişler
            </Button>
          </div>
          {expanded && rows.find((o) => o.id === expanded) && (
            <History
              order={rows.find((o) => o.id === expanded)!}
              revision={result}
              onAction={setAction}
            />
          )}
        </>
      )}
      {(create || createOpen) && (
        <NewProductDebt
          customerId={customerId}
          data={data}
          onSave={save}
          onClose={() => {
            setCreate(false);
            onCreateClose();
          }}
        />
      )}
      {action && <ActionEditor action={action} onSave={save} onClose={() => setAction(null)} />}
    </section>
  );
}
