import { appearanceIds } from './themes';
import { z } from 'zod';
export const MAX = 1_000_000_000_000;
const id = z.number().int().positive().max(1_000_000_000);
const money = z.number().int().min(0).max(MAX);
const qty = z.number().int().positive().max(MAX);
const text = z.string().trim().min(1).max(200);
const contact = {
  name: text,
  address: z.string().trim().max(1000),
  contact: z.string().trim().max(200),
  phone: z.string().trim().max(40),
};
const line = z.object({ productId: id, quantity: qty, price: money }).strict();
const operation = { operationId: z.uuid().optional() };
const event = {
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
};
const free = { free: z.boolean().optional(), freeReason: z.string().trim().max(200).optional() };
export const basicCommandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('expense_refund'),
      ...operation,
      ...event,
      expenseId: id,
      note: text,
    })
    .strict(),
  z
    .object({
      type: z.literal('preorder'),
      ...operation,
      ...event,
      customerId: id,
      productId: id,
      quantity: qty,
      price: money,
      source: z.enum(['prepaid', 'other']),
      note: z.string().trim().min(1).max(1000),
      reference: z.string().trim().max(100).optional(),
      plannedOn: z.string().max(10).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('preorder_allocate'),
      ...operation,
      ...event,
      orderId: id,
      amount: money.refine((v) => v > 0),
      mode: z.enum(['new', 'advance', 'collection']),
      collectionId: id.optional(),
      method: z.enum(['Nakit', 'Banka', 'Kart']).optional(),
      note: z.string().trim().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal('preorder_unallocate'),
      ...operation,
      ...event,
      allocationId: id,
      note: text,
    })
    .strict(),
  z
    .object({
      type: z.literal('preorder_delivery'),
      ...operation,
      ...event,
      orderId: id,
      quantity: qty,
      note: z.string().trim().max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal('preorder_return'),
      ...operation,
      ...event,
      deliveryId: id,
      physicalReturn: z.literal(true),
      note: text,
    })
    .strict(),
  z
    .object({
      type: z.literal('preorder_cancel'),
      ...operation,
      ...event,
      orderId: id,
      quantity: qty,
      note: text,
    })
    .strict(),
  z
    .object({
      type: z.literal('customer_debt'),
      ...operation,
      ...event,
      customerId: id,
      amount: money.refine((v) => v > 0),
      category: z.enum(['carry', 'other']),
      note: z.string().trim().min(1).max(1000),
      reference: z.string().trim().max(100).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('customer_credit'),
      ...operation,
      ...event,
      customerId: id,
      amount: money.refine((v) => v > 0),
      note: z.string().trim().min(1).max(1000),
      reference: z.string().trim().max(100).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('product'),
      expected: z.string().length(64).optional(),
      id: id.optional(),
      name: text,
      unit: z.enum(['Kg', 'Litre', 'Adet']),
      price: money,
      critical: money,
      active: z.boolean(),
      defaultSupplierId: id.nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('customer'),
      id: id.optional(),
      expected: z.string().length(64).optional(),
      ...contact,
    })
    .strict(),
  z
    .object({
      type: z.literal('supplier'),
      id: id.optional(),
      expected: z.string().length(64).optional(),
      ...contact,
    })
    .strict(),
  z
    .object({
      type: z.literal('purchase'),
      ...operation,
      ...event,
      ...free,
      reference: z.string().trim().max(100).optional(),
      method: z.enum(['Nakit', 'Banka', 'Kart']).optional(),
      supplierId: id,
      lines: z.array(line).min(1).max(100),
      paid: z.boolean(),
      note: z.string().trim().max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal('sale'),
      ...operation,
      ...event,
      ...free,
      customerId: id,
      lines: z.array(line).min(1).max(100),
      note: z.string().trim().max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal('collection'),
      ...operation,
      ...event,
      customerId: id,
      amount: money.refine((v) => v > 0),
      method: z.enum(['Nakit', 'Banka', 'Kart']),
      note: z.string().trim().max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal('refund'),
      ...operation,
      ...event,
      customerId: id,
      amount: money.refine((v) => v > 0),
      method: z.enum(['Nakit', 'Banka', 'Kart']),
      note: text,
    })
    .strict(),
  z
    .object({
      type: z.literal('expense'),
      ...operation,
      ...event,
      amount: money.refine((v) => v > 0),
      name: text.optional(),
      method: z.enum(['Nakit', 'Banka', 'Kart']).optional(),
      note: z.string().trim().max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal('reverse'),
      ...operation,
      ...event,
      entity: z.enum([
        'customer_debt',
        'customer_credit',
        'sale',
        'collection',
        'expense',
        'refund',
        'purchase',
        'supplier_payment',
        'supplier_refund',
        'supplier_return',
      ]),
      id,
      reason: text,
    })
    .strict(),
  z
    .object({
      type: z.literal('adjust'),
      ...operation,
      ...event,
      productId: id,
      quantity: z
        .number()
        .int()
        .min(-MAX)
        .max(MAX)
        .refine((v) => v !== 0),
      reason: text,
    })
    .strict(),
  z
    .object({
      type: z.literal('settings'),
      appearance: z.enum(appearanceIds).optional(),
      theme: z.enum(['light', 'dark']),
      company: text,
      autoBackup: z.boolean().optional(),
      retention: z.number().int().min(1).max(30).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('supplier_payment'),
      ...operation,
      ...event,
      supplierId: id,
      amount: money.refine((v) => v > 0),
      method: z.enum(['Nakit', 'Banka', 'Kart']),
      note: z.string().trim().max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal('supplier_refund'),
      ...operation,
      ...event,
      supplierId: id,
      amount: money.refine((v) => v > 0),
      method: z.enum(['Nakit', 'Banka', 'Kart']),
      note: text,
    })
    .strict(),
  z
    .object({
      type: z.literal('supplier_return'),
      ...operation,
      ...event,
      purchaseId: id,
      lines: z
        .array(z.object({ itemId: id, quantity: qty }).strict())
        .min(1)
        .max(100),
      note: text,
    })
    .strict(),
]);
export const recordSchema = z
  .object({
    entity: z.enum([
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
    ]),
    id,
  })
  .strict();
