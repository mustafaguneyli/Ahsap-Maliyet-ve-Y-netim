import { useEffect, useState } from 'react';
import {
  listProductGroups,
  type ProductGroupSummary,
} from '../api/product-groups-api';
import { ApiError } from '../lib/api';
import './products-page.css';

export function isCostCalculationGroup(code: string): boolean {
  return code !== 'KAPI_IMALATI' && code.trim().length > 0;
}

export function ProductsPage(props: {
  onOpenCost: (productGroupCode: string) => void;
}) {
  const [groups, setGroups] = useState<ProductGroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await listProductGroups();
        if (!cancelled) setGroups(response.items);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Ürün kataloğu yüklenemedi.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="catalog">
      {error ? <p className="catalog-error">{error}</p> : null}
      {loading ? <p className="catalog-muted">Ürünler yükleniyor…</p> : null}
      {!loading && !error && groups.length === 0 ? (
        <p className="catalog-muted">Tanımlı ürün grubu yok.</p>
      ) : null}
      <div className="catalog-groups">
        {groups.map((group) => (
          <article key={group.code} className="catalog-group">
            <header className="catalog-group-head">
              <div>
                <h2>{group.name}</h2>
                <p>
                  {group.products.length} ürün
                  {group.isActive ? '' : ' · Pasif grup'}
                </p>
              </div>
              {isCostCalculationGroup(group.code) ? (
                <button
                  type="button"
                  className="catalog-link"
                  onClick={() => props.onOpenCost(group.code)}
                >
                  Maliyetini Gör
                </button>
              ) : null}
            </header>
            <ul className="catalog-products">
              {group.products.map((product) => (
                <li key={product.code}>
                  <div className="catalog-product-main">
                    <strong>{product.name}</strong>
                    <span>
                      {product.code} · {group.name}
                    </span>
                  </div>
                  <span
                    className={
                      product.isActive ? 'catalog-status active' : 'catalog-status'
                    }
                  >
                    {product.isActive ? 'Aktif' : 'Pasif'}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
