import type { CostImpact } from '../../shared/contracts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { tl } from '../lib/format';
import { DataTable, Row, Cell } from './views';
export function CostApproval({
  impact,
  onAnswer,
}: {
  impact: CostImpact;
  onAnswer: (answer: boolean) => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onAnswer(false);
      }}
    >
      <DialogContent className="wide-dialog">
        <DialogHeader>
          <DialogTitle>Geçmiş tarihli işlemin maliyet etkisi</DialogTitle>
          <DialogDescription>
            Henüz kayıt yapılmadı. Onayınızla işlem ve aşağıdaki maliyet sürümü birlikte
            kaydedilecek. Satış tutarları, tahsilatlar ve özgün kayıt zamanları korunur.
          </DialogDescription>
        </DialogHeader>
        <p>{impact.rule}</p>
        <p>
          {impact.changedMovements} mevcut stok hareketinin maliyeti değişiyor. İşlem gününden
          sonraki hareketler yeniden değerlendirildi.
        </p>
        <DataTable
          headers={['Etkilenen ay', 'Hareket', 'Stok maliyeti hareket farkı', 'Brüt kâr farkı']}
        >
          {impact.changes.map((r) => (
            <Row key={r.month}>
              <Cell>{r.month}</Cell>
              <Cell>{r.movements}</Cell>
              <Cell>{tl(r.costDelta)}</Cell>
              <Cell>{tl(r.profitDelta)}</Cell>
            </Row>
          ))}
        </DataTable>
        <p className="muted">
          Pozitif brüt kâr farkı artış, negatif fark azalıştır. Fire ve tedarikçi iade farkları
          ilgili dönem raporunda yeniden hesaplanır.
        </p>
        <div className="form-footer">
          <Button variant="outline" onClick={() => onAnswer(false)}>
            Kaydetmeden geri dön
          </Button>
          <Button onClick={() => onAnswer(true)}>Maliyet etkisini onayla ve kaydet</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
