import { FormEvent, useEffect, useState } from 'react';
import { listRawMaterials, RawMaterial } from '../api/raw-materials-api';
import {
  calculateProductionYield,
  createProductionYield,
  listProductionYields,
  ProductionYield,
  replaceProductionYield,
} from '../api/production-yields-api';
import { listProductGroups, ProductGroupSummary } from '../api/product-groups-api';
import { ApiError } from '../lib/api';
import {
  cmToMm,
  formatPieceSizeCm,
  formatRawMaterialOptionLabel,
  formatSheetSizeCm,
} from '../lib/length';
import './raw-materials-page.css';

type StatusFilter = 'all' | 'active' | 'inactive';
type DrawerMode = 'create' | 'replace';

type FormState = {
  rawMaterialId: string;
  pieceWidthCm: string;
  pieceLengthCm: string;
  netQty: string;
};

type ReplaceFormState = {
  netQty: string;
  reason: string;
};

const emptyForm = (): FormState => ({
  rawMaterialId: '',
  pieceWidthCm: '',
  pieceLengthCm: '',
  netQty: '',
});

const emptyReplaceForm = (): ReplaceFormState => ({
  netQty: '',
  reason: '',
});

function uniqueNames(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function formatUsageGroup(item: ProductionYield): string {
  const names = uniqueNames((item.usages ?? []).map((usage) => usage.productGroupName));
  return names.length > 0 ? names.join(', ') : '—';
}

function formatUsageProduct(item: ProductionYield): string {
  const names = uniqueNames((item.usages ?? []).map((usage) => usage.productName));
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0];
  const groups = uniqueNames((item.usages ?? []).map((usage) => usage.productGroupName));
  if (groups.length === 1) return 'Ortak kullanım';
  return names.join(', ');
}

function validateCreateForm(form: FormState): string | null {
  if (!form.rawMaterialId) return 'Ham madde seçimi zorunludur.';

  const widthCm = Number(form.pieceWidthCm.replace(',', '.'));
  const lengthCm = Number(form.pieceLengthCm.replace(',', '.'));
  const netQty = Number(form.netQty);

  if (!Number.isFinite(widthCm) || widthCm <= 0) {
    return 'Parça eni 0’dan büyük olmalıdır (cm).';
  }
  if (!Number.isFinite(lengthCm) || lengthCm <= 0) {
    return 'Parça boyu 0’dan büyük olmalıdır (cm).';
  }
  if (!Number.isInteger(netQty) || netQty <= 0) {
    return 'NET adet pozitif tam sayı olmalıdır.';
  }
  return null;
}

function validateReplaceForm(form: ReplaceFormState): string | null {
  const netQty = Number(form.netQty);
  if (!Number.isInteger(netQty) || netQty <= 0) {
    return 'Yeni NET adet pozitif tam sayı olmalıdır.';
  }
  if (!form.reason.trim()) {
    return 'Değişiklik sebebi zorunludur.';
  }
  return null;
}

