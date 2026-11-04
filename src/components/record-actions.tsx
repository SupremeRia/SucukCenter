import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ComponentProps,
  type ReactElement,
} from 'react';
import { ContextMenu, DropdownMenu } from 'radix-ui';
import { MoreHorizontal } from 'lucide-react';
import type { Command, RecordInfo, RecordRef, Snapshot } from '../../shared/contracts';
import { decimal } from '../../shared/contracts';
import { useDraftGuard } from './draft-guard';
import { DateField } from './calendar';
import { FormModal, ReversalModal, type FormKind } from './forms';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Field, SelectField } from './form-fields';
import { tl, quantity, date } from '../lib/format';
import { turkeyDay } from '../../shared/dates';
type Action = 'view' | 'edit' | 'remove' | 'restore' | 'cancel' | 'expenseRefund';
const Actions = createContext<(ref: RecordRef, action: Action) => void>(() => {});
const isMaster = (e: string) => ['product', 'customer', 'supplier'].includes(e);
export function ActionRow({
  record,
  children,
  className,
  ...props
}: ComponentProps<'tr'> & { record?: RecordRef }) {
  const row = useRef<HTMLTableRowElement>(null);
  const [open, setOpen] = useState(false);
  if (!record)
    return (
      <tr {...props} className={className}>
        {children}
      </tr>
    );
  const cells = Children.toArray(children);
  const last = cells[cells.length - 1];
  const menu = (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Kayıt işlemleri"
          title="Kayıt işlemleri"
        >
          <MoreHorizontal size={18} />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="record-menu"
          align="end"
          collisionPadding={12}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            row.current?.focus();
          }}
        >
          <RecordMenuItems record={record} kind="dropdown" restore />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
  if (isValidElement(last))
    cells[cells.length - 1] = cloneElement(
      last as ReactElement<{ children: ReactNode }>,
      {},
      <>
        {(last.props as { children: ReactNode }).children}
        {menu}
      </>,
    );
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <tr
          {...props}
          ref={row}
          tabIndex={0}
          className={className}
          onKeyDown={(e) => {
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          {cells}
        </tr>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="record-menu"
          collisionPadding={12}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            row.current?.focus();
          }}
        >
          <RecordMenuItems record={record} kind="context" restore />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
