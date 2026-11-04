import { useRef, useState, useEffect, type FormEvent } from 'react';
import type { Snapshot, Command } from '../../shared/contracts';
import { decimal } from '../../shared/contracts';
import { turkeyDay } from '../../shared/dates';
import { DateField } from './calendar';
import { useDraftGuard } from './draft-guard';
import { tl, date, quantity, kindLabel } from '../lib/format';
import { usePeriod } from './period';
import type { Statement } from '../../shared/contracts';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { DataTable, Row, Cell, Status } from './views';
import type { Reversal } from './forms';
export function SupplierAccount({
  revision,
  id,
  data,
  onClose,
  onPay,
  onReverse,
}: {
  id: number;
  revision: number;
  data: Snapshot;
  onClose: () => void;
  onPay: (kind: 'supplier_payment' | 'supplier_refund', id: number) => void;
  onReverse: (r: Reversal) => void;
}) {
  const range = usePeriod();
  const [offset, setOffset] = useState(0);
  const [ledger, setLedger] = useState<Statement | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    window.desktop.supplierStatement({ supplierId: id, range, offset }).then((r) => {
      if (alive) {
        if (r.ok) {
          setLedger(r.data);
          setError('');
        } else setError(r.error);
      }
    });
    return () => {
      alive = false;
    };
  }, [id, range.start, range.end, offset, revision]);
  const s = data.suppliers.find((s) => s.id === id);
  if (!s) return null;
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="wide-dialog">
        <DialogHeader>
          <DialogTitle>{s.name} — Cari hesap</DialogTitle>
          <DialogDescription>
            Alış, kısmi ödeme ve iade kayıtları. Güncel bakiye dönem hareketinden ayrıdır.
          </DialogDescription>
        </DialogHeader>
        <div className="form-summary total">
          <span>{s.balance < 0 ? 'Tedarikçiden alacağınız' : 'Tedarikçiye borcunuz'}</span>
          <strong>{tl(Math.abs(s.balance))}</strong>
        </div>
        <Button
          onClick={() => {
            onClose();
            onPay(s.balance < 0 ? 'supplier_refund' : 'supplier_payment', id);
          }}
        >
          {s.balance < 0 ? 'Tedarikçiden para iadesi al' : 'Tedarikçiye ödeme yap'}
        </Button>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        {ledger && (
          <>
            <div className="form-summary">
              <span>Dönem başı: {tl(ledger.opening)}</span>
              <span>Dönem sonu: {tl(ledger.closing)}</span>
            </div>
            <h3>Tüm cari hareketler — seçili dönem</h3>
            <DataTable
              headers={[
                'Tarih',
                'Kayıt zamanı',
                'Tür / belge',
                'Tutar',
                'Bakiye',
                'Yöntem / not',
                'İşlem',
              ]}
              empty={!ledger.rows.length}
            >
              {ledger.rows.map((l) => (
                <Row key={l.id}>
                  <Cell>{date(l.occurred_at)}</Cell>
                  <Cell>{date(l.recorded_at)}</Cell>
                  <Cell>
                    {kindLabel[l.kind] || l.kind} #{l.entity_id}
                  </Cell>
                  <Cell>{tl(l.amount)}</Cell>
                  <Cell>{tl(l.balance)}</Cell>
                  <Cell>
                    {l.method} {l.note}
                  </Cell>
                  <Cell>
                    {['supplier_payment', 'supplier_refund'].includes(l.kind) &&
                      l.payment_status === 'active' && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            onClose();
                            onReverse({
                              entity: l.kind as 'supplier_payment' | 'supplier_refund',
                              id: l.entity_id,
                            });
                          }}
                        >
                          Kaydı iptal et
                        </Button>
                      )}
                  </Cell>
                </Row>
              ))}
            </DataTable>
            <div className="toolbar">
              <Button
                variant="outline"
                disabled={!offset}
                onClick={() => setOffset((o) => Math.max(0, o - 50))}
              >
                Önceki cari hareketler
              </Button>
              <span>{ledger.total} hareket</span>
              <Button
                variant="outline"
                disabled={offset + 50 >= ledger.total}
                onClick={() => setOffset((o) => o + 50)}
              >
                Sonraki cari hareketler
              </Button>
            </div>
          </>
        )}
        <h3>Son 50 ödeme ve para iadesi</h3>
        <DataTable
          headers={['Tarih', 'Yöntem', 'Tür', 'Tutar', 'Durum', 'İşlem']}
          empty={!data.supplierPayments.some((p) => p.supplier_id === id)}
        >
          {data.supplierPayments
            .filter((p) => p.supplier_id === id)
            .map((p) => (
              <Row key={p.id} record={{ entity: p.kind, id: p.id }}>
                <Cell>{date(p.occurred_at || p.created_at)}</Cell>
                <Cell>{p.method}</Cell>
                <Cell>{p.kind === 'supplier_payment' ? 'Ödeme' : 'Para iadesi'}</Cell>
                <Cell>{tl(p.amount)}</Cell>
                <Cell>
                  <Status status={p.status} />
                </Cell>
                <Cell>
                  {p.status === 'active' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onClose();
                        onReverse({ entity: p.kind, id: p.id });
                      }}
                    >
                      Ödemeyi iptal et
                    </Button>
                  )}
                </Cell>
              </Row>
            ))}
        </DataTable>
        <h3>Son alışlar — eski belge için ana listede numarayla arayın</h3>
        <DataTable
          headers={['Belge', 'Tarih', 'Tutar', 'Durum']}
          empty={!data.purchases.some((p) => p.party_id === id)}
        >
          {data.purchases
            .filter((p) => p.party_id === id)
            .map((p) => (
              <Row key={p.id} record={{ entity: 'purchase', id: p.id }}>
                <Cell>#G-{String(p.id).padStart(4, '0')}</Cell>
                <Cell>{date(p.occurred_at || p.created_at)}</Cell>
                <Cell>{tl(p.total)}</Cell>
                <Cell>
                  <Status status={p.status} />
                </Cell>
              </Row>
            ))}
        </DataTable>
        <h3>Son 50 tedarikçiye iade</h3>
        <DataTable
          headers={['Belge', 'Cari azaltım', 'Stok maliyeti', 'Fark', 'İşlem']}
          empty={!data.supplierReturns.some((r) => r.supplier_id === id)}
        >
          {data.supplierReturns
            .filter((r) => r.supplier_id === id)
            .map((r) => (
              <Row key={r.id}>
                <Cell>
                  #İ-{r.id} • {r.status === 'active' ? 'Etkin' : 'İptal'}
                </Cell>
                <Cell>{tl(r.total)}</Cell>
                <Cell>{tl(r.cost)}</Cell>
                <Cell>{tl(r.total - r.cost)}</Cell>
                <Cell>
                  {r.status === 'active' && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        onClose();
                        onReverse({ entity: 'supplier_return', id: r.id });
                      }}
                    >
                      İadeyi iptal et
                    </Button>
                  )}
                </Cell>
              </Row>
            ))}
        </DataTable>
      </DialogContent>
    </Dialog>
  );
}
export function SupplierReturnModal({
  id,
  data,
  onClose,
  onSave,
}: {
  id: number;
  data: Snapshot;
  onClose: () => void;
  onSave: (c: Command) => Promise<void>;
}) {
  const doc = data.purchases.find((d) => d.id === id)!;
  const items = data.purchaseItems.filter((i) => i.document_id === id);
  const [values, setValues] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const guard = useDraftGuard(onClose, busy);
  const lock = useRef(false);
  const key = useRef(crypto.randomUUID());
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      await onSave({
        type: 'supplier_return',
        operationId: key.current,
        purchaseId: id,
        occurredOn: String(f.get('occurredAt')),
        note: String(f.get('note')),
        lines: items
          .filter((i) => values[i.id] && decimal(values[i.id], 3) > 0)
          .map((i) => ({ itemId: i.id, quantity: decimal(values[i.id], 3) })),
      });
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) guard.requestClose();
      }}
    >
      <DialogContent className="wide-dialog editor-dialog">
        <DialogHeader>
          <DialogTitle>Tedarikçiye iade — #G-{String(id).padStart(4, '0')}</DialogTitle>
          <DialogDescription>
            Asıl alış korunur. Cari tutar özgün alış fiyatından, stok çıkışı güncel ağırlıklı
            ortalama maliyetinden hesaplanır. Aradaki fark finans raporunda ayrı gösterilir.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={submit}
          onChangeCapture={guard.markDirty}
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest('[data-day]')) guard.markDirty();
          }}
        >
          <div className="form-scroll">
            <p>{doc.party}</p>
            <fieldset disabled={busy}>
              <DateField
                id="returnDate"
                label="İşlem tarihi"
                name="occurredAt"
                initial={turkeyDay()}
              />
              {items.map((i) => (
                <div className="form-summary" key={i.id}>
                  <div>
                    <Label htmlFor={`return-${i.id}`}>
                      {i.product} • Alınan {quantity(i.quantity)} {i.unit}
                    </Label>
                    <small> Özgün birim fiyat: {tl(i.price)}</small>
                  </div>
                  <Input
                    id={`return-${i.id}`}
                    aria-label={`İade miktarı ${i.id}`}
                    style={{ maxWidth: 140 }}
                    placeholder="0"
                    value={values[i.id] || ''}
                    onChange={(e) => setValues((v) => ({ ...v, [i.id]: e.target.value }))}
                  />
                </div>
              ))}
              <Label htmlFor="returnNote">İade gerekçesi / not</Label>
              <Textarea id="returnNote" name="note" required maxLength={200} />
            </fieldset>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="form-footer">
            <Button type="button" variant="outline" disabled={busy} onClick={guard.requestClose}>
              Vazgeç
            </Button>
            <Button disabled={busy} type="submit">
              İadeyi kaydet
            </Button>
          </div>
        </form>
        {guard.confirmation}
      </DialogContent>
    </Dialog>
  );
}