export function ProductionYieldsPage() {
  const [items, setItems] = useState<ProductionYield[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [productGroups, setProductGroups] = useState<ProductGroupSummary[]>([]);
  const [productFilter, setProductFilter] = useState('');
  const [thicknessFilter, setThicknessFilter] = useState('');
  const [pieceWidthFilter, setPieceWidthFilter] = useState('');
  const [pieceLengthFilter, setPieceLengthFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('create');
  const [selected, setSelected] = useState<ProductionYield | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [replaceForm, setReplaceForm] = useState<ReplaceFormState>(emptyReplaceForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [calculatedQty, setCalculatedQty] = useState<number | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [netQtyManual, setNetQtyManual] = useState(false);

  const selectedMaterial = materials.find((m) => m.id === form.rawMaterialId) ?? null;

  const loadMaterials = async () => {
    const data = await listRawMaterials({ isActive: true });
    setMaterials(data);
  };

  const loadYields = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: {
        thickness?: number;
        pieceWidth?: number;
        pieceLength?: number;
        isActive?: boolean;
        productGroupId?: string;
        productId?: string;
      } = {};

      if (statusFilter === 'active') params.isActive = true;
      if (statusFilter === 'inactive') params.isActive = false;

      if (productFilter.startsWith('group:')) {
        params.productGroupId = productFilter.slice('group:'.length);
      } else if (productFilter.startsWith('product:')) {
        params.productId = productFilter.slice('product:'.length);
      }

      if (thicknessFilter.trim()) {
        const t = Number(thicknessFilter.replace(',', '.'));
        if (Number.isFinite(t) && t > 0) params.thickness = t;
      }
      if (pieceWidthFilter.trim()) {
        const w = Number(pieceWidthFilter.replace(',', '.'));
        if (Number.isFinite(w) && w > 0) params.pieceWidth = cmToMm(w);
      }
      if (pieceLengthFilter.trim()) {
        const l = Number(pieceLengthFilter.replace(',', '.'));
        if (Number.isFinite(l) && l > 0) params.pieceLength = cmToMm(l);
      }

      const data = await listProductionYields(params);
      setItems(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'NET adetler yüklenemedi.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMaterials().catch(() => {
      setError('Ham madde listesi yüklenemedi.');
    });
    void listProductGroups()
      .then((response) => setProductGroups(response.items))
      .catch(() => {
        setError('Ürün grupları yüklenemedi.');
      });
  }, []);

  useEffect(() => {
    void loadYields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productFilter, thicknessFilter, pieceWidthFilter, pieceLengthFilter, statusFilter]);

  const openCreate = () => {
    setDrawerMode('create');
    setSelected(null);
    setForm(emptyForm());
    setFormError(null);
    setCalculatedQty(null);
    setCalcError(null);
    setNetQtyManual(false);
    setDrawerOpen(true);
  };

  const openReplace = (item: ProductionYield) => {
    setDrawerMode('replace');
    setSelected(item);
    setReplaceForm({ netQty: String(item.netQty), reason: '' });
    setFormError(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    if (saving) return;
    setDrawerOpen(false);
    setSelected(null);
    setFormError(null);
    setCalculatedQty(null);
    setCalcError(null);
    setNetQtyManual(false);
  };

  useEffect(() => {
    if (!drawerOpen || drawerMode !== 'create') return;

    const widthCm = Number(form.pieceWidthCm.replace(',', '.'));
    const lengthCm = Number(form.pieceLengthCm.replace(',', '.'));

    if (
      !form.rawMaterialId ||
      !Number.isFinite(widthCm) ||
      widthCm <= 0 ||
      !Number.isFinite(lengthCm) ||
      lengthCm <= 0
    ) {
      setCalculatedQty(null);
      setCalcError(null);
      setCalcLoading(false);
      return;
    }

    let cancelled = false;
    setCalcLoading(true);
    setCalcError(null);

    const timer = window.setTimeout(() => {
      void calculateProductionYield({
        rawMaterialId: form.rawMaterialId,
        pieceWidthMm: cmToMm(widthCm),
        pieceLengthMm: cmToMm(lengthCm),
      })
        .then((result) => {
          if (cancelled) return;
          setCalculatedQty(result.calculatedQty);
          setCalcError(null);
          setForm((prev) => {
            if (netQtyManual) return prev;
            return { ...prev, netQty: String(result.calculatedQty) };
          });
        })
        .catch((err) => {
          if (cancelled) return;
          setCalculatedQty(null);
          setCalcError(err instanceof ApiError ? err.message : 'Adet hesaplanamadı.');
          if (!netQtyManual) {
            setForm((prev) => ({ ...prev, netQty: '' }));
          }
        })
        .finally(() => {
          if (!cancelled) setCalcLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    drawerOpen,
    drawerMode,
    form.rawMaterialId,
    form.pieceWidthCm,
    form.pieceLengthCm,
    netQtyManual,
  ]);

  const onSubmitCreate = async (event: FormEvent) => {
    event.preventDefault();
    const localError = validateCreateForm(form);
    if (localError) {
      setFormError(localError);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const widthCm = Number(form.pieceWidthCm.replace(',', '.'));
      const lengthCm = Number(form.pieceLengthCm.replace(',', '.'));
      const netQty = Number(form.netQty);

      await createProductionYield({
        rawMaterialId: form.rawMaterialId,
        pieceWidthMm: cmToMm(widthCm),
        pieceLengthMm: cmToMm(lengthCm),
        netQty,
        isActive: true,
      });

      setNotice('Yeni NET adet kaydı oluşturuldu.');
      setDrawerOpen(false);
      await loadYields();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Kayıt oluşturulamadı.');
    } finally {
      setSaving(false);
    }
  };

  const onSubmitReplace = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;

    const localError = validateReplaceForm(replaceForm);
    if (localError) {
      setFormError(localError);
      return;
    }

    const newQty = Number(replaceForm.netQty);
    const ok = window.confirm(
      `NET adet ${selected.netQty} → ${newQty} olarak değiştirilecek. Eski değer geçmişte korunacaktır.`,
    );
    if (!ok) return;

    setSaving(true);
    setFormError(null);
    try {
      await replaceProductionYield(selected.id, {
        netQty: newQty,
        reason: replaceForm.reason.trim(),
      });
      setNotice(`NET adet ${selected.netQty} → ${newQty} olarak güncellendi.`);
      setDrawerOpen(false);
      setSelected(null);
      await loadYields();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'NET adet güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <section className="rm-page">
      {notice ? <div className="rm-notice">{notice}</div> : null}

      <div className="rm-toolbar">
        <div className="rm-filters">
          <select
            className="rm-input"
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            aria-label="Ürün filtresi"
          >
            <option value="">Tüm Ürünler</option>
            {productGroups.map((group) => (
              <optgroup key={group.id} label={group.name}>
                <option value={`group:${group.id}`}>{group.name}</option>
                {group.products.length > 1
                  ? group.products.map((product) => (
                      <option key={product.id} value={`product:${product.id}`}>
                        {product.name}
                      </option>
                    ))
                  : null}
              </optgroup>
            ))}
          </select>

          <input
            className="rm-input rm-input-narrow"
            type="text"
            inputMode="decimal"
            placeholder="Kalınlık (mm)"
            value={thicknessFilter}
            onChange={(e) => setThicknessFilter(e.target.value)}
          />

          <input
            className="rm-input rm-input-narrow"
            type="text"
            inputMode="decimal"
            placeholder="Parça eni (cm)"
            value={pieceWidthFilter}
            onChange={(e) => setPieceWidthFilter(e.target.value)}
          />

          <input
            className="rm-input rm-input-narrow"
            type="text"
            inputMode="decimal"
            placeholder="Parça boyu (cm)"
            value={pieceLengthFilter}
            onChange={(e) => setPieceLengthFilter(e.target.value)}
          />

          <select
            className="rm-input rm-input-narrow"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Durum filtresi"
          >
            <option value="all">Tümü</option>
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
          </select>
        </div>

        <button type="button" className="rm-btn rm-btn-primary" onClick={openCreate}>
          Yeni NET Adet
        </button>
      </div>

      {error ? <div className="rm-alert rm-alert-error">{error}</div> : null}

      <div className="rm-table-wrap">
        {loading ? (
          <p className="rm-empty">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p className="rm-empty">Gösterilecek NET adet kaydı bulunamadı.</p>
        ) : (
          <table className="rm-table">
            <thead>
              <tr>
                <th>Ürün Grubu</th>
                <th>Ürün</th>
                <th>Ham Madde</th>
                <th>MDF Kalınlığı</th>
                <th>Tabaka Ölçüsü</th>
                <th>Parça Ölçüsü</th>
                <th>NET Adet</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{formatUsageGroup(item)}</td>
                  <td>{formatUsageProduct(item)}</td>
                  <td className="rm-name">{item.rawMaterial.name}</td>
                  <td>{item.rawMaterial.thicknessMm} mm</td>
                  <td>
                    {formatSheetSizeCm(
                      item.rawMaterial.sheetWidthMm,
                      item.rawMaterial.sheetLengthMm,
                    )}
                  </td>
                  <td>{formatPieceSizeCm(item.pieceWidthMm, item.pieceLengthMm)}</td>
                  <td className="rm-price">{item.netQty}</td>
                  <td>
                    <span className={item.isActive ? 'rm-badge ok' : 'rm-badge muted'}>
                      {item.isActive ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td>
                    {item.isActive ? (
                      <button
                        type="button"
                        className="rm-btn rm-btn-sm"
                        onClick={() => openReplace(item)}
                      >
                        NET Güncelle
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawerOpen && drawerMode === 'create' ? (
        <div className="rm-drawer-overlay" onClick={closeDrawer}>
          <aside
            className="rm-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Yeni NET adet"
          >
            <header className="rm-drawer-header">
              <h2>Yeni NET Adet</h2>
              <button type="button" className="rm-link" onClick={closeDrawer}>
                Kapat
              </button>
            </header>

            <form className="rm-form" onSubmit={(e) => void onSubmitCreate(e)}>
              {formError ? <div className="rm-alert rm-alert-error">{formError}</div> : null}

              <label className="rm-field">
                <span>Ham Madde *</span>
                <select
                  className="rm-input"
                  value={form.rawMaterialId}
                  onChange={(e) => {
                    setNetQtyManual(false);
                    setForm((f) => ({ ...f, rawMaterialId: e.target.value }));
                  }}
                  required
                >
                  <option value="">Seçiniz…</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {formatRawMaterialOptionLabel(m)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedMaterial ? (
                <>
                  <div className="rm-summary">
                    <div className="rm-summary-label">Tabaka Ölçüsü</div>
                    <div className="rm-summary-value">
                      {formatSheetSizeCm(
                        selectedMaterial.sheetWidthMm,
                        selectedMaterial.sheetLengthMm,
                      )}
                    </div>
                  </div>
                  <div className="rm-summary">
                    <div className="rm-summary-label">Kalınlık</div>
                    <div className="rm-summary-value">{selectedMaterial.thicknessMm} mm</div>
                  </div>
                </>
              ) : null}

              <div className="rm-field-row">
                <label className="rm-field">
                  <span>Parça Eni (cm) *</span>
                  <input
                    className="rm-input"
                    type="text"
                    inputMode="decimal"
                    value={form.pieceWidthCm}
                    onChange={(e) => {
                      setNetQtyManual(false);
                      setForm((f) => ({ ...f, pieceWidthCm: e.target.value }));
                    }}
                    placeholder="10"
                    required
                  />
                </label>
                <label className="rm-field">
                  <span>Parça Boyu (cm) *</span>
                  <input
                    className="rm-input"
                    type="text"
                    inputMode="decimal"
                    value={form.pieceLengthCm}
                    onChange={(e) => {
                      setNetQtyManual(false);
                      setForm((f) => ({ ...f, pieceLengthCm: e.target.value }));
                    }}
                    placeholder="210"
                    required
                  />
                </label>
              </div>

              <div className="rm-summary">
                <div className="rm-summary-label">Hesaplanan Adet</div>
                <div className="rm-summary-value">
                  {calcLoading
                    ? 'Hesaplanıyor…'
                    : calcError
                      ? '—'
                      : calculatedQty != null
                        ? calculatedQty
                        : '—'}
                </div>
              </div>

              {calcError ? <div className="rm-alert rm-alert-error">{calcError}</div> : null}

              <label className="rm-field">
                <span>NET Adet *</span>
                <input
                  className="rm-input"
                  type="number"
                  min={1}
                  step={1}
                  value={form.netQty}
                  onChange={(e) => {
                    setNetQtyManual(true);
                    setForm((f) => ({ ...f, netQty: e.target.value }));
                  }}
                  placeholder="26"
                  required
                />
              </label>

              {calculatedQty != null &&
              form.netQty &&
              Number(form.netQty) !== calculatedQty ? (
                <p className="rm-hint">
                  Hesaplanan: {calculatedQty}
                  <br />
                  Kaydedilecek NET: {form.netQty}
                </p>
              ) : (
                <p className="rm-hint">
                  Önerilen NET kesim hesabından gelir. Farklı bir değer kaydedebilirsiniz.
                </p>
              )}

              <div className="rm-form-actions">
                <button type="button" className="rm-btn" onClick={closeDrawer} disabled={saving}>
                  İptal
                </button>
                <button type="submit" className="rm-btn rm-btn-primary" disabled={saving}>
                  {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      {drawerOpen && drawerMode === 'replace' && selected ? (
        <div className="rm-drawer-overlay" onClick={closeDrawer}>
          <aside
            className="rm-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="NET güncelle"
          >
            <header className="rm-drawer-header">
              <h2>NET Adedi Güncelle</h2>
              <button type="button" className="rm-link" onClick={closeDrawer}>
                Kapat
              </button>
            </header>

            <form className="rm-form" onSubmit={(e) => void onSubmitReplace(e)}>
              {formError ? <div className="rm-alert rm-alert-error">{formError}</div> : null}

              <div className="rm-summary">
                <div className="rm-summary-label">Ürün Grubu</div>
                <div className="rm-summary-value">{formatUsageGroup(selected)}</div>
              </div>

              <div className="rm-summary">
                <div className="rm-summary-label">Ürün</div>
                <div className="rm-summary-value">{formatUsageProduct(selected)}</div>
              </div>

              <div className="rm-summary">
                <div className="rm-summary-label">Ham Madde</div>
                <div className="rm-summary-value">{selected.rawMaterial.name}</div>
              </div>

              <div className="rm-summary">
                <div className="rm-summary-label">Parça Ölçüsü</div>
                <div className="rm-summary-value">
                  {formatPieceSizeCm(selected.pieceWidthMm, selected.pieceLengthMm)}
                </div>
              </div>

              <div className="rm-summary">
                <div className="rm-summary-label">Mevcut NET</div>
                <div className="rm-summary-value">{selected.netQty}</div>
              </div>

              <label className="rm-field">
                <span>Yeni NET *</span>
                <input
                  className="rm-input"
                  type="number"
                  min={1}
                  step={1}
                  value={replaceForm.netQty}
                  onChange={(e) => setReplaceForm((f) => ({ ...f, netQty: e.target.value }))}
                  required
                />
              </label>

              <label className="rm-field">
                <span>Değişiklik Sebebi *</span>
                <textarea
                  className="rm-input"
                  rows={4}
                  value={replaceForm.reason}
                  onChange={(e) => setReplaceForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Örn. Üretim kesim planı güncellendi"
                  required
                />
              </label>

              <p className="rm-hint">
                Eski NET silinmez; yeni değer kayda geçilir.
              </p>

              <div className="rm-form-actions">
                <button type="button" className="rm-btn" onClick={closeDrawer} disabled={saving}>
                  İptal
                </button>
                <button type="submit" className="rm-btn rm-btn-primary" disabled={saving}>
                  {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
