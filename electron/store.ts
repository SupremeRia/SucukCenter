import { appearanceIds } from '../shared/themes';
import Database from 'better-sqlite3';
import { mkdirSync, existsSync, renameSync, rmSync, realpathSync } from 'node:fs';
import path from 'node:path';
import {
  commandSchema,
  MAX,
  roundedRatio,
  type Command,
  type Snapshot,
  type Product,
  type Document,
  type Item,
  type Party,
  type Collection,
  type Cash,
  type CostImpact,
} from '../shared/contracts';
import { migrate, APPLICATION_ID, SCHEMA_VERSION } from './migrations';
import { canonical, contentHash, reconcile } from './reconcile';
import { purchasing, registerPurchase } from './purchasing';
import { stamp, occurred, cancelDate } from './events';
import { randomUUID } from 'node:crypto';
import {
  affectedProducts,
  stageProducts,
  recost,
  approvalToken,
  effectiveDocuments,
  effectiveItems,
} from './costing';
import { turkeyDay } from '../shared/dates';
import { recordInfo, manageRecord } from './records';
import { fulfillment } from './preorders';

function limited(value: number) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX)
    throw new Error('İşlem sınırı aşıldı. Daha küçük bir işlem girin.');
  return value;
}
export class Store {
  static async openMigrating(file: string) {
    if (existsSync(file)) {
      const db = new Database(file);
      try {
        const version = db.pragma('user_version', { simple: true }) as number;
        if (version > 0 && version < SCHEMA_VERSION) {
          if (db.pragma('application_id', { simple: true }) !== APPLICATION_ID)
            throw new Error('SucukCenter veritabanı değil.');
          reconcile(db, version);
          const folder = path.join(path.dirname(file), 'yedekler');
          mkdirSync(folder, { recursive: true });
          const backup = path.join(folder, `gecis-v${version}-${randomUUID()}.db`);
          await db.backup(backup);
          Store.validateBackup(backup);
          db.pragma('foreign_keys=ON');
          try {
            db.transaction(() => {
              migrate(db, true);
              reconcile(db, SCHEMA_VERSION);
            })();
          } catch (error) {
            throw new Error(
              `Veritabanı güncellenemedi. Geçiş değişiklikleri geri alındı; mevcut veriler korundu. Geçiş öncesi yedek: ${backup}. Ayrıntı: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      } finally {
        db.close();
      }
    }
    return new Store(file);
  }
  db!: Database.Database;
  constructor(public readonly file: string) {
    this.open();
  }
  private open(cleanupInterrupted = true) {
    mkdirSync(path.dirname(this.file), { recursive: true });
    // Recover the closed original if power was lost between the restore renames.
    const interrupted = `${this.file}.before-restore`;
    if (!existsSync(this.file) && existsSync(interrupted)) renameSync(interrupted, this.file);
    this.db = new Database(this.file);
    try {
      this.db.function('tr_fold', { deterministic: true }, (v: any) =>
        String(v).toLocaleLowerCase('tr'),
      );
      this.db.function('tr_sort', { deterministic: true }, (v: any) =>
        Array.from(String(v).toLocaleLowerCase('tr'))
          .map((c) => {
            const i = 'abcçdefgğhıijklmnoöpqrsştuüvwxyz'.indexOf(c);
            return String(i < 0 ? c.charCodeAt(0) + 100 : i).padStart(5, '0');
          })
          .join(''),
      );
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = FULL');
      this.db.pragma('busy_timeout = 5000');
      migrate(this.db);
      this.db.pragma('journal_mode = WAL');
      if (cleanupInterrupted && existsSync(interrupted)) rmSync(interrupted);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  close() {
    if (this.db.open) {
      const result = this.db.pragma('wal_checkpoint(TRUNCATE)') as { busy: number }[];
      if (result[0]?.busy)
        throw new Error(
          'Veritabanı başka bir program tarafından kullanılıyor. O programı kapatıp tekrar deneyin.',
        );
      this.db.close();
    }
  }
  private insert(sql: string, ...args: any[]): number {
    return Number(this.db.prepare(sql).run(...args).lastInsertRowid);
  }
  private party(table: 'customers' | 'suppliers', id: number): Party {
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) as Party | undefined;
    if (!row) throw new Error('Firma kaydı bulunamadı.');
    return row;
  }
  private product(id: number): Product {
    const row = this.db.prepare('SELECT * FROM products WHERE id=?').get(id) as Product | undefined;
    if (!row) throw new Error('Ürün bulunamadı.');
    return row;
  }
  private activity(
    entity: string,
    id: number,
    description: string,
    customerId: number | null = null,
  ) {
    this.insert(
      'INSERT INTO activity(entity,entity_id,description,customer_id) VALUES(?,?,?,?)',
      entity,
      id,
      description,
      customerId,
    );
  }
  private ledger(customer: number, amount: number, kind: string, id: number) {
    limited(this.balance(customer) + amount);
    this.insert(
      'INSERT INTO customer_ledger(customer_id,amount,kind,entity_id) VALUES(?,?,?,?)',
      customer,
      amount,
      kind,
      id,
    );
  }
  private cash(
    kind: string,
    id: number,
    amount: number,
    note: string,
    reverses: number | null = null,
  ) {
    this.insert(
      'INSERT INTO cash_transactions(kind,entity_id,amount,note,reverses_id) VALUES(?,?,?,?,?)',
      kind,
      id,
      amount,
      note,
      reverses,
    );
  }
  private movement(
    product: number,
    quantity: number,
    cost: number,
    kind: string,
    id: number,
    note: string,
  ) {
    this.insert(
      'INSERT INTO stock_movements(product_id,quantity,cost,kind,entity_id,note) VALUES(?,?,?,?,?,?)',
      product,
      quantity,
      cost,
      kind,
      id,
      note,
    );
  }
  balance(customer: number): number {
    return (
      this.db
        .prepare('SELECT COALESCE(SUM(amount),0) AS n FROM customer_ledger WHERE customer_id=?')
        .get(customer) as { n: number }
    ).n;
  }
  private lastImpact: CostImpact | null = null;
  preview(input: unknown): CostImpact {
    const marker = {};
    let impact: CostImpact | null = null;
    try {
      this.db
        .transaction(() => {
          this.execute(input, undefined, true);
          impact = this.lastImpact;
          throw marker;
        })
        .immediate();
    } catch (e) {
      if (e !== marker) throw e;
    }
    if (!impact) throw new Error('İşlem önizlemesi hesaplanamadı.');
    return impact;
  }
  execute(input: unknown, approval?: string, preview = false): number {
    const command = commandSchema.parse(input);
    return this.db
      .transaction(() => {
        const start = (
          this.db.prepare('SELECT COALESCE(MAX(id),0) id FROM activity').get() as { id: number }
        ).id;
        if (command.type === 'correct' || command.type === 'manage')
          return this.special(command, approval, preview);
        if (['product', 'customer', 'supplier', 'settings'].includes(command.type)) {
          const r = this.dispatch(command);
          this.activityMetadata(start, new Date().toISOString());
          return r;
        }
        const operationId = 'operationId' in command ? command.operationId : undefined;
        if (!operationId) throw new Error('Finansal işlem için operationId gerekli.');
        const { operationId: _key, ...payload } = command as Command & { operationId: string };
        void _key;
        const json = canonical(payload);
        const hash = contentHash(json);
        const prior = this.db
          .prepare('SELECT * FROM operations WHERE operation_id=?')
          .get(operationId) as { content_hash: string; result: number } | undefined;
        if (prior) {
          if (prior.content_hash !== hash)
            throw new Error('Bu işlem anahtarı farklı içerikle kullanılmış. Yeni işlem başlatın.');
          this.lastImpact = {
            token: '',
            required: false,
            changes: [],
            changedMovements: 0,
            rule: 'Daha önce kaydedilmiş işlem; kayıtlı sonuç döndürülür.',
          };
          return prior.result;
        }
        const lastActivity = (
          this.db.prepare('SELECT COALESCE(MAX(id),0) id FROM activity').get() as { id: number }
        ).id;
        const products = affectedProducts(this.db, command);
        let executionCommand = { ...command, occurredAt: occurred(command) } as Command;
        // Voiding a mistaken expense corrects its original period; actual refunds have their own date.
        if (command.type === 'reverse' && command.entity === 'expense') {
          const original = this.db
            .prepare("SELECT occurred_at FROM event_meta WHERE entity='expense' AND entity_id=?")
            .get(command.id) as any;
          if (!original) throw new Error('Gider bulunamadı.');
          executionCommand = {
            ...command,
            occurredAt: original.occurred_at,
            occurredOn: undefined,
          };
        }
        const day = turkeyDay(occurred(executionCommand));
        const after = (
          this.db.prepare('SELECT COALESCE(MAX(id),0) n FROM stock_movements').get() as {
            n: number;
          }
        ).n;
        const state = this.db.prepare('SELECT COUNT(*) n FROM operations').get();
        const replay = stageProducts(this.db, products, day);
        const result = this.dispatch(executionCommand);
        const entity = command.type === 'reverse' ? command.entity + '_cancel' : command.type;
        if (
          !this.db
            .prepare('SELECT 1 FROM event_meta WHERE entity=? AND entity_id=?')
            .get(entity, result)
        )
          stamp(this.db, entity, result, executionCommand);
        const impact = recost(
          this.db,
          products,
          after,
          operationId,
          day,
          command.type === 'reverse' ? products : replay,
        );
        const token = approvalToken(command, impact, state);
        this.lastImpact = { ...impact, token };
        if (impact.required && !preview && approval !== token)
          throw new Error(
            'Geçmiş kayıt sonraki maliyetleri değiştiriyor. Güncel maliyet önizlemesini inceleyip onaylayın.',
          );
        this.db
          .prepare(
            'INSERT INTO activity_meta SELECT id,?,created_at FROM activity WHERE id>? AND id NOT IN(SELECT activity_id FROM activity_meta)',
          )
          .run(occurred(executionCommand), lastActivity);
        this.insert(
          'INSERT INTO operations(operation_id,content_hash,request_json,result) VALUES(?,?,?,?)',
          operationId,
          hash,
          json,
          result,
        );
        return result;
      })
      .immediate();
  }
  private special(
    c: Extract<Command, { type: 'correct' | 'manage' }>,
    approval?: string,
    preview = false,
  ): number {
    if (!c.operationId) throw new Error('İşlem anahtarı gerekli.');
    const json = canonical(c),
      hash = contentHash(json);
    const previous = this.db
      .prepare('SELECT * FROM operations WHERE operation_id=?')
      .get(c.operationId) as any;
    if (previous) {
      if (previous.content_hash !== hash)
        throw new Error('Bu işlem anahtarı farklı içerikle kullanılmış.');
      this.lastImpact = {
        token: '',
        required: false,
        changes: [],
        changedMovements: 0,
        rule: 'Önceden kaydedilmiş işlem.',
      };
      return previous.result;
    }
    const info = recordInfo(this.db, c);
    if (info.expected !== c.expected)
      throw new Error(
        'Kayıt veya bağlı işlemler değişti. Güncel veriyi yeniden yükleyin; form bilgileriniz korunuyor.',
      );
    const start = (this.db.prepare('SELECT COALESCE(MAX(id),0) n FROM activity').get() as any).n;
    let result: number;
    if (c.type === 'manage') {
      result = manageRecord(this.db, c);
      this.lastImpact = {
        token: '',
        required: false,
        changes: [],
        changedMovements: 0,
        rule: 'Kart yönetimi; para ve stok bakiyesi değişmez.',
      };
    } else {
      if (info.blocked) throw new Error(info.blocked);
      if (c.replacement.type !== c.entity || ['product', 'customer', 'supplier'].includes(c.entity))
        throw new Error('Düzeltmede kayıt türü değiştirilemez.');
      const next = {
        ...c.replacement,
        operationId: undefined,
        occurredAt: occurred(c.replacement),
        occurredOn: undefined,
      } as Command;
      const old = info.original!;
      const oldMeta = this.db
        .prepare('SELECT occurred_at FROM event_meta WHERE entity=? AND entity_id=?')
        .get(c.entity, c.id) as any;
      if (!oldMeta) throw new Error('Özgün işlem tarihi bulunamadı.');
      const products = [
        ...new Set([
          ...affectedProducts(this.db, next),
          ...affectedProducts(this.db, {
            type: 'reverse',
            entity: c.entity,
            id: c.id,
            reason: c.reason,
          } as Command),
        ]),
      ];
      const after = (
        this.db.prepare('SELECT COALESCE(MAX(id),0) n FROM stock_movements').get() as any
      ).n;
      const day = turkeyDay(occurred(next));
      let reversalRef = { entity: c.entity + '_cancel', id: c.id };
      if (c.entity === 'preorder_delivery') {
        const e = this.db.prepare('SELECT * FROM preorder_events WHERE id=?').get(c.id) as any;
        if (next.type !== 'preorder_delivery' || next.orderId !== e.order_id)
          throw new Error(
            'Teslimat başka siparişe taşınamaz; özgün siparişte iade ve yeni siparişte teslimat akışını kullanın.',
          );
        const reverse: Command = {
          type: 'preorder_return',
          deliveryId: c.id,
          physicalReturn: true,
          note: 'Yanlış kaydı düzeltme: ' + c.reason,
          occurredAt: oldMeta.occurred_at,
        };
        const id = this.dispatch(reverse);
        reversalRef = { entity: 'preorder_return', id };
        stamp(this.db, 'preorder_return', id, reverse);
      } else if (c.entity === 'preorder') {
        const o = this.db.prepare('SELECT * FROM preorders WHERE id=?').get(c.id) as any;
        const cancel: Command = {
          type: 'preorder_cancel',
          orderId: c.id,
          quantity: o.quantity,
          note: c.reason,
          occurredAt: oldMeta.occurred_at,
        };
        const reversal = this.dispatch(cancel);
        reversalRef = { entity: 'preorder_cancel', id: reversal };
        if (
          !this.db
            .prepare('SELECT 1 FROM event_meta WHERE entity=? AND entity_id=?')
            .get('preorder_cancel', reversal)
        )
          stamp(this.db, 'preorder_cancel', reversal, cancel);
      } else {
        const reverse = {
          type: 'reverse',
          entity: c.entity,
          id: c.id,
          reason: 'Düzeltme: ' + c.reason,
          occurredAt: oldMeta.occurred_at,
        } as Command;
        this.dispatch(reverse);
        if (
          !this.db
            .prepare('SELECT 1 FROM event_meta WHERE entity=? AND entity_id=?')
            .get(c.entity + '_cancel', c.id)
        )
          stamp(this.db, c.entity + '_cancel', c.id, reverse);
      }
      // Rebuild the stock available on the replacement day after undoing the old effect.
      stageProducts(this.db, products, day);
      result = this.dispatch(next);
      if (
        !this.db
          .prepare('SELECT 1 FROM event_meta WHERE entity=? AND entity_id=?')
          .get(next.type, result)
      )
        stamp(this.db, next.type, result, next);
      const impact = recost(this.db, products, after, c.operationId, day, products);
      const token = approvalToken(c, impact, c.expected);
      this.lastImpact = { ...impact, token };
      if (impact.required && !preview && approval !== token)
        throw new Error('Etkilenen dönem maliyetlerini önizleyip onaylayın.');
      this.insert(
        'INSERT INTO corrections(entity,original_id,replacement_entity,replacement_id,reversal_entity,reversal_id,reason,old_json,new_json) VALUES(?,?,?,?,?,?,?,?,?)',
        c.entity,
        c.id,
        next.type,
        result,
        reversalRef.entity,
        reversalRef.id,
        c.reason,
        canonical(old),
        canonical(next),
      );
      this.activity(
        next.type,
        result,
        '#' + c.id + ' kayıt düzeltildi → #' + result + '. Gerekçe: ' + c.reason,
      );
    }
    this.activityMetadata(start, new Date().toISOString());
    this.insert(
      'INSERT INTO operations(operation_id,content_hash,request_json,result) VALUES(?,?,?,?)',
      c.operationId,
      hash,
      json,
      result,
    );
    return result;
  }
  private activityMetadata(after: number, date: string) {
    this.db
      .prepare(
        'INSERT INTO activity_meta SELECT id,?,created_at FROM activity WHERE id>? AND id NOT IN(SELECT activity_id FROM activity_meta)',
      )
      .run(date, after);
  }
  private dispatch(c: Command, saleTotalOverride?: number, linked = false): number {
    const fulfillmentResult = fulfillment(this.db, c, (command, total, allowLinked) =>
      this.dispatch(command, total, allowLinked),
    );
    if (fulfillmentResult !== undefined) return fulfillmentResult;
    const supplierResult = purchasing(this.db, c);
    if (supplierResult !== undefined) return supplierResult;
    if (
      (c.type === 'product' || c.type === 'customer' || c.type === 'supplier') &&
      c.id &&
      c.expected &&
      recordInfo(this.db, { entity: c.type, id: c.id }).expected !== c.expected
    )
      throw new Error('Kayıt değişti. Güncel veriyi yeniden yükleyin.');
    if (c.type === 'product') {
      let id = c.id;
      let priorPrice: number | undefined;
      if (id) {
        const old = this.product(id);
        priorPrice = old.price;
        if (
          old.unit !== c.unit &&
          (this.db.prepare('SELECT 1 FROM stock_movements WHERE product_id=? LIMIT 1').get(id) ||
            this.db.prepare('SELECT 1 FROM preorders WHERE product_id=? LIMIT 1').get(id))
        )
          throw new Error('Hareket görmüş ürünün birimi değiştirilemez.');
        this.db
          .prepare('UPDATE products SET name=?,unit=?,price=?,critical=?,active=? WHERE id=?')
          .run(c.name, c.unit, c.price, c.critical, Number(c.active), id);
      } else
        id = this.insert(
          "INSERT INTO products(id,name,unit,price,critical,active) VALUES((SELECT COALESCE(MAX(n),0)+1 FROM (SELECT id n FROM products UNION ALL SELECT entity_id n FROM activity WHERE entity='product')),?,?,?,?,?)",
          c.name,
          c.unit,
          c.price,
          c.critical,
          Number(c.active),
        );
      if (c.defaultSupplierId !== undefined)
        this.db
          .prepare('UPDATE products SET default_supplier_id=? WHERE id=?')
          .run(c.defaultSupplierId, id);
      this.activity(
        'product',
        id,
        `${c.name} ürün bilgileri ${c.id ? 'güncellendi' : 'oluşturuldu'}.${priorPrice !== undefined && priorPrice !== c.price ? ' Önceki satış fiyatı: ' + priorPrice / 100 + ' TL; yeni satış fiyatı: ' + c.price / 100 + ' TL.' : ''}`,
      );
      return id;
    }
    if (c.type === 'customer' || c.type === 'supplier') {
      const table = c.type === 'customer' ? 'customers' : 'suppliers';
      let id = c.id;
      if (id) {
        this.party(table, id);
        this.db
          .prepare(`UPDATE ${table} SET name=?,address=?,contact=?,phone=? WHERE id=?`)
          .run(c.name, c.address, c.contact, c.phone, id);
      } else
        id = this.insert(
          `INSERT INTO ${table}(id,name,address,contact,phone) VALUES((SELECT COALESCE(MAX(n),0)+1 FROM (SELECT id n FROM ${table} UNION ALL SELECT entity_id n FROM activity WHERE entity='${c.type}')),?,?,?,?)`,
          c.name,
          c.address,
          c.contact,
          c.phone,
        );
      this.activity(
        c.type,
        id,
        `${c.name} ${c.type === 'customer' ? 'müşteri' : 'tedarikçi'} bilgileri ${c.id ? 'güncellendi' : 'oluşturuldu'}.`,
        c.type === 'customer' ? id : null,
      );
      return id;
    }
    if (c.type === 'purchase' || c.type === 'sale') {
      const sale = c.type === 'sale';
      occurred(c);
      if (c.lines.some((l) => l.price === 0) && (!c.free || !c.freeReason?.trim()))
        throw new Error('Sıfır fiyat için Bedelsiz işlem seçimi ve gerekçe gerekli.');
      const party = this.party(
        sale ? 'customers' : 'suppliers',
        sale ? c.customerId : c.supplierId,
      );
      if (!party.active && !linked)
        throw new Error('Firma arşivlenmiş. Yeni işlem için yeniden etkinleştirin.');
      const table = sale ? 'sales' : 'purchases';
      const items = sale ? 'sale_items' : 'purchase_items';
      const id = this.insert(
        `INSERT INTO ${table}(party_id,total,cost,note) VALUES(?,0,0,?)`,
        party.id,
        c.note,
      );
      let total = 0;
      let cost = 0;
      for (const line of c.lines) {
        const p = this.product(line.productId);
        if (!p.active && !linked)
          throw new Error(`${p.name} arşivlenmiş. Önce ürünü etkinleştirin.`);
        if (p.unit === 'Adet' && line.quantity % 1000)
          throw new Error('Adet miktarı tam sayı olmalı.');
        if (sale && p.stock < line.quantity)
          throw new Error(
            `${p.name}: ${turkeyDay(occurred(c))} tarihinde yetersiz tarihsel stok; eksik ${(line.quantity - p.stock) / 1000} ${p.unit}. Önce bu tarihten önceki stok girişini düzeltin. İşlem kaydedilmedi.`,
          );
        const amount =
          sale && saleTotalOverride !== undefined
            ? saleTotalOverride
            : roundedRatio(line.quantity, line.price, 1000);
        const lineCost = sale ? roundedRatio(p.cost, line.quantity, p.stock) : amount;
        total = limited(total + amount);
        cost = limited(cost + lineCost);
        this.insert(
          `INSERT INTO ${items}(document_id,product_id,product,unit,quantity,price,total,cost) VALUES(?,?,?,?,?,?,?,?)`,
          id,
          p.id,
          p.name,
          p.unit,
          line.quantity,
          line.price,
          amount,
          lineCost,
        );
        const direction = sale ? -1 : 1;
        this.db
          .prepare('UPDATE products SET stock=?,cost=? WHERE id=?')
          .run(
            limited(p.stock + direction * line.quantity),
            limited(p.cost + direction * lineCost),
            p.id,
          );
        this.movement(p.id, direction * line.quantity, direction * lineCost, c.type, id, c.note);
        const quantity = (line.quantity / 1000).toLocaleString('tr-TR', {
          maximumFractionDigits: 3,
        });
        this.activity(
          c.type,
          id,
          sale
            ? `${party.name} firmasına ${quantity} ${p.unit} ${p.name} satıldı.`
            : `${party.name} firmasından ${quantity} ${p.unit} ${p.name} depoya giriş yaptı.`,
          sale ? party.id : null,
        );
      }
      this.db.prepare(`UPDATE ${table} SET total=?,cost=? WHERE id=?`).run(total, cost, id);
      if (sale) this.ledger(party.id, total, 'sale', id);
      else registerPurchase(this.db, id, c, total);
      return id;
    }
    if (c.type === 'customer_debt' || c.type === 'customer_credit') {
      const party = this.party('customers', c.customerId);
      const id = this.insert(
        'INSERT INTO customer_adjustments(customer_id,kind,amount,category,note,reference) VALUES(?,?,?,?,?,?)',
        party.id,
        c.type,
        c.amount,
        c.type === 'customer_debt' ? c.category : 'credit',
        c.note,
        c.reference || '',
      );
      this.ledger(party.id, c.amount * (c.type === 'customer_debt' ? 1 : -1), c.type, id);
      this.activity(
        c.type,
        id,
        `${party.name}: ${(c.amount / 100).toLocaleString('tr-TR')} TL cari ${c.type === 'customer_debt' ? 'borç' : 'alacak'} eklendi. ${c.note}`,
        party.id,
      );
      return id;
    }
    if (c.type === 'collection' || c.type === 'refund') {
      const party = this.party('customers', c.customerId);
      const refund = c.type === 'refund';
      const available = this.balance(party.id) * (refund ? -1 : 1);
      if (refund && c.amount > available)
        throw new Error('İade tutarı müşterinin alacağından fazla olamaz.');
      const id = this.insert(
        'INSERT INTO collections(customer_id,amount,method,note,kind) VALUES(?,?,?,?,?)',
        party.id,
        c.amount,
        c.method,
        c.note,
        c.type,
      );
      this.ledger(party.id, c.amount * (refund ? 1 : -1), c.type, id);
      this.cash(c.type, id, c.amount * (refund ? -1 : 1), `${party.name} • ${c.note}`);
      this.activity(
        c.type,
        id,
        `${party.name} ${refund ? 'firmasına' : 'firmasından'} ${(c.amount / 100).toLocaleString('tr-TR')} TL ${refund ? 'para iadesi' : 'tahsilat'} yapıldı.`,
        party.id,
      );
      return id;
    }
    if (c.type === 'expense') {
      const name = c.name || c.note;
      if (!name.trim() || name.length > 200)
        throw new Error('Giderin adı gerekli; en fazla 200 karakter girin.');
      const id = this.cashId(-c.amount, name + (c.note ? ' • ' + c.note : ''));
      this.db
        .prepare('INSERT INTO expense_details VALUES(?,?,?,?)')
        .run(id, name, c.note, c.method || null);
      this.activity(
        'expense',
        id,
        `${name}: ${(c.amount / 100).toLocaleString('tr-TR')} TL gider kaydedildi.`,
      );
      return id;
    }
    if (c.type === 'expense_refund') {
      const original = this.db
        .prepare("SELECT * FROM cash_transactions WHERE id=? AND kind='expense'")
        .get(c.expenseId) as Cash | undefined;
      if (!original) throw new Error('Gider bulunamadı.');
      cancelDate(this.db, 'expense', c.expenseId, occurred(c));
      if (this.db.prepare('SELECT 1 FROM cash_transactions WHERE reverses_id=?').get(c.expenseId))
        throw new Error('Gider zaten iptal edilmiş, düzeltilmiş veya iade alınmış.');
      this.cash('expense_refund', c.expenseId, -original.amount, c.note, original.id);
      this.activity(
        'expense',
        c.expenseId,
        '#' + c.expenseId + ' giderinin tamamı iade alındı. ' + c.note,
      );
      return c.expenseId;
    }
    if (c.type === 'reverse') return this.reverse(c, linked);
    if (c.type === 'adjust') {
      const p = this.product(c.productId);
      if (c.quantity > 0)
        throw new Error('Stok artırmak için maliyetiyle gelen sipariş oluşturun.');
      if (p.stock + c.quantity < 0) throw new Error('Stok sıfırın altına düşemez.');
      if (p.unit === 'Adet' && c.quantity % 1000) throw new Error('Adet miktarı tam sayı olmalı.');
      const cost = roundedRatio(p.cost, -c.quantity, p.stock);
      this.db
        .prepare('UPDATE products SET stock=stock+?,cost=cost-? WHERE id=?')
        .run(c.quantity, cost, p.id);
      const id = this.insert(
        "INSERT INTO stock_movements(product_id,quantity,cost,kind,entity_id,note) VALUES(?,?,?,'adjust',0,?)",
        p.id,
        c.quantity,
        -cost,
        c.reason,
      );
      this.activity(
        'product',
        p.id,
        `${p.name}: ${-c.quantity / 1000} ${p.unit} stok kaybı. Neden: ${c.reason}`,
      );
      return id;
    }
    if (c.type !== 'settings') throw new Error('Desteklenmeyen işlem.');
    this.db.prepare("UPDATE settings SET value=? WHERE key='theme'").run(c.theme);
    this.db
      .prepare(
        "INSERT INTO settings(key,value) VALUES('appearance',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(c.appearance || (c.theme === 'light' ? 'gray' : 'classic'));
    this.db.prepare("UPDATE settings SET value=? WHERE key='company'").run(c.company);
    if (c.autoBackup !== undefined)
      this.db
        .prepare("UPDATE settings SET value=? WHERE key='autoBackup'")
        .run(String(c.autoBackup));
    if (c.retention !== undefined)
      this.db
        .prepare("UPDATE settings SET value=? WHERE key='backupRetention'")
        .run(String(c.retention));
    this.activity('settings', 0, 'Uygulama ayarları güncellendi.');
    return 0;
  }
  private cashId(amount: number, note: string) {
    const id = this.insert(
      "INSERT INTO cash_transactions(kind,entity_id,amount,note) VALUES('expense',0,?,?)",
      amount,
      note,
    );
    return id;
  }
  private reverse(c: Extract<Command, { type: 'reverse' }>, linked = false) {
    if (
      !linked &&
      c.entity === 'sale' &&
      this.db.prepare('SELECT 1 FROM preorder_events WHERE sale_id=?').get(c.id)
    )
      throw new Error(
        'Bu satış ön sipariş teslimine bağlı. Ürün teslimatı ekranından fiziksel iade kaydedin.',
      );
    if (
      c.entity === 'collection' &&
      (
        this.db
          .prepare(
            'SELECT COALESCE(SUM(f.paid_delta),0) n FROM preorder_funding f JOIN preorder_events a ON a.id=f.allocation_id WHERE a.collection_id=?',
          )
          .get(c.id) as any
      ).n > 0
    )
      throw new Error(
        'Tahsilat siparişe bağlı. Önce teslimat/ödeme bağlantılarını ters işlemle serbest bırakın.',
      );
    cancelDate(this.db, c.entity, c.id, occurred(c));
    if (c.entity === 'customer_debt' || c.entity === 'customer_credit') {
      const row = this.db
        .prepare('SELECT * FROM customer_adjustments WHERE id=? AND kind=?')
        .get(c.id, c.entity) as any;
      if (!row || row.status !== 'active')
        throw new Error('Cari kayıt bulunamadı veya zaten iptal edilmiş.');
      this.db.prepare("UPDATE customer_adjustments SET status='cancelled' WHERE id=?").run(c.id);
      this.ledger(
        row.customer_id,
        row.amount * (c.entity === 'customer_debt' ? -1 : 1),
        c.entity + '_cancel',
        c.id,
      );
      this.activity(
        c.entity,
        c.id,
        `#${c.id} cari kayıt ters işlemle iptal edildi. Gerekçe: ${c.reason}`,
        row.customer_id,
      );
      return c.id;
    }
    if (c.entity === 'sale') {
      const doc = this.db.prepare('SELECT * FROM sales WHERE id=?').get(c.id) as
        | Document
        | undefined;
      if (!doc || doc.status !== 'active')
        throw new Error('Satış bulunamadı veya zaten iptal edilmiş.');
      const lines = this.db
        .prepare('SELECT * FROM sale_items WHERE document_id=?')
        .all(c.id) as Item[];
      for (const line of lines) {
        const p = this.product(line.product_id);
        this.db
          .prepare('UPDATE products SET stock=?,cost=? WHERE id=?')
          .run(limited(p.stock + line.quantity), limited(p.cost + line.cost), p.id);
        this.movement(p.id, line.quantity, line.cost, 'sale_cancel', c.id, c.reason);
      }
      this.db.prepare("UPDATE sales SET status='cancelled' WHERE id=?").run(c.id);
      this.ledger(doc.party_id, -doc.total, 'sale_cancel', c.id);
      this.activity(
        'sale',
        c.id,
        `#S-${c.id} satışının tamamı iade/iptal edildi; ürünler stoğa alındı. Neden: ${c.reason}`,
        doc.party_id,
      );
    } else {
      const expense = c.entity === 'expense';
      const row = this.db
        .prepare(
          expense
            ? "SELECT * FROM cash_transactions WHERE id=? AND kind='expense'"
            : 'SELECT * FROM collections WHERE id=? AND kind=?',
        )
        .get(...(expense ? [c.id] : [c.id, c.entity])) as (Cash & Collection) | undefined;
      if (!row || (!expense && row.status !== 'active'))
        throw new Error('Kayıt bulunamadı veya zaten iptal edilmiş.');
      const cash = expense
        ? row
        : (this.db
            .prepare(
              'SELECT * FROM cash_transactions WHERE kind=? AND entity_id=? AND reverses_id IS NULL',
            )
            .get(c.entity, c.id) as Cash);
      if (this.db.prepare('SELECT 1 FROM cash_transactions WHERE reverses_id=?').get(cash.id))
        throw new Error('İşlem zaten iptal edilmiş.');
      this.cash(`${c.entity}_cancel`, c.id, -cash.amount, c.reason, cash.id);
      if (!expense) {
        this.db.prepare("UPDATE collections SET status='cancelled' WHERE id=?").run(c.id);
        this.ledger(
          row.customer_id,
          c.entity === 'refund' ? -row.amount : row.amount,
          `${c.entity}_cancel`,
          c.id,
        );
      }
      this.activity(
        c.entity,
        c.id,
        `#${c.id} ${expense ? 'gider' : c.entity === 'refund' ? 'para iadesi' : 'tahsilat'} kaydı iptal edildi. Neden: ${c.reason}`,
        expense ? null : row.customer_id,
      );
    }
    return c.id;
  }
  snapshot(): Snapshot {
    // A read transaction keeps all dashboard totals and lists on one consistent snapshot.
    return this.db.transaction(() => {
      const products = this.db.prepare('SELECT * FROM products ORDER BY name').all() as Product[];
      products.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      const customers = this.db
        .prepare(
          'SELECT c.*,COALESCE(SUM(l.amount),0) balance FROM customers c LEFT JOIN customer_ledger l ON l.customer_id=c.id GROUP BY c.id',
        )
        .all() as Party[];
      const suppliers = this.db
        .prepare(
          'SELECT s.*,COALESCE((SELECT SUM(amount) FROM supplier_ledger l WHERE l.supplier_id=s.id),0) balance FROM suppliers s',
        )
        .all() as Party[];
      for (const list of [customers, suppliers])
        list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      const sales = this.db
        .prepare(
          "SELECT s.*,c.name party,e.occurred_at,e.recorded_at,e.free_reason FROM sales s JOIN customers c ON c.id=s.party_id LEFT JOIN event_meta e ON e.entity='sale' AND e.entity_id=s.id ORDER BY s.id DESC",
        )
        .all() as Document[];
      const purchases = this.db
        .prepare(
          "SELECT s.*,c.name party,e.occurred_at,e.recorded_at,e.reference,e.free_reason FROM purchases s JOIN suppliers c ON c.id=s.party_id LEFT JOIN event_meta e ON e.entity='purchase' AND e.entity_id=s.id ORDER BY s.id DESC",
        )
        .all() as Document[];
      effectiveDocuments(this.db, sales, 'sale');
      const collections = this.db
        .prepare(
          'SELECT s.*,c.name party,e.occurred_at,e.recorded_at FROM collections s JOIN customers c ON c.id=s.customer_id LEFT JOIN event_meta e ON e.entity=s.kind AND e.entity_id=s.id ORDER BY s.id DESC',
        )
        .all() as Collection[];
      const cash = this.db
        .prepare(
          "SELECT c.*,COALESCE(e.occurred_at,c.created_at) occurred_at,c.created_at recorded_at FROM cash_transactions c LEFT JOIN supplier_payments p ON(p.legacy_cash_id=c.id OR p.legacy_cash_id=c.reverses_id) LEFT JOIN event_meta e ON e.entity=CASE WHEN p.id IS NOT NULL THEN CASE WHEN c.reverses_id IS NULL THEN 'supplier_payment' ELSE 'supplier_payment_cancel' END ELSE c.kind END AND e.entity_id=CASE WHEN p.id IS NOT NULL THEN p.id WHEN c.kind='expense' THEN c.id ELSE c.entity_id END ORDER BY c.id DESC",
        )
        .all() as Cash[];
      const sum = (rows: any[], field: string) => rows.reduce((n, r) => n + r[field], 0);
      const activeSales = sales.filter((s) => s.status === 'active');
      const revenue = sum(activeSales, 'total');
      const cogs = sum(activeSales, 'cost');
      const settings = Object.fromEntries(
        (this.db.prepare('SELECT * FROM settings').all() as { key: string; value: string }[]).map(
          (r) => [r.key, r.value],
        ),
      ) as Snapshot['settings'];
      return {
        supplierPayments: this.db
          .prepare(
            'SELECT p.*,s.name party FROM supplier_payments p JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.id DESC',
          )
          .all(),
        supplierReturns: effectiveDocuments(
          this.db,
          this.db
            .prepare(
              'SELECT r.*,s.name party FROM supplier_returns r JOIN suppliers s ON s.id=r.supplier_id ORDER BY r.id DESC',
            )
            .all(),
          'supplier_return',
        ),
        migrationReview: this.db.prepare('SELECT * FROM migration_review').all(),
        products,
        customers,
        suppliers,
        sales,
        purchases,
        collections,
        preorders: this.db
          .prepare('SELECT * FROM preorder_summary ORDER BY id')
          .all() as NonNullable<Snapshot['preorders']>,
        preorderEvents: this.db
          .prepare(
            'SELECT e.*,m.occurred_at,m.recorded_at,o.product,o.unit,o.customer_id FROM preorder_events e JOIN preorders o ON o.id=e.order_id JOIN event_meta m ON m.entity=e.kind AND m.entity_id=e.id ORDER BY e.id',
          )
          .all() as NonNullable<Snapshot['preorderEvents']>,
        customerAdjustments: this.db
          .prepare(
            'SELECT a.*,c.name party,e.occurred_at,e.recorded_at FROM customer_adjustments a JOIN customers c ON c.id=a.customer_id JOIN event_meta e ON e.entity=a.kind AND e.entity_id=a.id ORDER BY a.id DESC',
          )
          .all() as NonNullable<Snapshot['customerAdjustments']>,
        cash,
        settings,
        dbPath: this.file,
        saleItems: effectiveItems(
          this.db,
          this.db.prepare('SELECT * FROM sale_items').all(),
          'sale',
        ) as Item[],
        purchaseItems: this.db.prepare('SELECT * FROM purchase_items').all() as Item[],
        activities: this.db
          .prepare(
            'SELECT a.*,COALESCE(m.occurred_at,a.created_at) created_at,a.created_at recorded_at FROM activity a LEFT JOIN activity_meta m ON m.activity_id=a.id ORDER BY a.id DESC',
          )
          .all() as Snapshot['activities'],
        movements: this.db
          .prepare(
            'SELECT m.*,p.name product FROM stock_movements m JOIN products p ON p.id=m.product_id ORDER BY m.id DESC',
          )
          .all() as Snapshot['movements'],
        summary: {
          debt: customers.reduce((n, c) => n + Math.max(0, c.balance), 0),
          credit: customers.reduce((n, c) => n + Math.max(0, -c.balance), 0),
          collected: sum(
            collections.filter((c) => c.status === 'active' && c.kind === 'collection'),
            'amount',
          ),
          revenue,
          cogs,
          profit: revenue - cogs,
          purchases: sum(purchases, 'total'),
          expenses: cash
            .filter(
              (c) =>
                c.kind === 'expense' || c.kind === 'expense_cancel' || c.kind === 'expense_refund',
            )
            .reduce((n, c) => n - c.amount, 0),
          cash: sum(cash, 'amount'),
          stockValue: sum(products, 'cost'),
        },
      };
    })();
  }
  async backup(destination: string) {
    this.checkDestination(destination);
    await this.db.backup(destination);
  }
  private checkDestination(file: string) {
    const resolve = (f: string) =>
      (existsSync(f) ? realpathSync.native(f) : path.resolve(f)).toLowerCase();
    const target = resolve(file);
    const current = resolve(this.file);
    if (target === current || target.startsWith(`${current}-`) || target.startsWith(`${current}.`))
      throw new Error(
        'Yedek için kullanılan veritabanından ve çalışma dosyalarından farklı bir dosya seçin.',
      );
  }
  static validateBackup(file: string) {
    const candidate = new Database(file, { readonly: true, fileMustExist: true });
    try {
      if (
        candidate.pragma('application_id', { simple: true }) !== APPLICATION_ID ||
        ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].includes(
          candidate.pragma('user_version', { simple: true }) as number,
        )
      )
        throw new Error('Uyumlu bir SucukCenter yedeği seçin.');
      if (
        candidate.pragma('integrity_check', { simple: true }) !== 'ok' ||
        (candidate.pragma('foreign_key_check') as unknown[]).length
      )
        throw new Error('Yedek bütünlük kontrolünden geçemedi.');
      for (const table of [
        'products',
        'customers',
        'suppliers',
        'sales',
        'sale_items',
        'purchases',
        'purchase_items',
        'collections',
        'customer_ledger',
        'cash_transactions',
        'activity',
        'stock_movements',
        'settings',
      ])
        candidate.prepare(`SELECT * FROM ${table} LIMIT 1`).get();
      if (
        (
          candidate.prepare('SELECT COUNT(*) n FROM products WHERE stock<0 OR cost<0').get() as {
            n: number;
          }
        ).n
      )
        throw new Error('Yedek stok kayıtları geçersiz.');
      const version = candidate.pragma('user_version', { simple: true }) as number;
      if (version >= 4) {
        candidate.prepare('SELECT * FROM backup_history LIMIT 1').get();
        const values = Object.fromEntries(
          (
            candidate.prepare('SELECT * FROM settings').all() as { key: string; value: string }[]
          ).map((r) => [r.key, r.value]),
        );
        if (version >= 11 && !appearanceIds.includes(values.appearance as any))
          throw new Error('Yedek görünüm tercihi geçersiz.');
        const retention = Number(values.backupRetention);
        if (
          !['true', 'false'].includes(values.autoBackup) ||
          !Number.isInteger(retention) ||
          retention < 1 ||
          retention > 30
        )
          throw new Error('Yedek tercihleri geçersiz.');
      }
      reconcile(candidate, version);
    } finally {
      candidate.close();
    }
  }
  async restore(source: string): Promise<string> {
    this.checkDestination(source);
    Store.validateBackup(source);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const recovery = path.join(path.dirname(this.file), `geri-donus-${stamp}.db`);
    const stage = `${this.file}.restore-${stamp}`;
    const previous = `${this.file}.before-restore`;
    const candidate = new Database(source, { readonly: true, fileMustExist: true });
    try {
      await candidate.backup(stage);
    } finally {
      candidate.close();
    }
    let replacing = false;
    try {
      Store.validateBackup(stage);
      const migrated = await Store.openMigrating(stage);
      migrated.close();
      await this.backup(recovery);
      Store.validateBackup(recovery);
      this.close();
      replacing = true;
      // Both files are closed/checkpointed; recovery remains available even after a power interruption.
      renameSync(this.file, previous);
      renameSync(stage, this.file);
      this.open(false);
      const priorActivity = (
        this.db.prepare('SELECT COALESCE(MAX(id),0) id FROM activity').get() as { id: number }
      ).id;
      this.db.transaction(() =>
        this.activity(
          'settings',
          0,
          `Yedekten geri yüklendi. Geri dönüş yedeği: ${path.basename(recovery)}`,
        ),
      )();
      this.activityMetadata(priorActivity, new Date().toISOString());
      rmSync(previous);
      return recovery;
    } catch (error) {
      if (replacing && existsSync(recovery)) {
        if (this.db.open) this.close();
        if (existsSync(previous)) {
          if (existsSync(this.file)) rmSync(this.file);
          renameSync(previous, this.file);
        } else {
          const rollback = new Database(recovery, { readonly: true });
          try {
            await rollback.backup(this.file);
          } finally {
            rollback.close();
          }
        }
        this.open();
      }
      throw error;
    } finally {
      if (existsSync(stage)) rmSync(stage);
    }
  }
}
