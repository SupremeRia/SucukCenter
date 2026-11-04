import { turkeyDay } from '../../shared/dates';
import { decimalMoney } from '../../shared/money';
export { customerBalance } from '../../shared/money';
export const tl = (cents: number) =>
  `${cents < 0 ? '-' : ''}₺${decimalMoney(Math.abs(cents), true)}`;
export const signedTl = (cents: number) => `${cents > 0 ? '+' : ''}${tl(cents)}`;
export const quantity = (value: number) =>
  new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value / 1000);
export const date = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(iso));
export const time = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(iso));
export const localDay = turkeyDay;
export const kindLabel: Record<string, string> = {
  preorder: 'Ürün alacağı / ön sipariş',
  preorder_allocate: 'Sipariş ödemesi / tahsis',
  preorder_unallocate: 'Sipariş ödeme bağlantısı iptali',
  preorder_delivery: 'Ürün teslimatı',
  preorder_return: 'Fiziksel ürün iadesi',
  preorder_cancel: 'Kalan teslim yükümlülüğü iptali',
  product_debt_delivery: 'Diğer ürün borcu teslimi',
  product_debt_return: 'Diğer ürün borcu iadesi',
  customer_debt: 'Cari borç ekleme',
  customer_credit: 'Cari alacak ekleme',
  customer_debt_cancel: 'Cari borç ekleme iptali',
  customer_credit_cancel: 'Cari alacak ekleme iptali',
  supplier_payment: 'Tedarikçi ödemesi',
  supplier_payment_cancel: 'Tedarikçi ödeme iptali',
  supplier_refund: 'Tedarikçiden iade',
  supplier_refund_cancel: 'Tedarikçi para iadesi iptali',
  supplier_return: 'Tedarikçiye ürün iadesi',
  supplier_return_cancel: 'Tedarikçi ürün iadesi iptali',
  purchase_cancel: 'Alış iptali',
  sale: 'Satış',
  purchase: 'Mal alışı',
  collection: 'Tahsilat',
  refund: 'Para iadesi',
  expense: 'Gider',
  sale_cancel: 'Satış iadesi',
  collection_cancel: 'Tahsilat iptali',
  refund_cancel: 'İade iptali',
  expense_cancel: 'Gider iptali',
  expense_refund: 'Gider iadesi',
  adjust: 'Stok kaybı',
  product: 'Ürün',
  customer: 'Müşteri',
  supplier: 'Tedarikçi',
  settings: 'Ayarlar',
};
