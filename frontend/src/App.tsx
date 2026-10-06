import { useEffect, useState } from 'react';
import './App.css';
import { AuditHistoryPage } from './pages/audit-history-page';
import { ControlPanelPage } from './pages/control-panel-page';
import { CostCalculationPage } from './pages/cost-calculation-page';
import { PriceListPage } from './pages/price-list-page';
import { ProductionYieldsPage } from './pages/production-yields-page';
import { DoorBuildPage } from './pages/door-build-page';
import { OrdersPage } from './pages/orders-page';
import { PricingSettingsPage } from './pages/pricing-settings-page';
import {
  isCostCalculationGroup,
  ProductsPage,
} from './pages/products-page';
import { RawMaterialsPage } from './pages/raw-materials-page';
import type { MaterialPriceType } from './lib/material-price-type';
import type { AppNavigation } from './lib/app-navigation';

type PageId =
  | 'dashboard'
  | 'orders'
  | 'materials'
  | 'yields'
  | 'cost-calculation'
  | 'price-list'
  | 'door-build'
  | 'products'
  | 'pricing'
  | 'audit';

const navPages: Array<{ id: Exclude<PageId, 'audit'>; label: string }> = [
  { id: 'dashboard', label: 'Kontrol Paneli' },
  { id: 'orders', label: 'Siparişler' },
  { id: 'materials', label: 'Ham Maddeler' },
  { id: 'yields', label: 'NET Üretim Adetleri' },
  { id: 'cost-calculation', label: 'Maliyet Hesaplama' },
  { id: 'price-list', label: 'Fiyat Listesi' },
  { id: 'door-build', label: 'Kapı İmalatı' },
  { id: 'products', label: 'Ürünler' },
  { id: 'pricing', label: 'Fiyatlandırma Ayarları' },
];

const pageLabels: Record<PageId, string> = {
  dashboard: 'Kontrol Paneli',
  orders: 'Siparişler',
  materials: 'Ham Maddeler',
  yields: 'NET Üretim Adetleri',
  'cost-calculation': 'Maliyet Hesaplama',
  'price-list': 'Fiyat Listesi',
  'door-build': 'Kapı İmalatı',
  products: 'Ürünler',
  pricing: 'Fiyatlandırma Ayarları',
  audit: 'Değişiklik Geçmişi',
};

function App() {
  const [page, setPage] = useState<PageId>('dashboard');
  const [costGroup, setCostGroup] = useState<string | null>(null);
  const [openCostSettings, setOpenCostSettings] = useState(false);
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialPriceType, setMaterialPriceType] =
    useState<MaterialPriceType>('CARD_INSTALLMENT');
  const [navOpen, setNavOpen] = useState(false);

  const closeNav = () => setNavOpen(false);

  const goToPage = (id: Exclude<PageId, 'audit'>) => {
    setOpenCostSettings(false);
    setMaterialSearch('');
    if (id === 'cost-calculation') setCostGroup(null);
    setPage(id);
    closeNav();
  };

  const navigate = (target: AppNavigation) => {
    setOpenCostSettings(Boolean(target.openCostSettings));
    setMaterialSearch(target.materialSearch ?? '');
    if (target.page === 'cost-calculation') {
      setCostGroup(target.costGroup ?? null);
    }
    setPage(target.page);
    closeNav();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNav();
    };
    const onResize = () => {
      if (window.innerWidth >= 1100) closeNav();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('nav-lock', navOpen);
    return () => document.body.classList.remove('nav-lock');
  }, [navOpen]);

  return (
    <div className={navOpen ? 'shell nav-open' : 'shell'}>
      {navOpen ? (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Menüyü kapat"
          onClick={closeNav}
        />
      ) : null}
      <aside className="sidebar" id="app-sidebar">
        <h2 className="brand">Zirve Ahşap</h2>
        <nav className="nav" aria-label="Ana menü">
          {navPages.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === page ? 'nav-button active' : 'nav-button'}
              aria-current={item.id === page ? 'page' : undefined}
              onClick={() => goToPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="header">
          <div className="header-row">
            <button
              type="button"
              className="nav-toggle"
              aria-label={navOpen ? 'Menüyü kapat' : 'Menüyü aç'}
              aria-expanded={navOpen}
              aria-controls="app-sidebar"
              onClick={() => setNavOpen((open) => !open)}
            >
              <span className="nav-toggle-bars" aria-hidden="true" />
            </button>
            <h1>{pageLabels[page]}</h1>
          </div>
          {page === 'dashboard' ? (
            <p className="header-sub">
              Maliyet ve fiyatlandırma sisteminin güncel durumunu takip edin.
            </p>
          ) : page === 'products' ? (
            <p className="header-sub">
              Sistemde tanımlı ürün gruplarını ve ürünleri görüntüleyin.
            </p>
          ) : page === 'pricing' ? (
            <p className="header-sub">
              Ürün gruplarının kart ve taksit farkı oranlarını yönetin.
            </p>
          ) : page === 'orders' ? (
            <p className="header-sub">
              Sipariş kaydedin. Müşteri formu ve üretim formu aynı kayıttan basılır.
            </p>
          ) : page === 'price-list' ? (
            <p className="header-sub">
              Güncel satış fiyatlarından müşteri fiyat listesi. Fiyatlar maliyet
              hesaplama sonuçlarıyla aynıdır.
            </p>
          ) : page === 'door-build' ? (
            <p className="header-sub">
              Malzeme listesi, siparişe aktarma ve A4 müşteri/üretim formu. Kısmi maliyet
              otomatik satış fiyatı yapılmaz.
            </p>
          ) : null}
        </header>
        <main className="content">
          {page === 'dashboard' ? (
            <ControlPanelPage onNavigate={navigate} />
          ) : page === 'orders' ? (
            <OrdersPage />
          ) : page === 'materials' ? (
            <RawMaterialsPage initialSearch={materialSearch} />
          ) : page === 'yields' ? (
            <ProductionYieldsPage />
          ) : page === 'cost-calculation' ? (
            <CostCalculationPage
              key={costGroup ?? 'door_frame'}
              initialProductGroup={
                costGroup && isCostCalculationGroup(costGroup)
                  ? costGroup
                  : 'door_frame'
              }
              initialSettingsOpen={openCostSettings}
              materialPriceType={materialPriceType}
              onMaterialPriceTypeChange={setMaterialPriceType}
              onOpenPriceList={() => setPage('price-list')}
            />
          ) : page === 'price-list' ? (
            <PriceListPage />
          ) : page === 'door-build' ? (
            <DoorBuildPage onNavigateToOrders={() => setPage('orders')} />
          ) : page === 'products' ? (
            <ProductsPage
              onOpenCost={(productGroupCode) => {
                setOpenCostSettings(false);
                setMaterialSearch('');
                setCostGroup(productGroupCode);
                setPage('cost-calculation');
              }}
            />
          ) : page === 'pricing' ? (
            <PricingSettingsPage />
          ) : page === 'audit' ? (
            <AuditHistoryPage />
          ) : (
            <section className="card">
              <p>Bu ekran henüz hazır değil.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
