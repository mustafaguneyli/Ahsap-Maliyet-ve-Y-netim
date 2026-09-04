import { useEffect, useState } from 'react';
import './App.css';
import { CostCalculationPage } from './pages/cost-calculation-page';
import { ExtraCostsPage } from './pages/extra-costs-page';
import { ProductionYieldsPage } from './pages/production-yields-page';
import { RawMaterialsPage } from './pages/raw-materials-page';

type PageId =
  | 'dashboard'
  | 'materials'
  | 'yields'
  | 'cost-calculation'
  | 'products'
  | 'recipes'
  | 'extra-costs'
  | 'pricing'
  | 'audit';

const pages: { id: PageId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'materials', label: 'Ham Maddeler' },
  { id: 'yields', label: 'NET Üretim Adetleri' },
  { id: 'cost-calculation', label: 'Maliyet Hesaplama' },
  { id: 'products', label: 'Ürünler' },
  { id: 'recipes', label: 'Reçeteler' },
  { id: 'extra-costs', label: 'Ek Maliyetler' },
  { id: 'pricing', label: 'Fiyatlandırma Ayarları' },
  { id: 'audit', label: 'Değişiklik Geçmişi' },
];

type HealthResponse = {
  status: string;
  database: string;
  timestamp: string;
};

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function App() {
  const [page, setPage] = useState<PageId>('dashboard');
  const [health, setHealth] = useState<string>('Kontrol ediliyor...');
  const [healthOk, setHealthOk] = useState(false);

  useEffect(() => {
    void fetch(`${apiUrl}/health`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return (await response.json()) as HealthResponse;
      })
      .then((data) => {
        setHealthOk(data.status === 'ok' && data.database === 'up');
        setHealth(`Backend: ${data.status}, veritabanı: ${data.database}`);
      })
      .catch(() => {
        setHealthOk(false);
        setHealth('Backend /health yanıt vermiyor');
      });
  }, []);

  const current = pages.find((item) => item.id === page);

  return (
    <div className="shell">
      <aside className="sidebar">
        <h2 className="brand">Zirve Ahşap</h2>
        <nav className="nav">
          {pages.map((item) => (
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
          <h1>{current?.label}</h1>
        </header>
        <main className="content">
          {page === 'dashboard' ? (
            <section className="card">
              <p>Zirve Ahşap Maliyet ve Fiyatlandırma Sistemi — yönetim paneli iskeleti (Faz 1A).</p>
              <p className={healthOk ? 'status ok' : 'status error'}>{health}</p>
            </section>
          ) : page === 'materials' ? (
            <RawMaterialsPage />
          ) : page === 'yields' ? (
            <ProductionYieldsPage />
          ) : page === 'cost-calculation' ? (
            <CostCalculationPage />
          ) : page === 'extra-costs' ? (
            <ExtraCostsPage />
          ) : (
            <section className="card">
              <p>{current?.label} ekranı sonraki fazlarda geliştirilecektir.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
