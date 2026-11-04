import { AppearanceGallery } from './components/appearance-gallery';
import { applyAppearance } from './lib/appearance';
import { netResult, netMargin } from '../shared/profit';
import { useDebouncedValue } from './lib/use-debounced-value';
import { RecordActionsProvider } from './components/record-actions';
import { customerBalance } from './lib/format';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  lazy,
  Suspense,
  type FormEvent,
} from 'react';
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Truck,
  Users,
  ShoppingBag,
  HandCoins,
  ChartNoAxesCombined,
  History,
  Settings,
  Plus,
  ArrowDownLeft,
  ChevronRight,
  Sun,
  Moon,
  Check,
  ShieldCheck,
  Bell,
  FolderOpen,
  Download,
  Upload,
  Pencil,
  X,
  Wallet,
  TrendingUp,
  CircleHelp,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import type { FormSpec, Reversal } from './components/forms';
import { Field } from './components/form-fields';
import {
  ActivityList,
  CustomerDetail,
  DataTable,
  DetailModal,
  Metric,
  Row,
  Cell,
  SearchBox,
  Status,
  SearchStateContext,
  type Detail,
} from './components/views';
import { date, tl, signedTl, quantity, kindLabel } from './lib/format';
import { documentMatches } from '../shared/search';
import { version } from '../package.json';
import { isOneDrivePath } from '../shared/locations';
import { SupplierAccount, SupplierReturnModal } from './components/suppliers';
import { PeriodPicker, PeriodContext } from './components/period';
const MonthlyFinance = lazy(() =>
  import('./components/monthly-finance').then((m) => ({ default: m.MonthlyFinance })),
);
const FormModal = lazy(() => import('./components/forms').then((m) => ({ default: m.FormModal })));
const PreordersPanel = lazy(() =>
  import('./components/preorders').then((m) => ({ default: m.PreordersPanel })),
);
const ReversalModal = lazy(() =>
  import('./components/forms').then((m) => ({ default: m.ReversalModal })),
);
import { CostApproval } from './components/cost-approval';
import { Brand } from './components/brand';
import { monthRange, turkeyDay, dayBounds } from '../shared/dates';
import type { DateRange, PeriodReport, ViewQuery, CostImpact } from '../shared/contracts';
import {
  roundedRatio,
  type Command,
  type Snapshot,
  type Activity,
  type Result,
} from '../shared/contracts';

const navigation = [
  {
    id: 'home',
    label: 'Ana Sayfa',
    icon: LayoutDashboard,
    description: 'İşletmenize bir bakış. Her şey kontrol altında.',
  },
  {
    id: 'products',
    label: 'Ürün Yönetimi',
    icon: Package,
    description: 'Ürünlerinizi, fiyatlarınızı ve stok eşiklerinizi yönetin.',
  },
  {
    id: 'stock',
    label: 'Depo ve Stok',
    icon: Warehouse,
    description: 'Depodaki ürünleri ve tüm stok hareketlerini takip edin.',
  },
  {
    id: 'purchases',
    label: 'Gelen Siparişler',
    icon: Truck,
    description: 'Tedarikçilerinizden gelen ürünleri depoya alın.',
  },
  {
    id: 'customers',
    label: 'Müşteriler',
    icon: Users,
    description: 'Müşterileriniz ve cari hesapları tek bir yerde.',
  },
  {
    id: 'sales',
    label: 'Müşteri Satışları',
    icon: ShoppingBag,
    description: 'Satışlarınızı, maliyetlerinizi ve iadelerinizi takip edin.',
  },
  {
    id: 'collections',
    label: 'Tahsilatlar',
    icon: HandCoins,
    description: 'Ödemeleri kaydedin, müşteri bakiyelerini güncel tutun.',
  },
  {
    id: 'preorders',
    label: 'Bekleyen Teslimatlar',
    icon: Truck,
    description: 'Ön ödemeli siparişler ve müşteriye ürün teslim yükümlülükleri.',
  },
  {
    id: 'expenses',
    label: 'Giderler',
    icon: Wallet,
    description: 'Ödenmiş işletme giderleri ve bağlantılı iadeler.',
  },
  {
    id: 'finance',
    label: 'Finans ve Raporlar',
    icon: ChartNoAxesCombined,
    description: 'Satış kârlılığını, mal alışlarını ve nakit akışını ayrı izleyin.',
  },
  {
    id: 'history',
    label: 'İşlem Geçmişi',
    icon: History,
    description: 'İşletmenizde gerçekleşen tüm hareketlerin izini sürün.',
  },
  {
    id: 'settings',
    label: 'Ayarlar',
    icon: Settings,
    description: 'İşletme tercihlerinizi ve veritabanı yedeklerinizi yönetin.',
  },
];
function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
const match = (value: string, search: string) =>
  value.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'));
