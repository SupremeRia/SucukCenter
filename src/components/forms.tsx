import { Field, SelectField, FormErrorsContext } from './form-fields';
import { useRef, useState, useEffect, type FormEvent } from 'react';
import { SearchableChoice } from './searchable';
import { DateField } from './calendar';
import { useDraftGuard } from './draft-guard';
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from './ui/alert-dialog';
import {
  decimal,
  roundedRatio,
  type Command,
  type Snapshot,
  type Party,
  type Product,
} from '../../shared/contracts';
import { date, tl, quantity, customerBalance } from '../lib/format';
import { turkeyDay } from '../../shared/dates';

export type FormKind =
  | 'customer_debt'
  | 'customer_credit'
  | 'product'
  | 'customer'
  | 'supplier'
  | 'purchase'
  | 'sale'
  | 'collection'
  | 'refund'
  | 'expense'
  | 'adjust'
  | 'supplier_payment'
  | 'supplier_refund';
export interface FormSpec {
  kind: FormKind;
  record?: Party | Product;
  customerId?: number;
  supplierId?: number;
  correction?: import('../../shared/contracts').RecordInfo;
}
const titles: Record<FormKind, string> = {
  customer_debt: 'Borç ekle',
  customer_credit: 'Alacak ekle',
  supplier_payment: 'Tedarikçiye ödeme',
  supplier_refund: 'Tedarikçiden para iadesi',
  product: 'Ürün bilgileri',
  customer: 'Müşteri bilgileri',
  supplier: 'Tedarikçi bilgileri',
  purchase: 'Yeni gelen sipariş',
  sale: 'Yeni müşteri satışı',
  collection: 'Tahsilat kaydet',
  refund: 'Müşteriye para iadesi',
  expense: 'Gider kaydet',
  adjust: 'Stok kaybı kaydet',
};
const descriptions: Record<FormKind, string> = {
  customer_debt: 'Satış, stok veya kasa oluşturmadan cari borç kaydedin.',
  customer_credit: 'Fiilî ödeme olmadan müşterinin sizden alacağını kaydedin.',
  supplier_payment: 'Kısmi veya sonradan ödemeyi cari hesaba ve kasaya birlikte kaydedin.',
  supplier_refund: 'Tedarikçideki alacağınız için alınan para iadesini kaydedin.',
  product: 'Ürünün birimini, satış fiyatını ve kritik stok seviyesini belirleyin.',
  customer: 'Firma ve iletişim bilgilerini kaydedin.',
  supplier: 'Mal alımı yaptığınız firmanın bilgilerini kaydedin.',
  purchase: 'Onaylandığında ürünler maliyetleriyle birlikte depoya girer.',
  sale: 'Onaylandığında stok düşer ve müşteri cari hesabına borç işlenir.',
  collection: 'Borcu kapatır; fazla tutar müşteri avansı olarak kalır.',
  refund: 'Müşterinin sizden alacağı tutarı kasadan ödeyin.',
  expense: 'Nakliye, kira ve diğer işletme giderlerini kaydedin.',
  adjust:
    'Fire veya kayıp ürünleri gerekçesiyle stoktan çıkarın. Stok artışı için gelen sipariş kullanın.',
};
interface DraftLine {
  key: number;
  productId: string;
  quantity: string;
  price: string;
}
export function FormModal({
  spec,
  data,
  onClose,
  onSave,
}: {
  spec: FormSpec;
  data: Snapshot;
  onClose: () => void;
  onSave: (c: Command) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [correctionInfo, setCorrectionInfo] = useState(spec.correction);
  const initial = correctionInfo?.original as any;
  const [free, setFree] = useState(!!initial?.free),
    [paid, setPaid] = useState(!!initial?.paid);
  const guard = useDraftGuard(onClose, busy);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const requestClose = guard.requestClose;
  const lock = useRef(false);
  const operationId = useRef(crypto.randomUUID());
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{
    command: Command;
    impact: import('../../shared/contracts').CostImpact;
  } | null>(null);
  const nextKey = useRef(initial?.lines?.length || 1);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, any>>({});
  const [lines, setLines] = useState<DraftLine[]>([
    ...(initial?.lines
      ? initial.lines.map((l: any, i: number) => ({
          key: i,
          productId: String(l.productId),
          quantity: String(l.quantity / 1000),
          price: String(l.price / 100),
        }))
      : [{ key: 0, productId: '', quantity: '1', price: '' }]),
  ]);
  const [partyId, setPartyId] = useState(
    String(initial?.supplierId || initial?.customerId || spec.supplierId || spec.customerId || ''),
  );
  const k = spec.kind;
  const [amountText, setAmountText] = useState(initial?.amount ? String(initial.amount / 100) : '');
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    setBalance(null);
    if (partyId && ['collection', 'refund', 'customer_debt', 'customer_credit'].includes(k))
      window.desktop
        .lookup({ kind: 'customers', search: '', selected: Number(partyId) })
        .then((r) => {
          if (!alive) return;
          if (r.ok) setBalance(r.data.find((p) => p.id === Number(partyId))?.balance ?? null);
          else setError(r.error);
        });
    return () => {
      alive = false;
    };
  }, [partyId, k]);
  let entered: number | null = null;
  try {
    if (amountText) entered = decimal(amountText, 2);
  } catch {
    /* Inline validation on save. */
  }
  const record = spec.record;
  const update = (key: number, patch: Partial<DraftLine>) =>
    setLines((old) => old.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  let preview = 0;
  try {
    for (const l of lines)
      if (l.price && l.quantity)
        preview += roundedRatio(decimal(l.quantity, 3), decimal(l.price, 2), 1000);
  } catch {
    preview = 0;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const form = new FormData(event.currentTarget);
      const str = (name: string) => String(form.get(name) || '');
      const number = (value: string, places: number, key: string) => {
        try {
          const n = decimal(value, places);
          if ((key === 'amount' || key === 'quantity' || key.startsWith('qty-')) && n <= 0)
            throw new Error('Tutar veya miktar sıfırdan büyük olmalı.');
          return n;
        } catch (e) {
          setFieldErrors((old) => ({ ...old, [key]: (e as Error).message }));
          throw new Error('İşaretli alanı kontrol edin. ' + (e as Error).message);
        }
      };
      let c: Command;
      if (k === 'product')
        c = {
          type: k,
          id: record?.id,
          name: str('name'),
          unit: str('unit') as Product['unit'],
          price: number(str('price'), 2, 'price'),
          critical: number(str('critical'), 3, 'critical'),
          active: form.get('active') === 'on',
          defaultSupplierId: Number(str('defaultSupplier')) || null,
        };
      else if (k === 'customer' || k === 'supplier')
        c = {
          type: k,
          id: record?.id,
          name: str('name'),
          address: str('address'),
          contact: str('contact'),
          phone: str('phone'),
        };
      else if (k === 'purchase' || k === 'sale') {
        const items = lines.map((l) => ({
          productId: Number(l.productId),
          quantity: number(l.quantity, 3, `qty-${l.key}`),
          price: number(l.price, 2, `price-${l.key}`),
        }));
        if (items.some((i) => i.price === 0) && !free) {
          setFieldErrors(
            Object.fromEntries(
              lines
                .filter((_, i) => items[i].price === 0)
                .map((l) => [
                  `price-${l.key}`,
                  'Sıfır fiyat için Bedelsiz işlem seçin ve gerekçe yazın.',
                ]),
            ),
          );
          throw new Error('Sıfır fiyat için Bedelsiz işlem seçimi ve gerekçe gerekli.');
        }
        c =
          k === 'purchase'
            ? {
                type: k,
                supplierId: Number(str('party')),
                lines: items,
                paid: form.get('paid') === 'on',
                note: str('note'),
                reference: str('reference'),
                method: paid ? (str('method') as 'Nakit' | 'Banka' | 'Kart') : undefined,
                free: form.get('free') === 'on',
                freeReason: free ? str('freeReason') : undefined,
              }
            : {
                type: k,
                customerId: Number(str('party')),
                lines: items,
                note: str('note'),
                free: form.get('free') === 'on',
                freeReason: free ? str('freeReason') : undefined,
              };
      } else if (k === 'supplier_payment' || k === 'supplier_refund')
        c = {
          type: k,
          supplierId: Number(str('party')),
          amount: number(str('amount'), 2, 'amount'),
          method: str('method') as 'Nakit' | 'Banka' | 'Kart',
          note: str('note'),
        };
      else if (k === 'customer_debt' || k === 'customer_credit')
        c =
          k === 'customer_debt'
            ? {
                type: k,
                customerId: Number(str('party')),
                amount: number(str('amount'), 2, 'amount'),
                category: str('category') as 'carry' | 'other',
                note: str('note'),
                reference: str('reference'),
              }
            : {
                type: k,
                customerId: Number(str('party')),
                amount: number(str('amount'), 2, 'amount'),
                note: str('note'),
                reference: str('reference'),
              };
      else if (k === 'collection' || k === 'refund')
        c = {
          type: k,
          customerId: Number(str('party')),
          amount: number(str('amount'), 2, 'amount'),
          method: str('method') as 'Nakit' | 'Banka' | 'Kart',
          note: str('note'),
        };
      else if (k === 'expense')
        c = {
          type: k,
          name: str('expenseName'),
          method: str('method') as 'Nakit' | 'Banka' | 'Kart',
          amount: number(str('amount'), 2, 'amount'),
          note: str('note'),
        };
      else
        c = {
          type: 'adjust',
          productId: Number(str('product')),
          quantity: -number(str('quantity'), 3, 'quantity'),
          reason: str('note'),
        };
      if ('operationId' in c || !['product', 'customer', 'supplier'].includes(c.type))
        c = {
          ...c,
          operationId: operationId.current,
          occurredOn: str('occurredAt'),
        } as Command;
      if (correctionInfo) {
        if (correctionInfo.blocked) throw new Error(correctionInfo.blocked);
        const reason = str('correctionReason');
        c = {
          type: 'correct',
          operationId: operationId.current,
          entity: correctionInfo.ref.entity,
          id: correctionInfo.ref.id,
          expected: correctionInfo.expected,
          reason,
          replacement: c as any,
        };
        const impact = await window.desktop.preview(c);
        if (!impact.ok) throw new Error(impact.error);
        setPending({ command: c, impact: impact.data });
        return;
      }
      await onSave(c);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const person = record as Party | undefined;
  const product = record as Product | undefined;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <DialogContent
        className={`editor-dialog ${k === 'sale' || k === 'purchase' ? 'wide-dialog' : ''}`}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="eyebrow">SUCUKCENTER / YENİ KAYIT</div>
          <DialogTitle>
            {spec.correction ? 'Düzelt · ' : ''}
            {titles[k]}
          </DialogTitle>
          <DialogDescription>{descriptions[k]}</DialogDescription>
        </DialogHeader>
        <FormErrorsContext.Provider value={fieldErrors}>
          <form
            onSubmit={submit}
            className="form-body"
            onInvalidCapture={(e) => {
              const target = e.target as HTMLInputElement;
              if (target.name)
                setFieldErrors((old) => ({
                  ...old,
                  [target.name]: target.validationMessage || 'Bu alanı doldurun.',
                }));
            }}
            onChangeCapture={(e) => {
              guard.markDirty();
              setError('');
              const target: EventTarget = e.target;
              const key =
                target instanceof HTMLInputElement ||
                target instanceof HTMLSelectElement ||
                target instanceof HTMLTextAreaElement
                  ? target.name || target.id
                  : '';
              setFieldErrors((old) => {
                if (!old[key]) return old;
                const next = { ...old };
                delete next[key];
                return next;
              });
            }}
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest('[role="option"],[data-day]'))
                guard.markDirty();
            }}
          >
            <div className="form-scroll">
              <fieldset disabled={busy}>
                {spec.correction && <Field label="Düzeltme gerekçesi" name="correctionReason" />}
                {(k === 'sale' || k === 'purchase') && (
                  <h3 className="form-section-title">
                    <span>1</span>İşlem ve firma
                  </h3>
                )}
                {!['product', 'customer', 'supplier'].includes(k) && (
                  <Field
                    label="İşlem tarihi"
                    name="occurredAt"
                    type="date"
                    initial={
                      initial?.occurredOn ||
                      (initial?.occurredAt ? turkeyDay(initial.occurredAt) : turkeyDay())
                    }
                  />
                )}
                {k === 'purchase' && (
                  <Field
                    label="Tedarikçi belge / sipariş numarası"
                    name="reference"
                    initial={initial?.reference}
                    required={false}
                  />
                )}
                {(k === 'customer' || k === 'supplier') && (
                  <>
                    <Field label="Firma adı" name="name" initial={person?.name} />
                    <Field
                      label="Firma adresi"
                      name="address"
                      initial={person?.address}
                      required={false}
                      maxLength={1000}
                    />
                    <div className="form-grid">
                      <Field
                        label="Firma yetkilisi"
                        name="contact"
                        initial={person?.contact}
                        required={false}
                      />
                      <Field
                        label="Yetkilinin telefon numarası"
                        name="phone"
                        initial={person?.phone}
                        type="tel"
                        required={false}
                        maxLength={40}
                      />
                    </div>
                  </>
                )}
                {k === 'product' && (
                  <>
                    <Field label="Ürün adı" name="name" initial={product?.name} />
                    <SelectField label="Ölçü birimi" name="unit" initial={product?.unit || 'Kg'}>
                      <option>Kg</option>
                      <option>Litre</option>
                      <option>Adet</option>
                    </SelectField>
                    <div className="form-grid">
                      <Field
                        label="Satış birim fiyatı (TL)"
                        name="price"
                        initial={String((product?.price || 0) / 100)}
                      />
                      <Field
                        label="Kritik stok miktarı"
                        name="critical"
                        initial={String((product?.critical || 0) / 1000)}
                      />
                    </div>
                    <SelectField
                      label="Varsayılan tedarikçi (isteğe bağlı)"
                      name="defaultSupplier"
                      searchable
                      lookupKind="suppliers"
                      required={false}
                      initial={String(product?.default_supplier_id || '')}
                    >
                      <option value="">Yok</option>
                      {data.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </SelectField>
                    <label className="check">
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={product ? !!product.active : true}
                      />{' '}
                      Ürün satışa ve stok girişine açık
                    </label>
                  </>
                )}
                {[
                  'customer_debt',
                  'customer_credit',
                  'sale',
                  'purchase',
                  'collection',
                  'refund',
                  'supplier_payment',
                  'supplier_refund',
                ].includes(k) && (
                  <SelectField
                    label={
                      ['purchase', 'supplier_payment', 'supplier_refund'].includes(k)
                        ? 'Tedarikçi'
                        : 'Müşteri'
                    }
                    name="party"
                    searchable
                    lookupKind={
                      ['purchase', 'supplier_payment', 'supplier_refund'].includes(k)
                        ? 'suppliers'
                        : 'customers'
                    }
                    initial={partyId}
                    onChange={setPartyId}
                  >
                    <option value="">Firma seçin</option>
                    {(['purchase', 'supplier_payment', 'supplier_refund'].includes(k)
                      ? data.suppliers
                      : data.customers
                    ).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </SelectField>
                )}
                {['collection', 'refund', 'customer_debt', 'customer_credit'].includes(k) &&
                  partyId && (
                    <div className="notice" aria-live="polite">
                      <p>
                        Mevcut bakiye:{' '}
                        <strong>
                          {balance === null ? 'Hesaplanıyor…' : customerBalance(balance)}
                        </strong>
                      </p>
                      {entered !== null && balance !== null && (
                        <>
                          <p>Girilen tutar: {tl(entered)}</p>
                          <p>
                            İşlem sonrası:{' '}
                            <strong>
                              {customerBalance(
                                balance -
                                  (initial?.customerId === Number(partyId)
                                    ? (initial?.amount || 0) *
                                      (['collection', 'customer_credit'].includes(k) ? -1 : 1)
                                    : 0) +
                                  entered *
                                    (['collection', 'customer_credit'].includes(k) ? -1 : 1),
                              )}
                            </strong>
                          </p>
                          {k === 'collection' && entered > Math.max(balance, 0) && (
                            <p>
                              Bu işlemin {tl(entered - Math.max(balance, 0))} tutarı müşteri avansı
                              olarak kalacak.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                {k === 'customer_debt' && (
                  <SelectField
                    label="Borç türü"
                    name="category"
                    initial={initial?.category || 'carry'}
                  >
                    <option value="carry">Geçmişten devreden borç</option>
                    <option value="other">Diğer cari borç</option>
                  </SelectField>
                )}
                {['customer_debt', 'customer_credit'].includes(k) && (
                  <Field
                    label="Belge / referans numarası"
                    name="reference"
                    required={false}
                    maxLength={100}
                  />
                )}
                {(k === 'sale' || k === 'purchase') && (
                  <>
                    <div className="line-heading">
                      <h3 className="form-section-title">
                        <span>2</span>Ürün kalemleri
                      </h3>
                      <span>{lines.length} ürün</span>
                    </div>
                    {lines.map((l, index) => {
                      const p =
                        data.products.find((p) => p.id === Number(l.productId)) ||
                        selectedProducts[l.productId];
                      return (
                        <div className="order-line" key={l.key}>
                          <div className="line-product">
                            <Label htmlFor={`product-${l.key}`}>Ürün {index + 1}</Label>
                            <SearchableChoice
                              id={`product-${l.key}`}
                              label={`Ürün ${index + 1}`}
                              value={l.productId}
                              options={data.products
                                .filter((p) => p.active)
                                .map((p) => ({
                                  value: String(p.id),
                                  label: p.name + ' (' + p.unit + ')',
                                  record: p,
                                }))}
                              load={async (search) => {
                                const r = await window.desktop.lookup({ kind: 'products', search });
                                if (!r.ok) throw new Error(r.error);
                                return r.data
                                  .filter((p) => p.active)
                                  .map((p) => ({
                                    value: String(p.id),
                                    label: p.name + ' (' + p.unit + ')',
                                    record: p,
                                  }));
                              }}
                              onChange={(value, record) => {
                                const chosen =
                                  record || data.products.find((p) => p.id === Number(value));
                                if (chosen)
                                  setSelectedProducts((old) => ({ ...old, [value]: chosen }));
                                update(l.key, {
                                  productId: value,
                                  price: k === 'sale' && chosen ? String(chosen.price / 100) : '',
                                });
                                if (k === 'purchase' && !partyId && chosen?.default_supplier_id)
                                  setPartyId(String(chosen.default_supplier_id));
                              }}
                            />
                            {p && (
                              <small>
                                Stok: {quantity(p.stock)} {p.unit}
                                {k === 'purchase' &&
                                  (() => {
                                    const last = data.purchaseItems
                                      .filter(
                                        (i) =>
                                          i.product_id === p.id &&
                                          data.purchases.some(
                                            (d) => d.id === i.document_id && d.status === 'active',
                                          ),
                                      )
                                      .at(-1);
                                    const lastPrice =
                                      selectedProducts[l.productId]?.last_purchase_price ??
                                      p.last_purchase_price ??
                                      last?.price;
                                    return lastPrice !== undefined && lastPrice !== null ? (
                                      <span className="last-cost">
                                        {' '}
                                        · Son gerçek alış: {tl(lastPrice)} / {p.unit} (öneri)
                                      </span>
                                    ) : null;
                                  })()}
                              </small>
                            )}
                          </div>
                          <div>
                            <Label htmlFor={`qty-${l.key}`}>Miktar {p ? `(${p.unit})` : ''}</Label>
                            <Input
                              id={`qty-${l.key}`}
                              inputMode="decimal"
                              required
                              value={l.quantity}
                              aria-invalid={!!fieldErrors[`qty-${l.key}`]}
                              onChange={(e) => update(l.key, { quantity: e.target.value })}
                            />
                            {fieldErrors[`qty-${l.key}`] && (
                              <small className="field-error">{fieldErrors[`qty-${l.key}`]}</small>
                            )}
                          </div>
                          <div>
                            <Label htmlFor={`price-${l.key}`}>Birim fiyat (TL)</Label>
                            <Input
                              id={`price-${l.key}`}
                              inputMode="decimal"
                              required
                              value={l.price}
                              aria-invalid={!!fieldErrors[`price-${l.key}`]}
                              onChange={(e) => update(l.key, { price: e.target.value })}
                            />
                            {fieldErrors[`price-${l.key}`] && (
                              <small className="field-error">{fieldErrors[`price-${l.key}`]}</small>
                            )}
                          </div>
                          <div className="line-total" aria-label={`Kalem ${index + 1} toplamı`}>
                            {(() => {
                              try {
                                return tl(
                                  roundedRatio(decimal(l.quantity, 3), decimal(l.price, 2), 1000),
                                );
                              } catch {
                                return '—';
                              }
                            })()}
                            <small>Satır toplamı</small>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="line-remove"
                            aria-label={`Kalem ${index + 1} kaldır`}
                            disabled={lines.length === 1}
                            onClick={() => setLines((old) => old.filter((x) => x.key !== l.key))}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => (
                        guard.markDirty(),
                        setLines((old) => [
                          ...old,
                          { key: nextKey.current++, productId: '', quantity: '1', price: '' },
                        ])
                      )}
                      disabled={lines.length >= 100}
                    >
                      <Plus size={15} /> Kalem ekle
                    </Button>
                  </>
                )}
                {(k === 'purchase' || k === 'sale') && (
                  <>
                    <h3 className="form-section-title form-section-break">
                      <span>3</span>Ödeme ve özel seçenekler
                    </h3>
                    <label className="check">
                      <input
                        type="checkbox"
                        name="free"
                        checked={free}
                        onChange={(e) => setFree(e.target.checked)}
                      />{' '}
                      Bedelsiz işlem (sıfır fiyat)
                    </label>
                    {free && (
                      <Field
                        label="Bedelsiz işlem gerekçesi"
                        name="freeReason"
                        initial={initial?.freeReason}
                        required
                      />
                    )}
                  </>
                )}
                {k === 'purchase' && (
                  <label className="check">
                    <input
                      name="paid"
                      type="checkbox"
                      checked={paid}
                      onChange={(e) => setPaid(e.target.checked)}
                    />{' '}
                    Tedarikçiye ödendi (nakit çıkışı olarak kaydet)
                  </label>
                )}
                {k === 'expense' && (
                  <Field
                    label="Giderin adı"
                    name="expenseName"
                    initial={initial?.name || initial?.note || ''}
                  />
                )}
                {[
                  'collection',
                  'refund',
                  'customer_debt',
                  'customer_credit',
                  'expense',
                  'supplier_payment',
                  'supplier_refund',
                ].includes(k) && (
                  <Field
                    label="Tutar (TL)"
                    name="amount"
                    initial={initial?.amount ? String(initial.amount / 100) : ''}
                    onChange={(e) => setAmountText(e.target.value)}
                  />
                )}
                {[
                  'collection',
                  'refund',
                  'supplier_payment',
                  'supplier_refund',
                  'expense',
                  'purchase',
                ].includes(k) &&
                  (k !== 'purchase' || paid) && (
                    <SelectField
                      label="Ödeme yöntemi"
                      name="method"
                      initial={
                        initial?.method || (k === 'expense' && correctionInfo ? '' : 'Nakit')
                      }
                    >
                      {k === 'expense' && <option value="">Ödeme yöntemi bilinmiyor; seçin</option>}
                      <option>Nakit</option>
                      <option>Banka</option>
                      <option>Kart</option>
                    </SelectField>
                  )}
                {k === 'adjust' && (
                  <>
                    <SelectField label="Ürün" name="product" initial={String(record?.id || '')}>
                      <option value="">Ürün seçin</option>
                      {data.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} • {quantity(p.stock)} {p.unit}
                        </option>
                      ))}
                    </SelectField>
                    <Field label="Stoktan çıkarılacak miktar" name="quantity" />
                  </>
                )}
                {[
                  'sale',
                  'purchase',
                  'collection',
                  'refund',
                  'expense',
                  'adjust',
                  'customer_debt',
                  'customer_credit',
                  'supplier_payment',
                  'supplier_refund',
                ].includes(k) && (
                  <div className="field">
                    {(k === 'sale' || k === 'purchase') && (
                      <h3 className="form-section-title form-section-break">
                        <span>4</span>Açıklama ve toplam
                      </h3>
                    )}
                    <Label htmlFor="note">
                      {k === 'adjust'
                        ? 'Kayıp nedeni'
                        : k === 'expense'
                          ? 'Açıklama (isteğe bağlı)'
                          : 'Açıklama'}
                    </Label>
                    <Textarea
                      id="note"
                      name="note"
                      defaultValue={initial?.note || ''}
                      maxLength={1000}
                      required={['refund', 'adjust', 'customer_debt', 'customer_credit'].includes(
                        k,
                      )}
                      placeholder={
                        k === 'adjust' ? 'Örn. fire, hasarlı ambalaj' : 'İşleme ilişkin notunuz…'
                      }
                    />
                  </div>
                )}
                {(k === 'sale' || k === 'purchase') && (
                  <div className="form-summary total">
                    <span>
                      Toplam tutar<small className="muted"> · {lines.length} kalem</small>
                    </span>
                    <strong>{tl(preview)}</strong>
                  </div>
                )}
              </fieldset>
              {error && (
                <div role="alert" className="error-box">
                  {error}
                  {correctionInfo && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        const r = await window.desktop.record(correctionInfo.ref);
                        if (r.ok) {
                          setCorrectionInfo(r.data);
                          setPending(null);
                          setError(
                            r.data.blocked ||
                              'Güncel özgün kayıt yüklendi. Girdiğiniz değerler korundu; karşılaştırmayı yeniden inceleyin.',
                          );
                        } else setError(r.error);
                      }}
                    >
                      Güncel veriyi yeniden yükle
                    </Button>
                  )}
                </div>
              )}
            </div>
            <footer className="form-footer">
              <Button variant="outline" type="button" onClick={requestClose} disabled={busy}>
                Vazgeç
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  (['collection', 'refund', 'customer_debt', 'customer_credit'].includes(k) &&
                    balance === null)
                }
              >
                {busy
                  ? 'Kaydediliyor…'
                  : k === 'sale'
                    ? 'Satışı tamamla'
                    : k === 'purchase'
                      ? 'Depoya giriş yap'
                      : 'Kaydet'}
                {k === 'sale' || k === 'collection' ? (
                  <ArrowUpRight size={16} />
                ) : (
                  <ArrowDownLeft size={16} />
                )}
              </Button>
            </footer>
          </form>
        </FormErrorsContext.Provider>
        {pending && (
          <AlertDialog
            open
            onOpenChange={(open) => {
              if (!open && !busy) setPending(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Düzeltmeyi karşılaştırın</AlertDialogTitle>
                <AlertDialogDescription>
                  Özgün kayıt korunur; eski etki ters çevrilir ve yeni kayıt uygulanır. Eski dışa
                  aktarımlar değişmez.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="correction-comparison">
                <CorrectionEffects
                  before={initial}
                  after={(pending.command as any).replacement}
                  data={data}
                />
                <p>
                  Önceki tutar:{' '}
                  {tl(
                    initial?.amount ??
                      (initial?.lines?.reduce(
                        (n: number, l: any) => n + roundedRatio(l.quantity, l.price, 1000),
                        0,
                      ) ||
                        0),
                  )}
                </p>
                <p>Yeni tutar: {tl((pending.command as any).replacement.amount ?? preview)}</p>
                {initial?.lines?.map((l: any, i: number) => (
                  <p key={i}>
                    Kalem {i + 1}: {quantity(l.quantity)} → {lines[i]?.quantity || 'kaldırıldı'}
                  </p>
                ))}
                <p>
                  Müşteri / tedarikçi: #{initial?.customerId || initial?.supplierId} → #{partyId}
                </p>
                <p>
                  Etkilenen maliyet dönemleri:{' '}
                  {pending.impact.changes.map((c) => c.month).join(', ') ||
                    'Maliyet değişikliği yok'}
                </p>
                <p>{(pending.command as any).reason}</p>
              </div>
              {error && (
                <p role="alert" className="error-box">
                  {error}
                </p>
              )}
              <AlertDialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setPending(null)}
                >
                  Forma dön
                </Button>
                <Button
                  disabled={busy}
                  onClick={async () => {
                    if (lock.current) return;
                    lock.current = true;
                    setBusy(true);
                    try {
                      await onSave(pending.command);
                      onClose();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      lock.current = false;
                      setBusy(false);
                    }
                  }}
                >
                  Düzeltmeyi onayla
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {guard.confirmation}
      </DialogContent>
    </Dialog>
  );
}
export interface Reversal {
  entity: Extract<Command, { type: 'reverse' }>['entity'];
  id: number;
}
export function ReversalModal({
  value,
  onClose,
  onSave,
}: {
  value: Reversal;
  onClose: () => void;
  onSave: (c: Command) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const guard = useDraftGuard(onClose, busy);
  const lock = useRef(false);
  const operationId = useRef(crypto.randomUUID());
  const [reason, setReason] = useState('');
  const [occurredAt, setOccurredAt] = useState(turkeyDay());
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await onSave({
        type: 'reverse',
        ...value,
        reason,
        operationId: operationId.current,
        occurredOn: occurredAt,
      });
      onClose();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) guard.requestClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>İşlemi iptal et / tam iade al</AlertDialogTitle>
          <AlertDialogDescription>
            {value.entity === 'sale'
              ? 'Satışın tüm ürünleri stoklarına ve özgün maliyetlerine geri eklenir. Müşteri borcu düşer. Önceden tahsil edilmiş tutar müşteri alacağına dönüşür; ödeme için ayrıca para iadesi kaydedebilirsiniz.'
              : 'İşlemin tutarı ters hareketle düzeltilir. Cari hesap ve nakit raporları güncellenir.'}{' '}
            Asıl kayıt ve iptal gerekçesi geçmişte korunur.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          onSubmit={submit}
          onChangeCapture={guard.markDirty}
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest('[data-day]')) guard.markDirty();
          }}
        >
          {value.entity === 'expense' ? (
            <p className="notice">
              Yanlış gider özgün işlem tarihinde ters çevrilir. Gerçekten geri alınan ödeme için
              “Gider iadesi al” kullanın.
            </p>
          ) : (
            <DateField
              id="cancelDate"
              label="İşlem tarihi"
              value={occurredAt}
              onChange={setOccurredAt}
            />
          )}
          <Label htmlFor="reason">İptal / iade gerekçesi</Label>
          <Textarea
            id="reason"
            required
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
          {error && (
            <div role="alert" className="error-box">
              {error}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Vazgeç</AlertDialogCancel>
            <Button variant="destructive" disabled={busy || !reason.trim()} type="submit">
              {busy ? 'Kaydediliyor…' : 'İptali onayla'}
            </Button>
          </AlertDialogFooter>
        </form>
        {guard.confirmation}
      </AlertDialogContent>
    </AlertDialog>
  );
}
function CorrectionEffects({ before, after, data }: { before: any; after: any; data: Snapshot }) {
  const total = (c: any) =>
    c.amount ??
    c.lines?.reduce((n: number, l: any) => n + roundedRatio(l.quantity, l.price, 1000), 0) ??
    0;
  const old = total(before),
    next = total(after);
  const cashSign =
    (
      {
        collection: 1,
        refund: -1,
        expense: -1,
        supplier_payment: -1,
        supplier_refund: 1,
      } as Record<string, number>
    )[after.type] || 0;
  const debtSign = ['collection', 'customer_credit', 'supplier_payment'].includes(after.type)
    ? -1
    : 1;
  const oldParty = before.customerId || before.supplierId,
    newParty = after.customerId || after.supplierId;
  const parties = after.supplierId ? data.suppliers : data.customers;
  const delta = new Map<number, number>();
  for (const l of before.lines || [])
    delta.set(l.productId, (delta.get(l.productId) || 0) + l.quantity);
  for (const l of after.lines || [])
    delta.set(l.productId, (delta.get(l.productId) || 0) - l.quantity);
  const months = [
    ...new Set(
      [before.occurredOn || before.occurredAt, after.occurredOn || after.occurredAt]
        .filter(Boolean)
        .map((s: string) => s.slice(0, 7)),
    ),
  ];
  return (
    <>
      <p>
        İşlem tarihleri: {date(before.occurredOn || before.occurredAt)} →{' '}
        {date(after.occurredOn || after.occurredAt)}
      </p>
      <p>İşlem dönemleri: {months.join(', ')}. Önceki dışa aktarımlar korunur.</p>
      {cashSign !== 0 && <p>Kasa net farkı: {tl((next - old) * cashSign)}</p>}
      {oldParty && (
        <p>
          {parties.find((p) => p.id === oldParty)?.name || '#' + oldParty} · Cari net fark:{' '}
          {tl((oldParty === newParty ? next - old : -old) * debtSign)}
        </p>
      )}
      {newParty && newParty !== oldParty && (
        <p>
          {parties.find((p) => p.id === newParty)?.name || '#' + newParty} · Cari net fark:{' '}
          {tl(next * debtSign)}
        </p>
      )}
      {[...delta].map(([id, value]) => (
        <p key={id}>
          {data.products.find((p) => p.id === id)?.name || 'Ürün #' + id} · Stok net farkı:{' '}
          {quantity(value * (after.type === 'purchase' ? -1 : 1))}{' '}
          {data.products.find((p) => p.id === id)?.unit}
        </p>
      ))}
    </>
  );
}