function Values({ command, data }: { command: any; data: Snapshot }) {
  if (!command) return <p>Bu kayıt eski işlem geçmişinden görüntülenir.</p>;
  const party =
    data.customers.find((p) => p.id === command.customerId) ||
    data.suppliers.find((p) => p.id === command.supplierId);
  return (
    <>
      <p>
        {command.name ||
          party?.name ||
          (command.customerId
            ? 'Müşteri #' + command.customerId
            : command.supplierId
              ? 'Tedarikçi #' + command.supplierId
              : '')}
      </p>
      {command.occurredAt || command.occurredOn ? (
        <p>İşlem tarihi: {date(command.occurredAt || command.occurredOn)}</p>
      ) : null}
      {command.type === 'expense' && !command.method && (
        <p>Ödeme yöntemi: Bilinmiyor (eski kayıt)</p>
      )}
      {command.amount !== undefined && <p>Tutar: {tl(command.amount)}</p>}
      {command.price !== undefined && <p>Birim fiyat: {tl(command.price)}</p>}
      {command.lines?.map((l: any, i: number) => (
        <p key={i}>
          {data.products.find((p) => p.id === l.productId)?.name || 'Ürün #' + l.productId}:{' '}
          {quantity(l.quantity)} × {tl(l.price)}
        </p>
      ))}
      {command.quantity && <p>Miktar: {quantity(command.quantity)}</p>}
      {command.method && <p>Ödeme yöntemi: {command.method}</p>}
      {command.address && <p>Adres: {command.address}</p>}
      {command.contact && (
        <p>
          Yetkili: {command.contact} · {command.phone}
        </p>
      )}
      <p>{command.note}</p>
    </>
  );
}
export function RecordActionsProvider({
  children,
  data,
  onSave,
}: {
  children: ReactNode;
  data: Snapshot;
  onSave: (c: Command) => Promise<void>;
}) {
  const [target, setTarget] = useState<{ ref: RecordRef; action: Action } | null>(null),
    [info, setInfo] = useState<RecordInfo | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState(false),
    [revision, setRevision] = useState(0),
    [loaded, setLoaded] = useState(data);
  const op = useRef(crypto.randomUUID());
  useEffect(() => {
    let alive = true;
    if (!target) return;
    setInfo(null);
    setError('');
    setEditor(false);
    op.current = crypto.randomUUID();
    window.desktop
      .record(target.ref)
      .then(async (r) => {
        if (!alive) return;
        if (!r.ok) {
          setError(r.error);
          return;
        }
        const i = r.data;
        const original = i.original as any;
        const selected = await window.desktop.snapshot({
          includeArchived: true,
          focusEntity: i.ref.entity,
          focusId: i.ref.id,
          customerId: original?.customerId,
          supplierId: original?.supplierId,
        });
        if (!alive) return;
        if (!selected.ok) throw new Error(selected.error);
        if (selected.ok) {
          const d = selected.data;
          const productIds = [
            ...new Set<number>([
              ...(original?.lines || []).map((l: any) => l.productId),
              ...(original?.productId ? [original.productId] : []),
            ]),
          ];
          const missing = productIds.filter((id) => !d.products.some((p) => p.id === id));
          const products = await Promise.all(
            missing.map((selected) =>
              window.desktop.lookup({ kind: 'products', search: '', selected }),
            ),
          );
          for (const result of products) {
            if (!result.ok) throw new Error(result.error);
            for (const row of result.data)
              if (!d.products.some((p) => p.id === row.id)) d.products.push(row);
          }
          if (productIds.some((id) => !d.products.some((p) => p.id === id)))
            throw new Error('Kayıtlı ürün yüklenemedi; düzeltme formu açılmadı. Yeniden yükleyin.');
          if (alive) setLoaded(d);
        }
        if (alive) {
          setInfo(i);
          setEditor(target.action === 'edit' && !i.blocked);
        }
      })
      .catch((e) => {
        if (alive) setError(String(e.message));
      });
    return () => {
      alive = false;
    };
  }, [target, revision]);
  const open = (ref: RecordRef, action: Action) => {
    setInfo(null);
    setEditor(false);
    setError('');
    setTarget({ ref, action });
  };
  const close = () => {
    setTarget(null);
    setInfo(null);
    setEditor(false);
  };
  async function manage(action: 'delete' | 'archive' | 'restore') {
    if (!info || busy) return;
    setBusy(true);
    try {
      await onSave({
        type: 'manage',
        operationId: op.current,
        entity: info.ref.entity as 'product' | 'customer' | 'supplier',
        id: info.ref.id,
        expected: info.expected,
        action,
      });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Actions.Provider value={open}>
      {children}
      {target && editor && info?.original && isMaster(info.ref.entity) && (
        <FormModal
          spec={{
            kind: info.ref.entity as FormKind,
            record: { ...info.original, id: info.ref.id } as any,
          }}
          data={loaded}
          onClose={close}
          onSave={async (c) => {
            const latest = await window.desktop.record(info.ref);
            if (!latest.ok) throw new Error(latest.error);
            if (latest.data.expected !== info.expected)
              throw new Error('Kayıt değişti. Formu kapatıp güncel kaydı açın.');
            await onSave({ ...c, expected: info.expected } as Command);
          }}
        />
      )}
      {target &&
        editor &&
        info?.original &&
        !isMaster(info.ref.entity) &&
        !['preorder', 'preorder_delivery'].includes(info.ref.entity) && (
          <FormModal
            spec={{ kind: info.ref.entity as FormKind, correction: info }}
            data={loaded}
            onClose={close}
            onSave={onSave}
          />
        )}
      {target && editor && info?.ref.entity === 'preorder_delivery' && (
        <DeliveryCorrection info={info} data={loaded} onSave={onSave} onClose={close} />
      )}
      {target && editor && info?.ref.entity === 'preorder' && (
        <PreorderCorrection info={info} data={loaded} onSave={onSave} onClose={close} />
      )}
      {target?.action === 'expenseRefund' && info && !info.blocked && (
        <ExpenseRefund info={info} onSave={onSave} onClose={close} />
      )}
      {target?.action === 'cancel' &&
        info &&
        !info.blocked &&
        !['preorder', 'preorder_delivery'].includes(info.ref.entity) && (
          <ReversalModal
            value={{ entity: info.ref.entity as any, id: info.ref.id }}
            onClose={close}
            onSave={onSave}
          />
        )}
      {target &&
        !editor &&
        !(
          ['cancel', 'expenseRefund'].includes(target.action) &&
          info &&
          !info.blocked &&
          !['preorder', 'preorder_delivery'].includes(info.ref.entity)
        ) && (
          <Dialog
            open
            onOpenChange={(v) => {
              if (!v && !busy) close();
            }}
          >
            <DialogContent className="record-dialog">
              <DialogHeader>
                <DialogTitle>
                  {target.action === 'remove'
                    ? 'Sil / Kaldır'
                    : target.action === 'restore'
                      ? 'Yeniden etkinleştir'
                      : target.action === 'edit'
                        ? 'Düzeltme bilgisi'
                        : 'Kayıt bilgileri'}{' '}
                  · {info?.name || '#' + target.ref.id}
                </DialogTitle>
                <DialogDescription>İşlem geçmişi ve yükümlülükler korunur.</DialogDescription>
              </DialogHeader>
              {!info && !error && <p>İlgili kayıt ve bağlantılar yükleniyor…</p>}
              {error && (
                <p role="alert" className="error-box">
                  {error}
                </p>
              )}
              {info && (
                <>
                  <p>
                    {info.active
                      ? 'Etkin kayıt'
                      : 'Arşivlenmiş, iptal edilmiş veya düzeltilmiş kayıt'}
                  </p>
                  <Values command={info.original} data={loaded} />
                  {info.obligations.map((o, i) => (
                    <p key={i} className="notice">
                      {o}
                    </p>
                  ))}
                  {info.corrections.map((c) => (
                    <section className="notice" key={c.id}>
                      <h3>
                        Düzeltildi · #{c.original_id} → #{c.replacement_id}
                      </h3>
                      <p>
                        Programa giriş: {date(c.recorded_at)} · {c.reason} · Ters kayıt: #
                        {c.reversal_id}
                      </p>
                      <strong>Önceki değerler</strong>
                      <Values command={JSON.parse(c.old_json)} data={loaded} />
                      <strong>Yeni değerler</strong>
                      <Values command={JSON.parse(c.new_json)} data={loaded} />
                      <Button
                        onClick={() =>
                          open({ entity: c.replacement_entity, id: c.replacement_id }, 'view')
                        }
                      >
                        Yeni kaydı aç
                      </Button>
                    </section>
                  ))}
                  {target.action === 'view' && (
                    <Button onClick={() => open(info.ref, 'edit')}>Düzelt</Button>
                  )}
                  {['edit', 'cancel', 'expenseRefund'].includes(target.action) && info.blocked && (
                    <p role="alert" className="notice">
                      {info.blocked}
                    </p>
                  )}
                  {target.action === 'remove' && (
                    <>
                      <p>
                        <strong>{info.name}</strong>{' '}
                        {info.dependencies.length
                          ? 'ilişkili geçmiş kayıtları olduğu için kalıcı silinemez. Arşivlendiğinde yeni işlem seçimlerinden kalkar; mevcut para ve ürün yükümlülükleri kapanmaz.'
                          : 'henüz hareket görmemiş. Kalıcı silme kartı kaldırır; silme işlemi geçmişte izlenir.'}
                      </p>
                      {info.dependencies.length > 0 && (
                        <p>Bağlı kayıtlar: {info.dependencies.map(dependencyLabel).join(', ')}</p>
                      )}
                      <div className="toolbar">
                        {!info.dependencies.length && (
                          <Button
                            variant="destructive"
                            disabled={busy}
                            onClick={() => manage('delete')}
                          >
                            Hareketsiz kaydı kalıcı sil
                          </Button>
                        )}
                        <Button disabled={busy || !info.active} onClick={() => manage('archive')}>
                          Geçmiş kayıtları koruyarak arşivle
                        </Button>
                      </div>
                    </>
                  )}
                  {target.action === 'restore' && (
                    <>
                      <p>{info.name} yeniden etkinleştirildiğinde yeni işlemlerde seçilebilir.</p>
                      <Button disabled={busy || info.active} onClick={() => manage('restore')}>
                        Yeniden etkinleştir
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setRevision((n) => n + 1)}
                  >
                    Güncel veriyi yeniden yükle
                  </Button>
                </>
              )}
            </DialogContent>
          </Dialog>
        )}
    </Actions.Provider>
  );
}
function dependencyLabel(table: string) {
  return (
    (
      {
        sales: 'Satışlar',
        purchases: 'Alışlar',
        collections: 'Tahsilatlar / iadeler',
        customer_ledger: 'Müşteri cari hareketleri',
        supplier_ledger: 'Tedarikçi cari hareketleri',
        sale_items: 'Satış kalemleri',
        purchase_items: 'Alış kalemleri',
        stock_movements: 'Stok hareketleri',
        preorders: 'Ön siparişler / teslimatlar',
        customer_adjustments: 'Cari eklemeler',
        supplier_payments: 'Tedarikçi ödemeleri',
        products: 'Varsayılan tedarikçisi olan ürünler',
      } as Record<string, string>
    )[table] || 'İlişkili hareketler'
  );
}
function PreorderCorrection({
  info,
  data,
  onSave,
  onClose,
}: {
  info: RecordInfo;
  data: Snapshot;
  onSave: (c: Command) => Promise<void>;
  onClose: () => void;
}) {
  const c = info.original as any;
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Command | null>(null);
  const op = useRef(crypto.randomUUID());
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ön sipariş düzelt</DialogTitle>
          <DialogDescription>
            Hareketsiz sipariş iptal edilerek yeni değerlerle bağlanır.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              const replacement = {
                ...c,
                operationId: undefined,
                occurredAt: undefined,
                customerId: Number(f.get('customer')),
                productId: Number(f.get('product')),
                quantity: decimal(String(f.get('quantity')), 3),
                price: decimal(String(f.get('price')), 2),
                source: f.get('source'),
                occurredOn: f.get('occurredOn'),
                plannedOn: f.get('plannedOn'),
                note: f.get('note'),
                reference: f.get('reference'),
              };
              const command = {
                type: 'correct',
                operationId: op.current,
                entity: 'preorder',
                id: info.ref.id,
                expected: info.expected,
                reason: String(f.get('reason')),
                replacement,
              } as Command;
              const preview = await window.desktop.preview(command);
              if (!preview.ok) throw new Error(preview.error);
              setPending(command);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          <SelectField label="Müşteri" name="customer" initial={String(c.customerId)}>
            {data.customers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Ürün" name="product" initial={String(c.productId)}>
            {data.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Kaynak" name="source" initial={c.source}>
            <option value="prepaid">Ön ödemeli sipariş</option>
            <option value="other">Diğer ürün borcu</option>
          </SelectField>
          <Field label="Miktar" name="quantity" initial={String(c.quantity / 1000)} />
          <Field label="Birim fiyat (TL)" name="price" initial={String(c.price / 100)} />
          <Field
            label="İşlem tarihi"
            type="date"
            name="occurredOn"
            initial={c.occurredOn || (c.occurredAt ? turkeyDay(c.occurredAt) : turkeyDay())}
          />
          <Field
            label="Planlanan teslim"
            type="date"
            name="plannedOn"
            initial={c.plannedOn}
            required={false}
          />
          <Field label="Açıklama" name="note" initial={c.note} />
          <Field label="Referans" name="reference" initial={c.reference} required={false} />
          <Field label="Düzeltme gerekçesi" name="reason" />
          {error && <p role="alert">{error}</p>}
          <Button type="submit" disabled={busy}>
            Düzeltmeyi incele
          </Button>
        </form>
        {pending && (
          <div className="notice">
            <strong>Önceki</strong>
            <Values command={c} data={data} />
            <strong>Yeni</strong>
            <Values command={(pending as any).replacement} data={data} />
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSave(pending);
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Düzeltmeyi onayla
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
function DeliveryCorrection({
  info,
  data,
  onSave,
  onClose,
}: {
  info: RecordInfo;
  data: Snapshot;
  onSave: (c: Command) => Promise<void>;
  onClose: () => void;
}) {
  const original = info.original as any;
  const [pending, setPending] = useState<Command | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const op = useRef(crypto.randomUUID());
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Teslimatı düzelt</DialogTitle>
          <DialogDescription>
            Yanlış kayıt düzeltmesi; gerçek fiziksel iade için sipariş hareketlerindeki iade
            düğmesini kullanın.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const f = new FormData(e.currentTarget);
              const replacement = {
                ...original,
                operationId: undefined,
                occurredAt: undefined,
                quantity: decimal(String(f.get('quantity')), 3),
                occurredOn: String(f.get('occurredOn')),
                note: String(f.get('note')),
              };
              const c = {
                type: 'correct',
                operationId: op.current,
                entity: 'preorder_delivery',
                id: info.ref.id,
                expected: info.expected,
                reason: String(f.get('reason')),
                replacement,
              } as Command;
              const p = await window.desktop.preview(c);
              if (!p.ok) throw new Error(p.error);
              setPending(c);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          <Field
            label="Teslim miktarı"
            name="quantity"
            initial={String(original.quantity / 1000)}
          />
          <Field
            label="İşlem tarihi"
            name="occurredOn"
            type="date"
            initial={
              original.occurredOn ||
              (original.occurredAt ? turkeyDay(original.occurredAt) : turkeyDay())
            }
          />
          <Field label="Açıklama" name="note" initial={original.note} required={false} />
          <Field label="Düzeltme gerekçesi" name="reason" />
          <Button type="submit" disabled={busy}>
            Düzeltmeyi incele
          </Button>
        </form>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        {pending && (
          <div className="notice">
            <strong>Önceki</strong>
            <Values command={original} data={data} />
            <strong>Yeni</strong>
            <Values command={(pending as any).replacement} data={data} />
            <p>Eski teslimatın stok ve cari etkileri geri alınır; yeni miktar uygulanır.</p>
            <Button
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  await onSave(pending);
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Düzeltmeyi onayla
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function RecordButton({ record }: { record: RecordRef }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Kayıt işlemleri">
          <MoreHorizontal size={18} />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="record-menu" collisionPadding={12} align="end">
          <RecordMenuItems record={record} kind="dropdown" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
export function recordFor(entity: string, id: number): RecordRef | undefined {
  const kind = entity === 'expense_refund' ? 'expense' : entity.replace(/_cancel$/, '');
  return [
    'product',
    'customer',
    'supplier',
    'sale',
    'purchase',
    'collection',
    'refund',
    'expense',
    'customer_debt',
    'customer_credit',
    'supplier_payment',
    'supplier_refund',
    'preorder',
    'preorder_delivery',
  ].includes(kind)
    ? { entity: kind as RecordRef['entity'], id }
    : undefined;
}
export function RecordSurface({ record, children }: { record?: RecordRef; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!record) return <>{children}</>;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="record-surface" ref={ref} tabIndex={0}>
          {children}
          <RecordButton record={record} />
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="record-menu"
          collisionPadding={12}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            ref.current?.focus();
          }}
        >
          <RecordMenuItems record={record} kind="context" />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function RecordMenuItems({
  record,
  kind,
  restore = false,
}: {
  record: RecordRef;
  kind: 'context' | 'dropdown';
  restore?: boolean;
}) {
  const action = useContext(Actions);
  const Item = kind === 'context' ? ContextMenu.Item : DropdownMenu.Item;
  return (
    <>
      <Item className="record-menu-item" onSelect={() => action(record, 'view')}>
        Görüntüle
      </Item>
      <Item className="record-menu-item" onSelect={() => action(record, 'edit')}>
        Düzelt
      </Item>
      <Item
        className="record-menu-item"
        onSelect={() => action(record, isMaster(record.entity) ? 'remove' : 'cancel')}
      >
        {isMaster(record.entity)
          ? 'Sil / Kaldır'
          : record.entity === 'expense'
            ? 'İptal et'
            : 'İptal et / İade'}
      </Item>
      {record.entity === 'expense' && (
        <Item className="record-menu-item" onSelect={() => action(record, 'expenseRefund')}>
          Gider iadesi al
        </Item>
      )}
      {restore && isMaster(record.entity) && (
        <Item className="record-menu-item" onSelect={() => action(record, 'restore')}>
          Yeniden etkinleştir
        </Item>
      )}
    </>
  );
}

function ExpenseRefund({
  info,
  onSave,
  onClose,
}: {
  info: RecordInfo;
  onSave: (c: Command) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [day, setDay] = useState(turkeyDay());
  const lock = useRef(false),
    operation = useRef(crypto.randomUUID());
  const guard = useDraftGuard(onClose, busy);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) guard.requestClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gider iadesi al</DialogTitle>
          <DialogDescription>
            Gerçekten geri alınan tam ödeme, iade tarihinde gideri azaltır ve aynı ödeme yönteminde
            giriş oluşturur. Yanlış kayıt için İptal et kullanın.
          </DialogDescription>
        </DialogHeader>
        <p>
          {info.name} · {tl((info.original as any).amount)}
        </p>
        <form
          onChangeCapture={guard.markDirty}
          onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError('');
            const f = new FormData(e.currentTarget);
            try {
              await onSave({
                type: 'expense_refund',
                operationId: operation.current,
                expenseId: info.ref.id,
                occurredOn: day,
                note: String(f.get('refundReason')),
              });
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <DateField
              label="İade tarihi"
              value={day}
              onChange={(v) => {
                setDay(v);
                guard.markDirty();
              }}
            />
            <Field name="refundReason" label="İade gerekçesi" />
            <p>
              İade tutarı: {tl((info.original as any).amount)} · Ödeme yöntemi:{' '}
              {(info.original as any).method || 'Bilinmiyor (eski kayıt)'}
            </p>
          </fieldset>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <div className="toolbar">
            <Button type="button" variant="outline" disabled={busy} onClick={guard.requestClose}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Kaydediliyor…' : 'İadeyi kaydet'}
            </Button>
          </div>
        </form>
        {guard.confirmation}
      </DialogContent>
    </Dialog>
  );
}