export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [noticePaused, setNoticePaused] = useState(false);
  const [approval, setApproval] = useState<{
    impact: CostImpact;
    answer: (v: boolean) => void;
  } | null>(null);
  const [data, setData] = useState<Snapshot | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [loadedPage, setLoadedPage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState('home');
  const [offset, setOffset] = useState(0);
  const [customerSort, setCustomerSort] = useState<NonNullable<ViewQuery['customerSort']>>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [settingsSection, setSettingsSection] = useState('backup');
  const [subtab, setSubtab] = useState<ViewQuery['tab']>('orders');
  const requestId = useRef(0);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<DateRange>(() => {
    const t = turkeyDay();
    return monthRange(Number(t.slice(0, 4)), Number(t.slice(5, 7)));
  });
  const reportKey = JSON.stringify([page, range.start, range.end, dataRevision]);
  const [loadedReportKey, setLoadedReportKey] = useState('');
  const [loadedViewKey, setLoadedViewKey] = useState('');
  const [period, setPeriod] = useState<PeriodReport | null>(null);
  const [reportError, setReportError] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [returnPurchase, setReturnPurchase] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const querySearch = useDebouncedValue(search, 150, page);
  const viewKey = JSON.stringify([page, range.start, range.end, querySearch, offset]);
  const changeSearch = (value: string) => {
    setSearch(value);
    setOffset(0);
  };
  const changeRange = (value: DateRange) => {
    setRange(value);
    setOffset(0);
  };
  const [includeArchived, setIncludeArchived] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [form, setForm] = useState<FormSpec | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reversal, setReversal] = useState<Reversal | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => {
    if (!notice || notice.error || noticePaused) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice, noticePaused]);
  const [maintenance, setMaintenance] = useState(false);
  const reload = useCallback(async () => {
    if (!window.desktop) throw new Error('SucukCenter masaüstü uygulaması üzerinden açılmalı.');
    const current = ++requestId.current;
    setLoading(true);
    try {
      const s = unwrap(
        await window.desktop.snapshot({
          page: page as ViewQuery['page'],
          search: querySearch,
          range,
          offset,
          includeArchived,
          customerSort,
          sortDirection,
          tab: subtab,
          customerId: customerId || undefined,
          supplierId: supplierId || undefined,
          focusEntity: detail?.entity || (returnPurchase ? 'purchase' : undefined),
          focusId: detail?.id || returnPurchase || undefined,
        }),
      );
      if (current === requestId.current) {
        setData(s);
        setLoadedPage(page);
        setLoadedViewKey(JSON.stringify([page, range.start, range.end, querySearch, offset]));
        setLoadError('');
      }
    } catch (e) {
      if (current === requestId.current) throw e;
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [
    page,
    querySearch,
    range.start,
    range.end,
    offset,
    includeArchived,
    customerSort,
    sortDirection,
    subtab,
    customerId,
    supplierId,
    detail?.entity,
    detail?.id,
    returnPurchase,
  ]);
  const latestReload = useRef(reload);
  useLayoutEffect(() => {
    latestReload.current = reload;
  }, [reload]);
  useEffect(() => {
    reload().catch((e) => setLoadError(String(e.message)));
  }, [reload]);
  useEffect(() => {
    if (!data) return;
    const id = data.settings.appearance || (data.settings.theme === 'light' ? 'gray' : 'classic');
    applyAppearance(id);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      if (document.documentElement.dataset.appearance === 'system') applyAppearance('system');
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [data?.settings.appearance, data?.settings.theme]);
  useEffect(() => {
    let alive = true;
    if (data && ['home', 'finance'].includes(page)) {
      setReportError('');
      setReportLoading(true);
      window.desktop
        .report(range)
        .then(unwrap)
        .then((r) => {
          if (alive) {
            setPeriod(r);
            setLoadedReportKey(reportKey);
          }
        })
        .catch((e) => {
          if (alive) {
            setReportError(e.message);
            setPeriod(null);
          }
        })
        .finally(() => {
          if (alive) setReportLoading(false);
        });
    }
    return () => {
      alive = false;
    };
    if (!['home', 'finance'].includes(page)) setReportLoading(false);
  }, [range.start, range.end, dataRevision, page, !!data]);
  const startupNotified = useRef(false);
  useEffect(() => {
    if (startupNotified.current) return;
    const notify = (window as Window & { notifyReady?: (error?: string) => void }).notifyReady;
    if (loadError || reportError) {
      startupNotified.current = true;
      notify?.(loadError || reportError);
    } else if (data && period && !loading && !reportLoading && loadedReportKey === reportKey) {
      startupNotified.current = true;
      notify?.();
    }
  }, [data, period, loading, reportLoading, loadError, reportError, loadedReportKey, reportKey]);
  const navigate = (id: string) => {
    setPage(id);
    setOffset(0);
    setSubtab(id === 'stock' ? 'stock' : 'orders');
    setSearch('');
    setCustomerId(null);
    setSupplierId(null);
    setReturnPurchase(null);
    setDetail(null);
    setIncludeArchived(false);
  };
  async function save(c: Command) {
    let token: string | undefined;
    if (!['product', 'customer', 'supplier', 'settings'].includes(c.type)) {
      const impact = unwrap(await window.desktop.preview(c));
      if (impact.required) {
        const accepted = await new Promise<boolean>((resolve) =>
          setApproval({ impact, answer: resolve }),
        );
        setApproval(null);
        if (!accepted)
          throw new Error('Maliyet değişikliği onaylanmadı. Formdaki tarih ve bilgiler korunuyor.');
        token = impact.token;
      }
    }
    unwrap(await window.desktop.execute(c, token));
    if (c.type !== 'settings') setDataRevision((n) => n + 1);
    // A committed write must never look retryable because the subsequent refresh failed.
    try {
      await latestReload.current();
      setNotice({ text: 'İşlem kaydedildi. Tüm kayıtlar güncel.' });
    } catch {
      setNotice({
        text: 'İşlem kaydedildi. Görünüm yenilenemedi; kayıtları görmek için uygulamayı yeniden açın.',
        error: true,
      });
    }
  }
  async function safeAction(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'İşlem tamamlanamadı.', error: true });
    }
  }
  async function maintenanceAction(kind: 'backup' | 'restore' | 'openFolder') {
    if (maintenance) return;
    setMaintenance(true);
    try {
      const output = unwrap(await window.desktop[kind]());
      if (kind === 'restore' && output) setDataRevision((n) => n + 1);
      await latestReload.current();
      if (kind === 'openFolder') return;
      if (output)
        setNotice({
          text:
            kind === 'backup'
              ? `Yedek oluşturuldu: ${output}`
              : `Geri yükleme tamamlandı. Geri dönüş yedeği: ${output}`,
        });
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : 'İşlem tamamlanamadı.', error: true });
    } finally {
      setMaintenance(false);
    }
  }
  function openActivity(a: Activity) {
    if (a.entity.startsWith('preorder') && a.customer_id) {
      openCustomer(a.customer_id);
      return;
    }
    if (a.entity === 'customer' && a.customer_id) {
      openCustomer(a.customer_id);
    } else if (a.entity === 'settings') navigate('settings');
    else setDetail({ entity: a.entity, id: a.entity_id });
  }
  function openCustomer(id: number) {
    navigate('customers');
    setCustomerId(id);
  }
  if (!data)
    return (
      <div className="startup">
        <Brand />
        <h1>SucukCenter</h1>
        <p>{loadError || 'Yerel kayıtlarınız yükleniyor…'}</p>
        {loadError && (
          <Button onClick={() => reload().catch((e) => setLoadError(e.message))}>
            Yeniden dene
          </Button>
        )}
      </div>
    );
  const current = navigation.find((n) => n.id === page)!;
  const low = data.products.filter((p) => p.active && p.stock <= p.critical);
  const lowCount = data.counts?.critical ?? low.length;
  let rangeError = '';
  try {
    dayBounds(range.start, range.end);
  } catch (e) {
    rangeError = (e as Error).message;
  }
  const within = (iso: string) => {
    const day = turkeyDay(iso);
    return (!range.start || day >= range.start) && (!range.end || day <= range.end);
  };
  const stockRows = data.products.filter((p) => match(p.name, search));
  const products = stockRows;
  const customers = data.customers.filter((c) =>
    match(`${c.name} ${c.contact} ${c.phone}`, search),
  );
  const suppliers = data.suppliers.filter((c) =>
    match(`${c.name} ${c.contact} ${c.phone}`, search),
  );
  const sales = data.sales.filter(
    (s) => documentMatches(s.party, s.id, 'S', search) && within(s.occurred_at || s.created_at),
  );
  const purchases = data.purchases.filter(
    (s) => documentMatches(s.party, s.id, 'G', search) && within(s.occurred_at || s.created_at),
  );
  const collections = data.collections.filter(
    (c) => match(`${c.party} ${c.note}`, search) && within(c.occurred_at || c.created_at),
  );
  const s = {
    ...data.summary,
    ...period,
    debt: data.summary.debt,
    credit: data.summary.credit,
    stockValue: data.summary.stockValue,
  };
  const newRecord = (kind: FormSpec['kind']) => setForm({ kind });
  const primary: Record<string, { kind: FormSpec['kind']; label: string }> = {
    products: { kind: 'product', label: 'Ürün ekle' },
    stock: { kind: 'purchase', label: 'Stok girişi' },
    purchases: { kind: 'purchase', label: 'Gelen sipariş ekle' },
    customers: { kind: 'customer', label: 'Müşteri ekle' },
    sales: { kind: 'sale', label: 'Yeni satış' },
    collections: { kind: 'collection', label: 'Tahsilat al' },
    finance: { kind: 'expense', label: 'Gider ekle' },
    expenses: { kind: 'expense', label: 'Gider ekle' },
  };
  async function settingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setMaintenance(true);
    try {
      await safeAction(() =>
        save({
          type: 'settings',
          company: String(f.get('company')),
          theme: data!.settings.theme,
          appearance: data!.settings.appearance as any,
          autoBackup: f.get('autoBackup') === 'on',
          retention: Number(f.get('retention')),
        }),
      );
    } finally {
      setMaintenance(false);
    }
  }
  return (
    <RecordActionsProvider data={data} onSave={save}>
      <PeriodContext.Provider value={range}>
        <SearchStateContext.Provider value={!!search}>
          <div className={`app-shell ${collapsed ? 'sidebar-is-collapsed' : ''}`}>
            <aside className="quick-rail" aria-label="Hızlı erişim">
              <button
                className="rail-logo"
                title="SucukCenter"
                aria-label="Genel bakış hızlı erişim"
                onClick={() => navigate('home')}
              >
                <Brand compact />
              </button>
              <div className="rail-divider" />
              {[
                { label: 'Genel Bakış', id: 'home', icon: LayoutDashboard, pages: ['home'] },
                {
                  label: 'Stok ve Ürünler',
                  id: 'products',
                  icon: Warehouse,
                  pages: ['products', 'stock', 'purchases'],
                },
                {
                  label: 'Müşteri İşlemleri',
                  id: 'customers',
                  icon: Users,
                  pages: ['customers', 'sales', 'collections', 'preorders'],
                },
                { label: 'Finans', id: 'finance', icon: Wallet, pages: ['finance', 'expenses'] },
              ].map((g) => (
                <button
                  key={g.id}
                  className={'rail-button ' + (g.pages.includes(page) ? 'active' : '')}
                  title={g.label}
                  aria-label={g.label + ' hızlı erişim'}
                  onClick={() => navigate(g.id)}
                >
                  <g.icon size={22} />
                </button>
              ))}
              <div className="rail-spacer" />
              <button
                className="rail-button"
                title="Menüyü aç / kapat"
                aria-label="Modül menüsünü aç / kapat"
                onClick={() => setCollapsed((v) => !v)}
              >
                <PanelLeftOpen size={20} />
              </button>
              <button
                className={'rail-button ' + (page === 'settings' ? 'active' : '')}
                title="Ayarlar"
                aria-label="Ayarlar hızlı erişim"
                onClick={() => navigate('settings')}
              >
                <Settings size={22} />
              </button>
            </aside>
            <aside className="sidebar">
              <Brand />
              <div className="sidebar-toggle">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
                  onClick={() => setCollapsed((v) => !v)}
                >
                  {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                </Button>
              </div>
              <div className="workspace">
                <img className="workspace-icon" src="./brand/program.png" alt="" />
                <div>
                  <strong title={data.settings.company}>{data.settings.company}</strong>
                  <small>Yerel işletme hesabı</small>
                </div>
                <ShieldCheck size={16} />
              </div>

              <nav aria-label="Ana navigasyon">
                {navigation.map((n, i) => (
                  <div key={n.id}>
                    {[0, 1, 4, 8, 10].includes(i) && (
                      <span className="nav-caption">
                        {
                          {
                            0: 'Genel Bakış',
                            1: 'Stok ve Ürünler',
                            4: 'Müşteri İşlemleri',
                            8: 'Finans',
                            10: 'Sistem',
                          }[i]
                        }
                      </span>
                    )}
                    <button
                      className={`nav-item ${page === n.id ? 'active' : ''}`}
                      title={n.label}
                      aria-label={n.label}
                      aria-current={page === n.id ? 'page' : undefined}
                      onClick={() => navigate(n.id)}
                    >
                      <n.icon size={19} />
                      <span>{n.label}</span>
                      {n.id === 'stock' && lowCount > 0 && (
                        <span className="nav-count">{lowCount}</span>
                      )}
                      {page === n.id && <span className="active-dot" />}
                    </button>
                  </div>
                ))}
              </nav>
              <div className="sidebar-bottom">
                <div className="offline">
                  <span className="status-dot" />
                  <strong>Çevrimdışı kullanıma hazır</strong>
                  <p>Verileriniz bu bilgisayarda saklanır.</p>
                </div>
                <div className="profile">
                  <img className="avatar" src="./brand/program.png" alt="" />
                  <div>
                    <strong>İşletme yöneticisi</strong>
                    <small>SucukCenter · v{version}</small>
                  </div>
                  <Settings size={16} aria-hidden />
                </div>
              </div>
            </aside>
            <div className="main-shell">
              <header className="topbar">
                <div className="breadcrumbs">
                  <span>Çalışma alanı</span>
                  <ChevronRight size={14} />
                  <strong>{current.label}</strong>
                </div>
                <div className="topbar-actions">
                  <span className="saved">
                    <Check size={14} />
                    Yerel kayıtlar güncel
                  </span>
                  <span className="top-divider" />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Temayı değiştir"
                    disabled={maintenance}
                    onClick={() =>
                      safeAction(() =>
                        save({
                          type: 'settings',
                          company: data.settings.company,
                          theme: data.settings.theme === 'dark' ? 'light' : 'dark',
                        }),
                      )
                    }
                  >
                    {data.settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Kritik stok uyarılarını aç"
                    onClick={() => navigate('stock')}
                  >
                    <Bell size={18} />
                    {lowCount > 0 && <span className="notification-dot" />}
                  </Button>
                </div>
              </header>
              <main>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      {page === 'home' ? 'İŞLETMENİZE GENEL BAKIŞ' : 'SUCUKCENTER / YÖNETİM'}
                    </div>
                    <h1>{page === 'home' ? 'İşletme Özeti' : current.label}</h1>
                    <p>{current.description}</p>
                  </div>
                  <div className="heading-actions">
                    {page === 'home' ? (
                      <>
                        <span className="today">
                          <CalendarIcon />
                          {date(new Date().toISOString())}
                        </span>
                        <Button onClick={() => newRecord('sale')}>
                          <Plus size={17} />
                          Yeni satış
                        </Button>
                      </>
                    ) : (
                      primary[page] &&
                      !customerId && (
                        <Button onClick={() => newRecord(primary[page].kind)}>
                          <Plus size={17} />
                          {primary[page].label}
                        </Button>
                      )
                    )}
                  </div>
                </div>
                {notice && (
                  <div
                    role={notice.error ? 'alert' : 'status'}
                    className={`notice ${notice.error ? 'notice-error' : 'toast'}`}
                    onMouseEnter={() => setNoticePaused(true)}
                    onMouseLeave={() => setNoticePaused(false)}
                    onFocusCapture={() => setNoticePaused(true)}
                    onBlurCapture={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget)) setNoticePaused(false);
                    }}
                  >
                    <span>{notice.error ? <CircleHelp size={18} /> : <Check size={18} />}</span>
                    <p>{notice.text}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Bildirimi kapat"
                      onClick={() => setNotice(null)}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                )}
                {[
                  'home',
                  'sales',
                  'purchases',
                  'collections',
                  'finance',
                  'expenses',
                  'history',
                  'customers',
                ].includes(page) && <PeriodPicker value={range} onChange={changeRange} />}
                {reportError && (
                  <p className="error-box" role="alert">
                    {reportError}
                  </p>
                )}
                {['home', 'finance'].includes(page) && period && !reportLoading && !reportError && (
                  <dl className="balance-overview" aria-label="Dönem sınırı bakiyeleri">
                    <div>
                      <dt>Dönem başı net cari</dt>
                      <dd>{tl(period.openingCustomerBalance)}</dd>
                    </div>
                    <div>
                      <dt>Dönem sonu müşteri borcu</dt>
                      <dd>{tl(period.endingDebt)}</dd>
                    </div>
                    <div>
                      <dt>Dönem sonu müşteri alacağı</dt>
                      <dd>{tl(period.endingCredit)}</dd>
                    </div>
                    <div>
                      <dt>Dönem sonu stok değeri</dt>
                      <dd>{tl(period.endingStockValue)}</dd>
                    </div>
                  </dl>
                )}
                {['products', 'customers', 'purchases'].includes(page) && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={includeArchived}
                      onChange={(e) => {
                        setIncludeArchived(e.target.checked);
                        setOffset(0);
                      }}
                    />{' '}
                    Arşivlenenleri göster
                  </label>
                )}
                {(loading || search !== querySearch) && (
                  <p role="status" className="loading-state">
                    <span className="loading-spinner" aria-hidden />
                    Kayıtlar yükleniyor…
                  </p>
                )}
                {maintenance && (
                  <p role="status" className="loading-state">
                    İşlem sürüyor. Verileriniz güvenli biçimde hazırlanıyor…
                  </p>
                )}
                {loadError && (
                  <p role="alert" className="error-box">
                    {loadError}
                  </p>
                )}
                {data.settings.autoBackupLastError && (
                  <p role="alert" className="error-box">
                    Son otomatik yedek uyarısı: {data.settings.autoBackupLastError}
                  </p>
                )}
                {reportLoading && ['home', 'finance'].includes(page) && (
                  <p role="status" className="loading-state">
                    <span className="loading-spinner" aria-hidden />
                    Dönem raporu yükleniyor…
                  </p>
                )}
                {page === 'expenses' && (
                  <SearchBox
                    value={search}
                    onChange={changeSearch}
                    placeholder="Gider adına göre ara…"
                  />
                )}
                <section
                  hidden={
                    loadedPage !== page ||
                    !!rangeError ||
                    (page === 'expenses' &&
                      (loadedViewKey !== viewKey ||
                        loading ||
                        search !== querySearch ||
                        !!loadError)) ||
                    (['home', 'finance'].includes(page) &&
                      (loadedReportKey !== reportKey || reportLoading || !period || !!reportError))
                  }
                  aria-busy={loading || search !== querySearch || reportLoading}
                >
                  {page === 'home' && period && (
                    <>
                      <div className="metrics">
                        <Metric
                          label="İşletme giderleri"
                          scope="period"
                          value={tl(period!.expenses)}
                          hint="İptal ve iadeler düşülmüş dönem gideri"
                          icon={<Wallet size={18} />}
                        />
                        <Metric
                          label={netResult(period!) < 0 ? 'Net zarar' : 'Net kâr'}
                          scope="period"
                          value={signedTl(netResult(period!))}
                          hint={
                            'Brüt kâr − gider − fire − diğer ürün borcu maliyeti + iade farkı · Marj: ' +
                            (netMargin(period!) === null
                              ? 'Hesaplanamıyor'
                              : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(
                                  netMargin(period!)!,
                                ) + '%')
                          }
                          icon={<TrendingUp size={18} />}
                        />
                        <Metric
                          label="Toplam müşteri"
                          scope="current"
                          value={data.counts?.customers ?? data.customers.length}
                          hint="Kayıtlı müşteri hesabı"
                          icon={<Users size={18} />}
                        />
                        <Metric
                          label="Güncel müşteri borcu"
                          scope="current"
                          value={tl(s.debt)}
                          hint="Pozitif cari bakiyeler toplamı"
                          icon={<Wallet size={18} />}
                        />
                        <Metric
                          label="Güncel müşteri alacağı"
                          scope="current"
                          value={tl(s.credit)}
                          hint="Alacaklı müşteriler toplamı; borçlardan düşülmez"
                          icon={<Wallet size={18} />}
                        />
                        <Metric
                          label="Dönem tahsilatı"
                          scope="period"
                          value={tl(s.collected)}
                          hint="İptaller düşülmüş tahsilat"
                          icon={<HandCoins size={18} />}
                        />
                        <Metric
                          label="Satışlardan elde edilen brüt kâr"
                          scope="period"
                          value={tl(s.profit)}
                          hint="Satış tutarı − satış anı maliyeti"
                          icon={<TrendingUp size={18} />}
                          accent
                        />
                        <Metric
                          label="Stoktaki ürün çeşidi"
                          scope="current"
                          value={
                            data.counts?.stockProducts ??
                            data.products.filter((p) => p.stock > 0).length
                          }
                          hint="Stoğu bulunan farklı ürünler"
                          icon={<Package size={18} />}
                        />
                        <Metric
                          label="Kritik stok uyarıları"
                          scope="current"
                          value={lowCount}
                          hint="Stok eşiğinde veya altında"
                          icon={<Bell size={18} />}
                        />
                      </div>
                      <div className="quick-strip">
                        <div>
                          <span className="quick-icon">
                            <ShoppingBag size={22} />
                          </span>
                          <div>
                            <strong>İşlemlerinize hız katın</strong>
                            <p>Günün akışını tek yerden yönetin.</p>
                          </div>
                        </div>
                        <div>
                          <Button variant="outline" onClick={() => newRecord('purchase')}>
                            <ArrowDownLeft size={16} />
                            Stok girişi
                          </Button>
                          <Button variant="outline" onClick={() => newRecord('customer')}>
                            <Users size={16} />
                            Müşteri ekle
                          </Button>
                          <Button variant="outline" onClick={() => newRecord('collection')}>
                            <HandCoins size={16} />
                            Tahsilat al
                          </Button>
                        </div>
                      </div>
                      <div className="dashboard-bottom">
                        <Card className="activity-card">
                          <CardContent>
                            <ActivityList rows={data.activities} onOpen={openActivity} compact />
                          </CardContent>
                        </Card>
                        <div className="dashboard-side">
                          <Card>
                            <CardContent>
                              <div className="section-heading">
                                <h3>Depo durumu</h3>
                                <Warehouse size={18} />
                              </div>
                              <p className="muted">Stoktaki ürünlerin alış maliyeti</p>
                              <strong className="stock-value">{tl(s.stockValue)}</strong>
                              <div className="stock-summary">
                                <span>
                                  {data.counts?.stockProducts ??
                                    data.products.filter((p) => p.stock > 0).length}{' '}
                                  ürün çeşidi
                                </span>
                                <Badge variant="outline">Ağırlıklı ortalama</Badge>
                              </div>
                              <Button
                                variant="outline"
                                className="full"
                                onClick={() => navigate('stock')}
                              >
                                Depoyu görüntüle
                                <ChevronRight size={15} />
                              </Button>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent>
                              <div className="section-heading">
                                <h3>Stok uyarıları</h3>
                                <span className="warning-number">{lowCount}</span>
                              </div>
                              {low.length ? (
                                low.map((p) => (
                                  <button
                                    key={p.id}
                                    className="low-stock"
                                    onClick={() => setDetail({ entity: 'product', id: p.id })}
                                  >
                                    <div className="product-icon">
                                      <Package size={17} />
                                    </div>
                                    <div>
                                      <strong>{p.name}</strong>
                                      <small>
                                        Eşik: {quantity(p.critical)} {p.unit}
                                      </small>
                                    </div>
                                    <span>
                                      {quantity(p.stock)}
                                      <small>{p.unit}</small>
                                    </span>
                                  </button>
                                ))
                              ) : (
                                <div className="calm-state">
                                  <ShieldCheck size={28} />
                                  <p>Kritik stok uyarısı yok.</p>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                          <div className="local-note">
                            <ShieldCheck size={21} />
                            <div>
                              <strong>Kontrol sizde, veriler sizde.</strong>
                              <p>
                                Temel işlemler internet gerektirmez. Yedeğinizi Ayarlar’dan
                                oluşturabilirsiniz.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  {page === 'preorders' && (
                    <PreordersPanel revision={dataRevision} data={data} onSave={save} />
                  )}
                  {page === 'products' && (
                    <Card>
                      <CardContent>
                        <div className="toolbar">
                          <SearchBox
                            value={search}
                            onChange={changeSearch}
                            placeholder="Ürün adı ile ara…"
                          />
                          <span>{data.pagination?.total ?? products.length} ürün</span>
                        </div>
                        <DataTable
                          headers={[
                            'Ürün',
                            'Birim',
                            'Satış fiyatı',
                            'Mevcut stok',
                            'Kritik eşik',
                            'Durum',
                            'İşlemler',
                          ]}
                          empty={!products.length}
                        >
                          {products.map((p) => (
                            <Row key={p.id} record={{ entity: 'product', id: p.id }}>
                              <Cell>
                                <div className="table-name">
                                  <span className="product-icon">
                                    <Package size={17} />
                                  </span>
                                  <strong>{p.name}</strong>
                                </div>
                              </Cell>
                              <Cell>{p.unit}</Cell>
                              <Cell>{tl(p.price)}</Cell>
                              <Cell>{quantity(p.stock)}</Cell>
                              <Cell>{quantity(p.critical)}</Cell>
                              <Cell>
                                <Badge
                                  variant="outline"
                                  className={p.active ? 'badge-green' : 'badge-muted'}
                                >
                                  {p.active ? 'Etkin' : 'Arşiv'}
                                </Badge>
                              </Cell>
                              <Cell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setForm({ kind: 'product', record: p })}
                                >
                                  <Pencil size={14} />
                                  Düzenle
                                </Button>
                              </Cell>
                            </Row>
                          ))}
                        </DataTable>
                      </CardContent>
                    </Card>
                  )}
                  {page === 'stock' && (
                    <>
                      <div className="metrics three">
                        <Metric
                          label="Toplam stok değeri"
                          value={tl(s.stockValue)}
                          hint="Depoda kalan ürünlerin maliyeti"
                          icon={<Warehouse size={18} />}
                        />
                        <Metric
                          label="Ürün çeşidi"
                          value={
                            data.counts?.stockProducts ??
                            data.products.filter((p) => p.stock > 0).length
                          }
                          hint="Stokta bulunanlar"
                          icon={<Package size={18} />}
                        />
                        <Metric
                          label="Kritik stok"
                          value={lowCount}
                          hint="Etkin ürünlerde eşik ve altı"
                          icon={<Bell size={18} />}
                        />
                      </div>
                      <Card>
                        <CardContent>
                          <Tabs
                            value={subtab === 'movements' ? 'movements' : 'stock'}
                            onValueChange={(v) => {
                              setSubtab(v as ViewQuery['tab']);
                              setOffset(0);
                            }}
                          >
                            <div className="toolbar">
                              <TabsList>
                                <TabsTrigger value="stock">Stok özeti</TabsTrigger>
                                <TabsTrigger value="movements">Stok hareketleri</TabsTrigger>
                              </TabsList>
                              <Button variant="outline" onClick={() => newRecord('adjust')}>
                                Fire / kayıp kaydet
                              </Button>
                            </div>
                            <SearchBox
                              value={search}
                              onChange={changeSearch}
                              placeholder="Stokta ürün ara…"
                            />
                            <TabsContent value="stock">
                              <DataTable
                                headers={[
                                  'Ürün',
                                  'Stok',
                                  'Ortalama birim maliyeti',
                                  'Toplam maliyet',
                                  'Durum',
                                ]}
                                empty={!stockRows.length}
                              >
                                {stockRows.map((p) => (
                                  <Row key={p.id} record={{ entity: 'product', id: p.id }}>
                                    <Cell>
                                      <strong>{p.name}</strong>
                                    </Cell>
                                    <Cell>
                                      {quantity(p.stock)} {p.unit}
                                    </Cell>
                                    <Cell>
                                      {p.stock ? tl(roundedRatio(p.cost, 1000, p.stock)) : '—'}
                                    </Cell>
                                    <Cell>{tl(p.cost)}</Cell>
                                    <Cell>
                                      <Badge
                                        variant="outline"
                                        className={
                                          p.active && p.stock <= p.critical
                                            ? 'badge-orange'
                                            : 'badge-green'
                                        }
                                      >
                                        {p.active && p.stock <= p.critical
                                          ? 'Kritik stok'
                                          : 'Normal'}
                                      </Badge>
                                    </Cell>
                                  </Row>
                                ))}
                              </DataTable>
                            </TabsContent>
                            <TabsContent value="movements">
                              <DataTable
                                headers={[
                                  'Tarih',
                                  'Ürün',
                                  'Hareket',
                                  'Miktar',
                                  'Maliyet değişimi',
                                  'Açıklama',
                                ]}
                                empty={!data.movements.length}
                              >
                                {data.movements
                                  .filter((m) => match(m.product, search))
                                  .map((m) => (
                                    <Row key={m.id}>
                                      <Cell>{date(m.created_at)}</Cell>
                                      <Cell>{m.product}</Cell>
                                      <Cell>{kindLabel[m.kind]}</Cell>
                                      <Cell
                                        className={
                                          m.quantity > 0 ? 'text-positive' : 'text-warning'
                                        }
                                      >
                                        {m.quantity > 0 ? '+' : ''}
                                        {quantity(m.quantity)}
                                      </Cell>
                                      <Cell>{tl(m.cost)}</Cell>
                                      <Cell>{m.note || '—'}</Cell>
                                    </Row>
                                  ))}
                              </DataTable>
                            </TabsContent>
                          </Tabs>
                        </CardContent>
                      </Card>
                    </>
                  )}
                  {page === 'purchases' && (
                    <Card>
                      <CardContent>
                        <Tabs
                          value={
                            ['orders', 'suppliers', 'migration'].includes(subtab || '')
                              ? subtab
                              : 'orders'
                          }
                          onValueChange={(v) => {
                            setSubtab(v as ViewQuery['tab']);
                            setOffset(0);
                          }}
                        >
                          <div className="toolbar">
                            <TabsList>
                              <TabsTrigger value="orders">Gelen siparişler</TabsTrigger>
                              <TabsTrigger value="suppliers">Tedarikçiler</TabsTrigger>
                              <TabsTrigger value="migration">Geçiş incelemesi</TabsTrigger>
                            </TabsList>
                            <Button variant="outline" onClick={() => newRecord('supplier')}>
                              <Plus size={15} />
                              Tedarikçi ekle
                            </Button>
                          </div>
                          <SearchBox
                            value={search}
                            onChange={changeSearch}
                            placeholder="Firma adı ile ara…"
                          />
                          <TabsContent value="orders">
                            <DataTable
                              headers={[
                                'Sipariş',
                                'Tedarikçi',
                                'Tarih',
                                'Alış maliyeti',
                                'Ödeme',
                                'Detay',
                              ]}
                              empty={!purchases.length}
                            >
                              {purchases.map((d) => (
                                <Row key={d.id} record={{ entity: 'purchase', id: d.id }}>
                                  <Cell>
                                    <strong>#G-{String(d.id).padStart(4, '0')}</strong>
                                    <Status status={d.status} />
                                  </Cell>
                                  <Cell>{d.party}</Cell>
                                  <Cell>{date(d.occurred_at || d.created_at)}</Cell>
                                  <Cell>{tl(d.total)}</Cell>
                                  <Cell>
                                    <Badge variant="outline">
                                      {data.supplierPayments.some(
                                        (p) => p.purchase_id === d.id && p.status === 'active',
                                      )
                                        ? 'Peşin ödeme kayıtlı'
                                        : 'Cari hesapta takip'}
                                    </Badge>
                                  </Cell>
                                  <Cell>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setDetail({ entity: 'purchase', id: d.id })}
                                    >
                                      Görüntüle
                                      <ChevronRight size={14} />
                                    </Button>
                                  </Cell>
                                </Row>
                              ))}
                            </DataTable>
                          </TabsContent>
                          <TabsContent value="migration">
                            <DataTable
                              headers={['Belge', 'Sınıflandırma', 'İnceleme notu']}
                              empty={!data.migrationReview.length}
                            >
                              {data.migrationReview.map((r) => (
                                <Row key={r.id}>
                                  <Cell>#{r.entity_id}</Cell>
                                  <Cell>{r.classification}</Cell>
                                  <Cell>{r.explanation}</Cell>
                                </Row>
                              ))}
                            </DataTable>
                          </TabsContent>
                          <TabsContent value="suppliers">
                            <DataTable
                              headers={[
                                'Firma',
                                'Yetkili',
                                'Telefon',
                                'Adres',
                                'Cari bakiye',
                                'İşlemler',
                              ]}
                              empty={!suppliers.length}
                            >
                              {suppliers.map((p) => (
                                <Row key={p.id} record={{ entity: 'supplier', id: p.id }}>
                                  <Cell>
                                    <strong>{p.name}</strong>
                                  </Cell>
                                  <Cell>{p.contact || '—'}</Cell>
                                  <Cell>{p.phone || '—'}</Cell>
                                  <Cell>{p.address || '—'}</Cell>
                                  <Cell>
                                    {tl(p.balance)}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setSupplierId(p.id)}
                                    >
                                      Cari hesap
                                    </Button>
                                  </Cell>
                                  <Cell>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setForm({ kind: 'supplier', record: p })}
                                    >
                                      Düzenle
                                    </Button>
                                  </Cell>
                                </Row>
                              ))}
                            </DataTable>
                          </TabsContent>
                        </Tabs>
                      </CardContent>
                    </Card>
                  )}
                  {page === 'customers' &&
                    (customerId ? (
                      <CustomerDetail
                        revision={dataRevision}
                        onSave={save}
                        key={customerId}
                        data={data}
                        id={customerId}
                        onEdit={() =>
                          setForm({
                            kind: 'customer',
                            record: data.customers.find((c) => c.id === customerId),
                          })
                        }
                        onNew={(kind) => setForm({ kind, customerId })}
                        onOpen={openActivity}
                        onBack={() => setCustomerId(null)}
                      />
                    ) : (
                      <Card>
                        <CardContent>
                          <div className="toolbar">
                            <SearchBox
                              value={search}
                              onChange={changeSearch}
                              placeholder="Firma, yetkili veya telefon ara…"
                            />
                            <span>
                              {data.pagination?.total ?? customers.length} müşteri ·{' '}
                              {customerSort === 'balance'
                                ? sortDirection === 'desc'
                                  ? 'Borç: büyükten küçüğe'
                                  : 'Borç: küçükten büyüğe'
                                : sortDirection === 'asc'
                                  ? 'A → Z'
                                  : 'Z → A'}
                            </span>
                          </div>
                          <DataTable
                            headers={[
                              'Firma adı',
                              'Yetkili',
                              'Telefon',
                              'Kalan borç / alacak',
                              'Cari hesap',
                            ]}
                            sort={{
                              index: ['name', 'contact', 'phone', 'balance'].indexOf(customerSort),
                              direction: sortDirection,
                              onSort: (i) => {
                                const key = (['name', 'contact', 'phone', 'balance'] as const)[i];
                                setSortDirection(
                                  customerSort === key
                                    ? sortDirection === 'asc'
                                      ? 'desc'
                                      : 'asc'
                                    : key === 'balance'
                                      ? 'desc'
                                      : 'asc',
                                );
                                setCustomerSort(key);
                                setOffset(0);
                              },
                            }}
                            empty={!customers.length}
                          >
                            {customers.map((c) => (
                              <Row key={c.id} record={{ entity: 'customer', id: c.id }}>
                                <Cell>
                                  <div className="table-name">
                                    <span className="avatar">
                                      {c.name.slice(0, 2).toLocaleUpperCase('tr')}
                                    </span>
                                    <strong>{c.name}</strong>
                                    {c.active === 0 && <Badge variant="outline">Arşiv</Badge>}
                                  </div>
                                </Cell>
                                <Cell>{c.contact || '—'}</Cell>
                                <Cell>{c.phone || '—'}</Cell>
                                <Cell>
                                  <strong
                                    className={c.balance > 0 ? 'text-warning' : 'text-positive'}
                                  >
                                    {customerBalance(c.balance)}
                                  </strong>
                                </Cell>
                                <Cell>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openCustomer(c.id)}
                                  >
                                    Hesabı aç
                                    <ChevronRight size={14} />
                                  </Button>
                                </Cell>
                              </Row>
                            ))}
                          </DataTable>
                        </CardContent>
                      </Card>
                    ))}
                  {page === 'sales' && (
                    <Card>
                      <CardContent>
                        <div className="toolbar">
                          <SearchBox
                            value={search}
                            onChange={changeSearch}
                            placeholder="Müşteri veya satış numarası ara…"
                          />
                          <span>{data.pagination?.total ?? sales.length} satış kaydı</span>
                        </div>
                        <DataTable
                          headers={[
                            'Satış',
                            'Müşteri',
                            'Tarih',
                            'Satış tutarı',
                            'Brüt kâr',
                            'Durum',
                            'Detay',
                          ]}
                          empty={!sales.length}
                        >
                          {sales.map((d) => (
                            <Row key={d.id} record={{ entity: 'sale', id: d.id }}>
                              <Cell>
                                <strong>#S-{String(d.id).padStart(4, '0')}</strong>
                              </Cell>
                              <Cell>{d.party}</Cell>
                              <Cell>{date(d.occurred_at || d.created_at)}</Cell>
                              <Cell>{tl(d.total)}</Cell>
                              <Cell
                                className={
                                  d.status === 'active' ? 'text-positive' : 'text-muted-foreground'
                                }
                              >
                                {d.status === 'active' ? tl(d.total - d.cost) : '—'}
                              </Cell>
                              <Cell>
                                <Status status={d.status} />
                              </Cell>
                              <Cell>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDetail({ entity: 'sale', id: d.id })}
                                >
                                  Görüntüle
                                  <ChevronRight size={14} />
                                </Button>
                              </Cell>
                            </Row>
                          ))}
                        </DataTable>
                      </CardContent>
                    </Card>
                  )}
                  {page === 'collections' && (
                    <>
                      <div className="metrics three">
                        <Metric
                          label="Güncel müşteri alacağı"
                          scope="current"
                          value={tl(s.credit)}
                          hint="Alacaklı müşteriler toplamı; borçlardan düşülmez"
                          icon={<Wallet size={18} />}
                        />
                        <Metric
                          label="Dönem tahsilatı"
                          value={tl(s.collected)}
                          hint="Geçerli tahsilatlar"
                          icon={<HandCoins size={18} />}
                        />
                        <Metric
                          label="Tahsil edilecek borç"
                          value={tl(s.debt)}
                          hint="Müşteri borç bakiyeleri toplamı"
                          icon={<Wallet size={18} />}
                        />
                        <Metric
                          label="Müşteri alacakları"
                          value={tl(s.credit)}
                          hint="İade sonrası müşterilere borcunuz"
                          icon={<ArrowDownLeft size={18} />}
                        />
                      </div>
                      <Card>
                        <CardContent>
                          <div className="toolbar">
                            <SearchBox
                              value={search}
                              onChange={changeSearch}
                              placeholder="Müşteri veya açıklama ara…"
                            />
                            <Button variant="outline" onClick={() => newRecord('refund')}>
                              Para iadesi yap
                            </Button>
                          </div>
                          <DataTable
                            headers={[
                              'Tarih',
                              'Müşteri',
                              'İşlem',
                              'Tutar',
                              'Yöntem',
                              'Durum',
                              'Detay',
                            ]}
                            empty={!collections.length}
                          >
                            {collections.map((c) => (
                              <Row
                                key={c.id}
                                record={{ entity: c.kind as 'collection' | 'refund', id: c.id }}
                              >
                                <Cell>{date(c.occurred_at || c.created_at)}</Cell>
                                <Cell>{c.party}</Cell>
                                <Cell>{kindLabel[c.kind]}</Cell>
                                <Cell>{tl(c.amount)}</Cell>
                                <Cell>{c.method}</Cell>
                                <Cell>
                                  <Status status={c.status} />
                                </Cell>
                                <Cell>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setDetail({ entity: c.kind, id: c.id })}
                                  >
                                    Görüntüle
                                    <ChevronRight size={14} />
                                  </Button>
                                </Cell>
                              </Row>
                            ))}
                          </DataTable>
                        </CardContent>
                      </Card>
                    </>
                  )}
                  {page === 'expenses' && (
                    <>
                      {!(loading || search !== querySearch || loadError) && (
                        <>
                          <div className="metrics">
                            <Metric
                              label="Seçili dönem gideri"
                              scope="period"
                              value={tl(data.expenseTotal || 0)}
                              hint="Ad araması uygulanır; iptal ve iadeler düşülür"
                              icon={<Wallet size={18} />}
                            />
                            <Metric
                              label="Tüm zamanlar net gideri"
                              scope="current"
                              value={tl(data.summary.expenses)}
                              hint="Tarih ve ad filtresinden bağımsız"
                              icon={<Wallet size={18} />}
                            />
                          </div>
                          <p className="notice">
                            Gerçekleşmiş ve ödenmiş harcamalar. Gider çıkışı pozitif, iptal ve iade
                            negatif tutarla gösterilir; stok ve müşteri bakiyesi değişmez.
                          </p>
                          <DataTable
                            headers={['Tarih', 'Gider adı', 'Tutar', 'Ödeme', 'Durum', 'İşlemler']}
                            empty={!data.expenses?.length}
                          >
                            {data.expenses?.map((e) => (
                              <Row key={e.effectId} record={{ entity: 'expense', id: e.id }}>
                                <Cell>{date(e.occurred_at)}</Cell>
                                <Cell>
                                  <strong>{e.name}</strong>
                                  <p>{e.description}</p>
                                </Cell>
                                <Cell>{tl(e.amount)}</Cell>
                                <Cell>{e.method || 'Bilinmiyor (eski kayıt)'}</Cell>
                                <Cell>
                                  {e.effectKind === 'expense_refund'
                                    ? 'Gider iadesi'
                                    : e.effectKind === 'expense_cancel'
                                      ? 'Ters kayıt'
                                      : {
                                          active: 'Ödendi',
                                          cancelled: 'İptal edildi',
                                          corrected: 'Düzeltildi',
                                          refunded: 'İade alındı',
                                        }[e.status] || e.status}
                                </Cell>
                                <Cell>#{e.id}</Cell>
                              </Row>
                            ))}
                          </DataTable>
                        </>
                      )}
                    </>
                  )}
                  {page === 'finance' && period && (
                    <>
                      <Suspense
                        fallback={
                          <p role="status" className="loading-state">
                            Rapor ekranı yükleniyor…
                          </p>
                        }
                      >
                        <MonthlyFinance
                          report={period}
                          range={range}
                          onChange={changeRange}
                          revision={data}
                          dataRevision={dataRevision}
                        />
                      </Suspense>
                      <div className="report-banner">
                        <ChartNoAxesCombined size={24} />
                        <div>
                          <strong>Seçili dönem finans özeti</strong>
                          <p>
                            Mal alışları stok varlığıdır. Brüt kâr, yalnızca satılan ürünlerin
                            gerçekleşmiş maliyeti düşülerek hesaplanır.
                          </p>
                        </div>
                      </div>

                      <Card>
                        <CardContent>
                          <div className="activity-toolbar">
                            <div>
                              <h3>Nakit hareketleri</h3>
                              <p>İptal edilen işlemler ters kayıtlarıyla birlikte gösterilir.</p>
                            </div>
                            <Badge variant="outline">TL / seçili dönem</Badge>
                          </div>
                          <DataTable
                            headers={['Tarih', 'İşlem', 'Açıklama', 'Giriş', 'Çıkış', 'Detay']}
                            empty={!data.cash.length}
                          >
                            {data.cash
                              .filter((c) => within(c.occurred_at || c.created_at))
                              .map((c) => (
                                <Row
                                  key={c.id}
                                  record={
                                    c.source_kind &&
                                    [
                                      'expense',
                                      'supplier_payment',
                                      'supplier_refund',
                                      'collection',
                                      'refund',
                                    ].includes(c.source_kind)
                                      ? { entity: c.source_kind as any, id: c.source_id! }
                                      : undefined
                                  }
                                >
                                  <Cell>{date(c.occurred_at || c.created_at)}</Cell>
                                  <Cell>{kindLabel[c.display_kind || c.kind] || c.kind}</Cell>
                                  <Cell>{c.note}</Cell>
                                  <Cell className="text-positive">
                                    {c.amount > 0 ? tl(c.amount) : '—'}
                                  </Cell>
                                  <Cell className="text-warning">
                                    {c.amount < 0 ? tl(-c.amount) : '—'}
                                  </Cell>
                                  <Cell>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setDetail({
                                          entity: c.source_kind || c.kind,
                                          id:
                                            c.source_id ||
                                            (c.kind === 'expense' ? c.id : c.entity_id),
                                        });
                                      }}
                                    >
                                      Görüntüle
                                      <ChevronRight size={14} />
                                    </Button>
                                  </Cell>
                                </Row>
                              ))}
                          </DataTable>
                        </CardContent>
                      </Card>
                      <div className="report-footnote">
                        Dönem para iadesi: {tl(period?.refunds || 0)} · Fire:{' '}
                        {tl(period?.fire || 0)} · Tedarikçi iade maliyet farkı:{' '}
                        {tl(period?.returnVariance || 0)} · Dönem faaliyet sonucu:{' '}
                        {tl(netResult(period!))}. Tahsilat kâr sayılmaz. İptaller kendi işlem
                        dönemlerinde ters hareket olarak yer alır.
                      </div>
                    </>
                  )}
                  {page === 'history' && (
                    <Card>
                      <CardContent>
                        <ActivityList rows={data.activities} onOpen={openActivity} />
                      </CardContent>
                    </Card>
                  )}
                  {page === 'settings' && (
                    <div className="settings-layout">
                      <div className="settings-sections" role="tablist" aria-label="Ayar bölümleri">
                        {[
                          { id: 'general', label: 'İşletme' },
                          { id: 'appearance', label: 'Görünüm' },
                          { id: 'backup', label: 'Veriler ve yedekleme' },
                        ].map((t) => (
                          <button
                            type="button"
                            role="tab"
                            aria-selected={settingsSection === t.id}
                            key={t.id}
                            onClick={() => setSettingsSection(t.id)}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <div className="settings-grid">
                        {settingsSection === 'appearance' && (
                          <AppearanceGallery settings={data.settings} onSave={save} />
                        )}
                        <div hidden={settingsSection !== 'general'}>
                          <Card>
                            <CardContent>
                              <div className="section-heading">
                                <h3>İşletme ve görünüm</h3>
                                <Settings size={19} />
                              </div>
                              <p className="muted">Tercihleriniz yerel veritabanında saklanır.</p>
                              <form
                                onSubmit={settingsSubmit}
                                key={`${data.settings.company}-${data.settings.autoBackup}-${data.settings.backupRetention}`}
                                className="settings-form"
                              >
                                <Field
                                  label="İşletme adı"
                                  name="company"
                                  initial={data.settings.company}
                                />

                                <section className="settings-section">
                                  <h3>Otomatik yedekleme</h3>
                                  <p className="muted">
                                    Günlük güvenli kopyalar ve saklama tercihi.
                                  </p>
                                  <label className="check">
                                    <input
                                      type="checkbox"
                                      name="autoBackup"
                                      defaultChecked={data.settings.autoBackup === 'true'}
                                    />{' '}
                                    Günlük doğrulanmış otomatik yedek
                                  </label>
                                  <Field
                                    label="Saklanacak otomatik yedek sayısı (1–30)"
                                    name="retention"
                                    type="number"
                                    initial={data.settings.backupRetention || '7'}
                                  />
                                </section>
                                <Button disabled={maintenance}>Ayarları kaydet</Button>
                              </form>
                            </CardContent>
                          </Card>
                        </div>
                        <div hidden={settingsSection !== 'backup'}>
                          <Card>
                            <CardContent>
                              <div className="section-heading">
                                <h3>Veriler ve yedekleme</h3>
                                <ShieldCheck size={19} />
                              </div>
                              <p className="muted">
                                Tüm işletme kayıtları tek veritabanında tutulur.
                              </p>
                              <div className="path-box">
                                <span>VERİTABANI KONUMU</span>
                                <code>{data.dbPath}</code>
                              </div>
                              <p className="settings-help">
                                Son başarılı otomatik yedek:{' '}
                                {data.settings.autoBackupLastAt
                                  ? date(data.settings.autoBackupLastAt) +
                                    ' ' +
                                    new Date(data.settings.autoBackupLastAt).toLocaleTimeString(
                                      'tr-TR',
                                      {
                                        timeZone: 'Europe/Istanbul',
                                      },
                                    )
                                  : 'Henüz yok'}
                                . Yedekler aynı veri klasöründeki yedekler alt klasörüne kaydedilir.
                                Saklama sınırı yalnız doğrulanmış otomatik yedeklere uygulanır; elle
                                ve geçiş/geri dönüş yedekleri korunur.
                              </p>
                              {isOneDrivePath(data.dbPath) && (
                                <p className="settings-help">
                                  Belgeler klasörünüz OneDrive altında. Windows bu dosyaları
                                  eşitleyebilir; uygulama internet bağlantısı kullanmaz. Aynı
                                  işletme dosyasını iki bilgisayarda eşzamanlı açmayın.
                                </p>
                              )}
                              <Button
                                variant="outline"
                                disabled={maintenance}
                                onClick={() =>
                                  safeAction(async () => {
                                    const output = unwrap(await window.desktop.autoBackup());
                                    await latestReload.current();
                                    setNotice({
                                      text: output
                                        ? 'Otomatik yedek doğrulandı.'
                                        : 'Yedekleme gerekli değil.',
                                    });
                                  })
                                }
                              >
                                Otomatik yedeği şimdi oluştur
                              </Button>
                              <div className="backup-buttons">
                                <Button
                                  variant="outline"
                                  disabled={maintenance}
                                  onClick={() => maintenanceAction('openFolder')}
                                >
                                  <FolderOpen size={17} />
                                  Veritabanı Konumunu Aç
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={maintenance}
                                  onClick={() => maintenanceAction('backup')}
                                >
                                  <Download size={17} />
                                  Yedek Oluştur
                                </Button>
                              </div>
                              <section className="danger-zone">
                                <h3>Veri kurtarma</h3>
                                <p className="settings-help">
                                  Yedekten geri yükleme mevcut kayıtları değiştirir. Önce onay ve
                                  güvenli geri dönüş yedeği oluşturulur.
                                </p>
                                <Button
                                  variant="destructive"
                                  disabled={maintenance}
                                  onClick={() => maintenanceAction('restore')}
                                >
                                  <Upload size={17} />
                                  Yedekten Geri Yükle
                                </Button>
                              </section>
                              {maintenance && (
                                <p role="status">İşlem sürüyor. Lütfen pencereyi kapatmayın.</p>
                              )}
                              <p className="settings-help">
                                Geri yüklemeden önce onayınız alınır ve mevcut kayıtlar için geri
                                dönüş yedeği oluşturulur. Yedeğinizi başka bir diskte de
                                saklayabilirsiniz.
                              </p>
                            </CardContent>
                          </Card>
                        </div>
                        <div className="settings-info">
                          <ShieldCheck size={22} />
                          <div>
                            <strong>Yerel, bağımsız, kalıcı.</strong>
                            <p>
                              Uygulama ağ üzerinden veri göndermez; Belgeler OneDrive altındaysa
                              Windows dosyaları eşitleyebilir. Güncelleme veya uygulamayı kaldırma,
                              Belgeler klasöründeki kayıtlarınızı silmez. SQLite, çalışma sırasında
                              güvenli yazma için geçici WAL dosyaları oluşturabilir.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {page !== 'preorders' && data.pagination && data.pagination.total > 50 && (
                    <div className="toolbar pagination">
                      <Button
                        variant="outline"
                        disabled={loading || offset === 0}
                        onClick={() => setOffset((o) => Math.max(0, o - 50))}
                      >
                        Önceki sayfa
                      </Button>
                      <span>
                        {offset + 1}–{Math.min(offset + 50, data.pagination.total)} /{' '}
                        {data.pagination.total}
                      </span>
                      <Button
                        variant="outline"
                        disabled={loading || offset + 50 >= data.pagination.total}
                        onClick={() => setOffset((o) => o + 50)}
                      >
                        Sonraki sayfa
                      </Button>
                    </div>
                  )}
                </section>
              </main>
              <footer className="app-footer">
                <span>
                  SucukCenter <b>·</b> İşinizi takip edin, büyümeye odaklanın.
                </span>
                <span>
                  <span className="status-dot" />
                  Yerel veritabanı bağlı
                </span>
              </footer>
            </div>
            {form && (
              <Suspense
                fallback={
                  <p role="status" className="notice toast">
                    Form hazırlanıyor…
                  </p>
                }
              >
                <FormModal
                  key={`${form.kind}-${form.record?.id || 'new'}-${form.customerId || ''}`}
                  spec={form}
                  data={data}
                  onClose={() => setForm(null)}
                  onSave={save}
                />
              </Suspense>
            )}
            {supplierId && (
              <SupplierAccount
                revision={dataRevision}
                id={supplierId}
                data={data}
                onClose={() => setSupplierId(null)}
                onPay={(kind, id) => setForm({ kind, supplierId: id })}
                onReverse={setReversal}
              />
            )}
            {returnPurchase && (
              <SupplierReturnModal
                id={returnPurchase}
                data={data}
                onClose={() => setReturnPurchase(null)}
                onSave={save}
              />
            )}
            {detail && (
              <DetailModal
                value={detail}
                data={data}
                onClose={() => setDetail(null)}
                onCustomer={openCustomer}
                onReturn={setReturnPurchase}
                onReverse={setReversal}
              />
            )}
            {reversal && (
              <Suspense
                fallback={
                  <p role="status" className="notice toast">
                    İptal formu hazırlanıyor…
                  </p>
                }
              >
                <ReversalModal value={reversal} onClose={() => setReversal(null)} onSave={save} />
              </Suspense>
            )}
            {approval && <CostApproval impact={approval.impact} onAnswer={approval.answer} />}
          </div>
        </SearchStateContext.Provider>
      </PeriodContext.Provider>
    </RecordActionsProvider>
  );
}
function CalendarIcon() {
  return <History size={15} />;
}
