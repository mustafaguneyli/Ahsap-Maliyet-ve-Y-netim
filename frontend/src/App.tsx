import { useState } from 'react';
import './App.css';
import { AuditHistoryPage } from './pages/audit-history-page';
import { ControlPanelPage } from './pages/control-panel-page';
import { CostCalculationPage } from './pages/cost-calculation-page';
import { ProductionYieldsPage } from './pages/production-yields-page';
import { RawMaterialsPage } from './pages/raw-materials-page';

type PageId =
  | 'dashboard'
  | 'materials'
  | 'yields'
  | 'cost-calculation'
  | 'products'
  | 'pricing'
  | 'audit';

const navPages: Array<{ id: Exclude<PageId, 'audit'>; label: string }> = [
  { id: 'dashboard', label: 'Kontrol Paneli' },
  { id: 'materials', label: 'Ham Maddeler' },
  { id: 'yields', label: 'NET Üretim Adetleri' },
  { id: 'cost-calculation', label: 'Maliyet Hesaplama' },
  { id: 'products', label: 'Ürünler' },
  { id: 'pricing', label: 'Fiyatlandırma Ayarları' },
];

const pageLabels: Record<PageId, string> = {
  dashboard: 'Kontrol Paneli',
  materials: 'Ham Maddeler',
  yields: 'NET Üretim Adetleri',
  'cost-calculation': 'Maliyet Hesaplama',
  products: 'Ürünler',
  pricing: 'Fiyatlandırma Ayarları',
  audit: 'Değişiklik Geçmişi',
};

function App() {
  const [page, setPage] = useState<PageId>('dashboard');

  return (
    <div className="shell">
      <aside className="sidebar">
        <h2 className="brand">Zirve Ahşap</h2>
        <nav className="nav">
          {navPages.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === page ? 'nav-button active' : 'nav-button'}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="header">
          <h1>{pageLabels[page]}</h1>
          {page === 'dashboard' ? (
            <p className="header-sub">
              Maliyet ve fiyatlandırma sisteminin güncel durumunu takip edin.
            </p>
          ) : null}
        </header>
        <main className="content">
          {page === 'dashboard' ? (
            <ControlPanelPage onNavigate={(next) => setPage(next)} />
          ) : page === 'materials' ? (
            <RawMaterialsPage />
          ) : page === 'yields' ? (
            <ProductionYieldsPage />
          ) : page === 'cost-calculation' ? (
            <CostCalculationPage />
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