export type RecordRef = z.infer<typeof recordSchema>;
export const commandSchema = z.discriminatedUnion('type', [
  ...basicCommandSchema.options,
  z
    .object({
      type: z.literal('manage'),
      ...operation,
      entity: z.enum(['product', 'customer', 'supplier']),
      id,
      action: z.enum(['delete', 'archive', 'restore']),
      expected: z.string().length(64),
    })
    .strict(),
  z
    .object({
      type: z.literal('correct'),
      ...operation,
      ...event,
      entity: recordSchema.shape.entity,
      id,
      expected: z.string().length(64),
      reason: text,
      replacement: basicCommandSchema,
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export interface RecordInfo {
  ref: RecordRef;
  name: string;
  expected: string;
  active: boolean;
  dependencies: string[];
  obligations: string[];
  original: z.infer<typeof basicCommandSchema> | null;
  blocked: string;
  corrections: any[];
}

export interface Product {
  last_purchase_price?: number | null;
  default_supplier_id?: number | null;
  id: number;
  name: string;
  unit: 'Kg' | 'Litre' | 'Adet';
  price: number;
  critical: number;
  active: number;
  stock: number;
  cost: number;
}
export interface Party {
  active: number;
  id: number;
  name: string;
  address: string;
  contact: string;
  phone: string;
  balance: number;
}
export interface Document {
  original_cost?: number;
  occurred_at?: string;
  recorded_at?: string;
  reference?: string;
  free_reason?: string;
  id: number;
  party_id: number;
  party: string;
  total: number;
  cost: number;
  status: string;
  note: string;
  created_at: string;
}
export interface Item {
  id: number;
  document_id: number;
  product_id: number;
  product: string;
  unit: string;
  quantity: number;
  price: number;
  total: number;
  cost: number;
}
export interface Collection {
  occurred_at?: string;
  recorded_at?: string;
  id: number;
  customer_id: number;
  party: string;
  amount: number;
  method: string;
  note: string;
  status: string;
  created_at: string;
  kind: string;
}
export interface Activity {
  recorded_at?: string;
  id: number;
  entity: string;
  entity_id: number;
  customer_id: number | null;
  description: string;
  created_at: string;
}
export interface Cash {
  display_kind?: string;
  source_kind?: string;
  source_id?: number;
  occurred_at?: string;
  recorded_at?: string;
  id: number;
  kind: string;
  entity_id: number;
  amount: number;
  note: string;
  created_at: string;
  reverses_id: number | null;
}
export interface Movement {
  id: number;
  product_id: number;
  product: string;
  quantity: number;
  cost: number;
  kind: string;
  entity_id: number;
  note: string;
  created_at: string;
}
export interface Expense {
  id: number;
  effectId: number;
  effectKind: string;
  name: string;
  description: string;
  method: string | null;
  amount: number;
  occurred_at: string;
  recorded_at: string;
  status: string;
  refund_at: string | null;
}
export interface Snapshot {
  expenses?: Expense[];
  expenseTotal?: number;
  fulfillmentProducts?: { product: string; unit: string; quantity: number }[];
  fulfillmentEventCount?: number;
  fulfillmentSummary?: { reserved: number; debt: number; available: number; pending: number };
  preorders?: Preorder[];
  preorderEvents?: PreorderEvent[];
  customerAdjustments?: (Collection & { reference: string; category: string })[];
  costRevisions?: {
    id: number;
    operation_id: string;
    occurred_on: string;
    recorded_at: string;
    impact_json: string;
  }[];
  counts?: { customers: number; products: number; stockProducts: number; critical: number };
  pagination?: { offset: number; limit: number; total: number };
  backupHistory?: any[];
  supplierPayments: any[];
  supplierReturns: any[];
  migrationReview: any[];
  products: Product[];
  customers: Party[];
  suppliers: Party[];
  purchases: Document[];
  sales: Document[];
  purchaseItems: Item[];
  saleItems: Item[];
  collections: Collection[];
  activities: Activity[];
  cash: Cash[];
  movements: Movement[];
  settings: {
    theme: 'light' | 'dark';
    appearance?: string;
    company: string;
    autoBackup?: string;
    backupRetention?: string;
    autoBackupLastAt?: string;
    autoBackupLastError?: string;
  };
  dbPath: string;
  summary: {
    debt: number;
    credit: number;
    collected: number;
    revenue: number;
    cogs: number;
    profit: number;
    purchases: number;
    expenses: number;
    cash: number;
    stockValue: number;
  };
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export interface CostImpact {
  token: string;
  required: boolean;
  changes: { month: string; movements: number; costDelta: number; profitDelta: number }[];
  changedMovements: number;
  rule: string;
}
export const rangeSchema = z
  .object({ start: z.string().optional(), end: z.string().optional() })
  .strict();
export type DateRange = z.infer<typeof rangeSchema>;
export const viewSchema = z
  .object({
    includeArchived: z.boolean().default(false),
    customerSort: z.enum(['name', 'contact', 'phone', 'balance']).default('name'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
    preorderId: id.optional(),
    eventOffset: z.number().int().min(0).max(10000000).optional(),
    pendingOnly: z.boolean().optional(),
    plannedFrom: z.string().max(10).optional(),
    plannedTo: z.string().max(10).optional(),
    tab: z.enum(['orders', 'suppliers', 'migration', 'stock', 'movements']).optional(),
    page: z
      .enum([
        'home',
        'products',
        'stock',
        'purchases',
        'customers',
        'sales',
        'collections',
        'finance',
        'expenses',
        'history',
        'settings',
        'preorders',
      ])
      .default('home'),
    search: z.string().max(200).default(''),
    range: rangeSchema.default({}),
    offset: z.number().int().min(0).max(10000000).default(0),
    customerId: z.number().int().positive().optional(),
    supplierId: z.number().int().positive().optional(),
    focusEntity: z.string().max(40).optional(),
    focusId: z.number().int().positive().optional(),
  })
  .strict();
export type ViewQuery = z.infer<typeof viewSchema>;
export interface PeriodReport {
  productDebtCost?: number;
  costRevisionCount: number;
  generatedAt: string;
  lateEntries: number;
  grossPurchases: number;
  purchaseReturns: number;
  supplierPaid: number;
  supplierRefunds: number;
  grossSales: number;
  salesReturns: number;
  purchaseBreakdown: {
    product: string;
    supplier: string;
    unit: string;
    quantity: number;
    returnsQuantity: number;
    amount: number;
    returned: number;
  }[];
  revenue: number;
  cogs: number;
  profit: number;
  collected: number;
  refunds: number;
  expenses: number;
  fire: number;
  purchases: number;
  cash: number;
  returnVariance: number;
  endingStockValue: number;
  endingDebt: number;
  endingCredit: number;
  openingCustomerBalance: number;
  closingCustomerBalance: number;
  supplierDebt: number;
  supplierCredit: number;
}
export interface Statement {
  productEventTotal?: number;
  productRows?: PreorderEvent[];
  openingProducts?: { product_id: number; product: string; unit: string; quantity: number }[];
  closingProducts?: { product_id: number; product: string; unit: string; quantity: number }[];
  reserved?: number;
  adjustments?: number;
  current?: number;
  grossSales?: number;
  salesReturns?: number;
  generatedAt?: string;
  lateEntries?: number;
  opening: number;
  closing: number;
  sales: number;
  collections: number;
  refunds: number;
  total: number;
  rows: {
    reference?: string;
    category?: string;
    status?: string;
    items?: { product: string; quantity: number; unit: string; price: number; total: number }[];
    method?: string;
    note?: string;
    payment_status?: string;
    id: number;
    kind: string;
    entity_id: number;
    amount: number;
    occurred_at: string;
    recorded_at: string;
    balance: number;
  }[];
}
export interface Preorder {
  corrected?: boolean;
  free_balance?: number;
  id: number;
  customer_id: number;
  customer: string;
  product_id: number;
  product: string;
  unit: string;
  quantity: number;
  price: number;
  total: number;
  source: 'prepaid' | 'other';
  note: string;
  reference: string;
  planned_on: string;
  created_at: string;
  occurred_at?: string;
  stock: number;
  delivered: number;
  cancelled: number;
  remaining: number;
  target: number;
  recognized: number;
  paid: number;
  reserved: number;
}
export interface PreorderEvent {
  id: number;
  order_id: number;
  kind: string;
  quantity: number;
  amount: number;
  reserve_delta: number;
  sale_id: number | null;
  collection_id: number | null;
  reverses_id: number | null;
  note: string;
  occurred_at: string;
  recorded_at: string;
  product: string;
  unit: string;
  customer_id: number;
}
export interface DesktopAPI {
  record(input: RecordRef): Promise<Result<RecordInfo>>;
  preview(command: Command): Promise<Result<CostImpact>>;
  annual(year: number): Promise<Result<{ month: number; report: PeriodReport }[]>>;
  supplierStatement(input: {
    supplierId: number;
    range: DateRange;
    offset?: number;
  }): Promise<Result<Statement>>;
  lookup(input: {
    kind: 'products' | 'customers' | 'suppliers';
    search: string;
    selected?: number;
  }): Promise<Result<any[]>>;
  report(range: DateRange): Promise<Result<PeriodReport>>;
  statement(input: {
    productOffset?: number;
    customerId: number;
    range: DateRange;
    offset?: number;
  }): Promise<Result<Statement>>;
  exportCustomer(input: { customerId: number; range: DateRange }): Promise<Result<string | null>>;
  snapshot(query?: Partial<ViewQuery>): Promise<Result<Snapshot>>;
  autoBackup(): Promise<Result<string | null>>;
  execute(command: Command, approval?: string): Promise<Result<number>>;
  backup(): Promise<Result<string | null>>;
  restore(): Promise<Result<string | null>>;
  openFolder(): Promise<Result<null>>;
}
// Parse decimal text exactly; the renderer never multiplies decimal money values.
export function decimal(value: string, places: number): number {
  const normalized = value.trim().replace(',', '.');
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(normalized))
    throw new Error(`En fazla ${places} ondalık basamak girin.`);
  const [whole, fraction = ''] = normalized.split('.');
  const result = Number(
    BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0')),
  );
  if (!Number.isSafeInteger(result) || result > MAX)
    throw new Error('Tutar veya miktar çok büyük.');
  return result;
}
export function roundedRatio(a: number, b: number, divisor: number): number {
  const result = Number((BigInt(a) * BigInt(b) + BigInt(divisor) / 2n) / BigInt(divisor));
  if (!Number.isSafeInteger(result) || result > MAX) throw new Error('İşlem tutarı sınırı aşıyor.');
  return result;
}
