import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CatalogItemMode,
  createCatalogItem,
  fetchGenericCostList,
  previewGenericCatalog,
  type GenericCostRow,
  type GenericExtraCostPayload,
  type GenericRecipeItemPayload,
  type RecipeCalculationMode,
} from '../api/cost-calculation-api';
import {
  listProductGroups,
  type ProductGroupSummary,
} from '../api/product-groups-api';
import { listRawMaterials, type RawMaterial } from '../api/raw-materials-api';
import { listExtraCosts, type ExtraCostItem } from '../api/extra-costs-api';
import { ApiError } from '../lib/api';
import {
  cmInputToMmString,
  formatPieceSizeCm,
  formatRawMaterialOptionLabel,
} from '../lib/length';
import type { MaterialPriceType } from '../lib/material-price-type';
import {
  STANDARD_EXTRA_COST_TYPE_CODES,
  calculatorTypeLabel,
  costStatusLabel,
  extraCostTypeLabel,
  friendlyTechnicalTerms,
  recipeCalculationModeLabel,
  RECIPE_CALCULATION_MODE_OPTIONS,
} from '../lib/display-labels';

const SPECIAL_CODES = new Set(['door_frame', 'PERVAZ', 'SUPURGELIK', 'CITA']);

const SPECIAL_PRODUCTS: Record<string, Array<{ code: string; name: string }>> = {
  door_frame: [
    { code: '34_MM', name: '34 MM MDF Kasa' },
    { code: '30_MM', name: '30 MM MDF Kasa' },
  ],
  PERVAZ: [
    { code: 'AYARLI_PERVAZ', name: 'Ayarlı Pervaz' },
    { code: 'DEKORATIF_PERVAZ', name: 'Dekoratif Pervaz' },
    { code: 'DEKORATIF_PERVAZ_GENIS_KILCIK', name: 'Dekoratif Geniş Kılçık' },
  ],
  SUPURGELIK: [
    { code: 'DUZ_SUPURGELIK', name: 'Düz Süpürgelik' },
    { code: 'DEKORATIF_SUPURGELIK', name: 'Dekoratif Süpürgelik' },
    { code: 'DUZ_PP_SARMA_SUPURGELIK', name: 'Düz PP Sarma' },
    { code: 'DEKORATIF_PP_SARMA_SUPURGELIK', name: 'Dekoratif PP Sarma' },
  ],
  CITA: [{ code: 'CITA', name: 'Çıta' }],
};

const CALC_MODES: Array<{ value: RecipeCalculationMode; label: string }> =
  RECIPE_CALCULATION_MODE_OPTIONS.map((option) => ({
    value: option.value as RecipeCalculationMode,
    label: option.label,
  }));

type WizardStep =
  | 'kind'
  | 'basics'
  | 'size'
  | 'recipe'
  | 'net'
  | 'extras'
  | 'preview'
  | 'save';

const STEPS: WizardStep[] = [
  'kind',
  'basics',
  'size',
  'recipe',
  'net',
  'extras',
  'preview',
  'save',
];

const STEP_LABELS: Record<WizardStep, string> = {
  kind: 'Tür',
  basics: 'Temel Bilgiler',
  size: 'Ölçü',
  recipe: 'Reçete',
  net: 'NET',
  extras: 'Ek Maliyet',
  preview: 'Önizleme',
  save: 'Kaydet',
};

function cmToMm(cmInput: string): number | null {
  const mmStr = cmInputToMmString(cmInput);
  if (mmStr == null || mmStr.includes('.')) return null;
  const mm = Number(mmStr);
  return Number.isInteger(mm) && mm > 0 ? mm : null;
}

function parsePositiveInt(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value.trim())) return null;
  return Number(value.trim());
}

export function CatalogItemDrawer({
  open,
  defaultProductGroup,
  defaultProductCode,
  materialPriceType,
  onClose,
  onSaved,
  onNavigateRawMaterials,
}: {
  open: boolean;
  defaultProductGroup: string;
  defaultProductCode?: string;
  materialPriceType: MaterialPriceType;
  onClose: () => void;
  onSaved: (message: string, productGroupCode: string) => void;
  onNavigateRawMaterials?: () => void;
}) {
  const [step, setStep] = useState<WizardStep>('kind');
  const [mode, setMode] = useState<CatalogItemMode>('NEW_SIZE');
  const [groups, setGroups] = useState<ProductGroupSummary[]>([]);
  const [productGroup, setProductGroup] = useState(defaultProductGroup);
  const [newGroupCode, setNewGroupCode] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [productCode, setProductCode] = useState(defaultProductCode ?? '');
  const [newProductCode, setNewProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [productUnit, setProductUnit] = useState<'ADET' | 'BOY' | 'METRE' | 'M2'>(
    'ADET',
  );
  const [widthCm, setWidthCm] = useState('');
  const [lengthCm, setLengthCm] = useState('');
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [extraTypes, setExtraTypes] = useState<ExtraCostItem[]>([]);
  const [rawMaterialId, setRawMaterialId] = useState('');
  const [netQty, setNetQty] = useState('');
  const [secondaryNetQty, setSecondaryNetQty] = useState('');
  const [kilcikNetQty, setKilcikNetQty] = useState('');
  const [recipeItems, setRecipeItems] = useState<GenericRecipeItemPayload[]>([
    {
      rawMaterialId: '',
      calculationMode: 'PER_SHEET_YIELD',
      quantity: '1',
      newNetQty: undefined,
      sortOrder: 1,
    },
  ]);
  const [extraCosts, setExtraCosts] = useState<GenericExtraCostPayload[]>([]);
  const [copyRecipeFromSizeId, setCopyRecipeFromSizeId] = useState('');
  const [copySizeOptions, setCopySizeOptions] = useState<GenericCostRow[]>([]);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isSpecial = SPECIAL_CODES.has(productGroup) && mode !== 'NEW_GROUP';
  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    if (!open) return;
    setStep('kind');
    setMode('NEW_SIZE');
    setProductGroup(defaultProductGroup);
    setProductCode(defaultProductCode ?? '');
    setNewGroupCode('');
    setNewGroupName('');
    setNewProductCode('');
    setProductName('');
    setProductUnit('ADET');
    setWidthCm('');
    setLengthCm(defaultProductGroup === 'CITA' ? '280' : '');
    setRawMaterialId('');
    setNetQty('');
    setSecondaryNetQty('');
    setKilcikNetQty('');
    setRecipeItems([
      {
        rawMaterialId: '',
        calculationMode: 'PER_SHEET_YIELD',
        quantity: '1',
        sortOrder: 1,
      },
    ]);
    setExtraCosts([]);
    setCopyRecipeFromSizeId('');
    setCopySizeOptions([]);
    setPreviewText(null);
    setFormError(null);
    void listProductGroups().then((res) => setGroups(res.items));
    void listRawMaterials({ isActive: true }).then(setMaterials);
  }, [open, defaultProductGroup, defaultProductCode]);

  useEffect(() => {
    if (!open || isSpecial) return;
    void listExtraCosts('door_frame')
      .then((res) => setExtraTypes(res.items))
      .catch(() => setExtraTypes([]));
  }, [open, isSpecial, mode, productGroup]);

  useEffect(() => {
    if (!open || isSpecial || mode !== 'NEW_SIZE' || !productCode || !productGroup) {
      setCopySizeOptions([]);
      return;
    }
    let cancelled = false;
    void fetchGenericCostList(productGroup, materialPriceType)
      .then((res) => {
        if (cancelled) return;
        setCopySizeOptions(
          res.rows.filter((r) => r.productCode === productCode && r.sizeId),
        );
      })
      .catch(() => {
        if (!cancelled) setCopySizeOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isSpecial, mode, productCode, productGroup, materialPriceType]);

  const productOptions = useMemo(() => {
    if (SPECIAL_CODES.has(productGroup)) {
      return SPECIAL_PRODUCTS[productGroup] ?? [];
    }
    const g = groups.find((x) => x.code === productGroup);
    return (g?.products ?? []).map((p) => ({ code: p.code, name: p.name }));
  }, [productGroup, groups]);

  const widthMm = cmToMm(widthCm);
  const lengthMm = cmToMm(lengthCm);

  const goNext = () => {
    setFormError(null);
    const next = STEPS[stepIndex + 1];
    if (!next) return;
    if (isSpecial && (next === 'recipe' || next === 'net' || next === 'extras')) {
      // özel path: recipe/net/extras atla → preview
      if (next === 'recipe') {
        setStep('preview');
        return;
      }
    }
    if (!isSpecial && copyRecipeFromSizeId && (next === 'recipe' || next === 'net')) {
      setStep('extras');
      return;
    }
    setStep(next);
  };

  const goBack = () => {
    setFormError(null);
    const prev = STEPS[stepIndex - 1];
    if (!prev) return;
    if (isSpecial && step === 'preview') {
      setStep('size');
      return;
    }
    if (!isSpecial && copyRecipeFromSizeId && (step === 'extras' || step === 'preview')) {
      if (step === 'preview') {
        setStep('extras');
        return;
      }
      setStep('size');
      return;
    }
    setStep(prev);
  };

  const runPreview = async () => {
    setFormError(null);
    if (widthMm == null || lengthMm == null) {
      setFormError('Ölçü geçersiz.');
      return;
    }
    if (isSpecial) {
      setPreviewText(
        [
          `Ürün: ${productGroup} / ${productCode || newProductCode}`,
          `Ölçü: ${formatPieceSizeCm(widthMm, lengthMm)}`,
          `Ham madde: seçili`,
          `NET: ${netQty}${secondaryNetQty ? ` / ${secondaryNetQty}` : ''}${kilcikNetQty ? ` / kılçık ${kilcikNetQty}` : ''}`,
          'Kayıt sonrası özel hesap motoru listede hesaplar.',
        ].join('\n'),
      );
      setStep('preview');
      return;
    }
    if (copyRecipeFromSizeId) {
      const source = copySizeOptions.find((r) => r.sizeId === copyRecipeFromSizeId);
      setPreviewText(
        [
          `Ölçü: ${formatPieceSizeCm(widthMm, lengthMm)}`,
          `Reçete: mevcut ölçüden bağımsız kopya (${source?.displayName ?? copyRecipeFromSizeId})`,
          'Kayıt anında yeni reçete oluşturulur; kaynak ölçü değişmez.',
        ].join('\n'),
      );
      setStep('preview');
      return;
    }
    try {
      const result = await previewGenericCatalog({
        productGroupCode: mode === 'NEW_GROUP' ? newGroupCode : productGroup,
        productGroupName: mode === 'NEW_GROUP' ? newGroupName : undefined,
        productCode: mode === 'NEW_SIZE' ? productCode : newProductCode,
        productName: mode === 'NEW_SIZE' ? undefined : productName,
        productUnit,
        widthMm,
        lengthMm,
        materialPriceType,
        recipeItems: recipeItems.map((item, i) => ({
          ...item,
          sortOrder: item.sortOrder ?? i + 1,
          pieceWidthMm: item.pieceWidthMm ?? widthMm,
          pieceLengthMm: item.pieceLengthMm ?? lengthMm,
        })),
        extraCosts,
      });
      const lines = [
        `Durum: ${costStatusLabel(result.status)}`,
        `Ölçü: ${formatPieceSizeCm(widthMm, lengthMm)}`,
        `Malzeme: ${result.materialCostTotal ?? '—'}`,
        `Ek maliyet: ${result.extraCostTotal ?? '—'}`,
        `Üretim: ${result.productionCost ?? 'Hesaplanamıyor'}`,
        ...(result.missingSources ?? []).map(
          (m) => `Eksik: ${friendlyTechnicalTerms(m)}`,
        ),
      ];
      setPreviewText(lines.join('\n'));
      setStep('preview');
    } catch (err) {
      setFormError(
        friendlyTechnicalTerms(
          err instanceof ApiError ? err.message : 'Önizleme başarısız.',
        ),
      );
    }
  };

  const onSave = async (event?: FormEvent) => {
    event?.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (widthMm == null || lengthMm == null) {
        throw new Error('Ölçü geçersiz.');
      }
      if (isSpecial) {
        const result = await createCatalogItem({
          mode,
          productGroupCode: productGroup,
          productCode: mode === 'NEW_SIZE' ? productCode : undefined,
          newProductCode: mode === 'NEW_PRODUCT' ? newProductCode : undefined,
          productName: mode === 'NEW_PRODUCT' ? productName : undefined,
          widthMm,
          lengthMm,
          rawMaterialId,
          netQty: parsePositiveInt(netQty) ?? undefined,
          secondaryNetQty: parsePositiveInt(secondaryNetQty) ?? undefined,
          kilcikNetQty: parsePositiveInt(kilcikNetQty) ?? undefined,
          useGroupExtraCostDefaults: true,
          reason: 'Maliyet Hesaplama — katalog',
        });
        onSaved(result.message, result.productGroupCode);
        onClose();
        return;
      }

      const result = await createCatalogItem({
        mode,
        productGroupCode: mode === 'NEW_GROUP' ? undefined : productGroup,
        newGroupCode: mode === 'NEW_GROUP' ? newGroupCode.trim().toUpperCase() : undefined,
        newGroupName: mode === 'NEW_GROUP' ? newGroupName.trim() : undefined,
        productCode: mode === 'NEW_SIZE' ? productCode : undefined,
        newProductCode:
          mode === 'NEW_GROUP' || mode === 'NEW_PRODUCT'
            ? newProductCode.trim().toUpperCase()
            : undefined,
        productName:
          mode === 'NEW_GROUP' || mode === 'NEW_PRODUCT'
            ? productName.trim()
            : undefined,
        productUnit,
        widthMm,
        lengthMm,
        recipeItems: copyRecipeFromSizeId
          ? undefined
          : recipeItems.map((item, i) => ({
              ...item,
              sortOrder: i + 1,
              pieceWidthMm: item.pieceWidthMm ?? widthMm,
              pieceLengthMm: item.pieceLengthMm ?? lengthMm,
            })),
        copyRecipeFromSizeId: copyRecipeFromSizeId || undefined,
        extraCosts: extraCosts.length ? extraCosts : undefined,
        materialPriceType,
        reason: 'Maliyet Hesaplama — genel reçete katalog',
      });
      onSaved(result.message, result.productGroupCode);
      onClose();
    } catch (err) {
      setFormError(
        friendlyTechnicalTerms(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Kayıt başarısız.',
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="cc-drawer-overlay" onClick={onClose} role="presentation">
      <aside
        className="cc-drawer cc-catalog-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Yeni ürün / ölçü ekle"
      >
        <div className="cc-drawer-header">
          <h2>Yeni Ürün / Ölçü Ekle</h2>
          <button type="button" className="cc-btn cc-btn-sm" onClick={onClose} disabled={saving}>
            Kapat
          </button>
        </div>

        <p className="cc-hint">
          Adım {stepIndex + 1}/{STEPS.length}: {STEP_LABELS[step]}
        </p>

        <form className="cc-form" onSubmit={(e) => void onSave(e)}>
          {step === 'kind' ? (
            <section className="cc-form-section">
              <h3>Tür</h3>
              <div className="cc-catalog-mode" role="group">
                <button
                  type="button"
                  className={mode === 'NEW_GROUP' ? 'active' : undefined}
                  onClick={() => setMode('NEW_GROUP')}
                >
                  Yeni Ürün Grubu
                </button>
                <button
                  type="button"
                  className={mode === 'NEW_PRODUCT' ? 'active' : undefined}
                  onClick={() => setMode('NEW_PRODUCT')}
                >
                  Yeni Ürün
                </button>
                <button
                  type="button"
                  className={mode === 'NEW_SIZE' ? 'active' : undefined}
                  onClick={() => setMode('NEW_SIZE')}
                >
                  Mevcut Ürüne Yeni Ölçü
                </button>
              </div>
              <p className="cc-hint">
                Yeni gruplar Genel Reçete motoru ile hesaplanır. Kapı Kasası /
                Pervaz / Süpürgelik / Çıta özel motor kalır.
              </p>
            </section>
          ) : null}

          {step === 'basics' ? (
            <section className="cc-form-section">
              <h3>Temel Bilgiler</h3>
              {mode === 'NEW_GROUP' ? (
                <>
                  <label className="cc-field">
                    <span>Grup kodu</span>
                    <input
                      className="cc-input"
                      value={newGroupCode}
                      onChange={(e) => setNewGroupCode(e.target.value)}
                      placeholder="MUTFAK_PROFILLERI"
                    />
                  </label>
                  <label className="cc-field">
                    <span>Grup adı</span>
                    <input
                      className="cc-input"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Mutfak Profilleri"
                    />
                  </label>
                </>
              ) : (
                <label className="cc-field">
                  <span>Ürün grubu</span>
                  <select
                    className="cc-select"
                    value={productGroup}
                    onChange={(e) => {
                      setProductGroup(e.target.value);
                      const opts = SPECIAL_PRODUCTS[e.target.value];
                      if (opts?.[0]) setProductCode(opts[0].code);
                    }}
                  >
                    {groups
                      .filter((g) => g.code !== 'KAPI_IMALATI')
                      .map((g) => (
                        <option key={g.code} value={g.code}>
                          {g.name} ({calculatorTypeLabel(g.calculatorType)})
                        </option>
                      ))}
                  </select>
                </label>
              )}

              {mode === 'NEW_SIZE' ? (
                <label className="cc-field">
                  <span>Ürün</span>
                  <select
                    className="cc-select"
                    value={productCode}
                    onChange={(e) => setProductCode(e.target.value)}
                  >
                    {productOptions.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="cc-field">
                    <span>Ürün kodu</span>
                    <input
                      className="cc-input"
                      value={newProductCode}
                      onChange={(e) => setNewProductCode(e.target.value)}
                    />
                  </label>
                  <label className="cc-field">
                    <span>Ürün adı</span>
                    <input
                      className="cc-input"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                    />
                  </label>
                  {!isSpecial ? (
                    <label className="cc-field">
                      <span>Birim</span>
                      <select
                        className="cc-select"
                        value={productUnit}
                        onChange={(e) =>
                          setProductUnit(e.target.value as typeof productUnit)
                        }
                      >
                        <option value="ADET">adet</option>
                        <option value="BOY">boy</option>
                        <option value="METRE">metre</option>
                        <option value="M2">m²</option>
                      </select>
                    </label>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          {step === 'size' ? (
            <section className="cc-form-section">
              <h3>Ölçü (cm)</h3>
              <div className="cc-catalog-size-row">
                <label className="cc-field">
                  <span>En</span>
                  <input className="cc-input" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
                </label>
                <label className="cc-field">
                  <span>Boy</span>
                  <input className="cc-input" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
                </label>
              </div>
              {widthMm != null && lengthMm != null ? (
                <p className="cc-hint">
                  Canonical: {widthMm} × {lengthMm} mm (
                  {formatPieceSizeCm(widthMm, lengthMm)})
                </p>
              ) : null}
              {!isSpecial && mode === 'NEW_SIZE' && copySizeOptions.length > 0 ? (
                <label className="cc-field">
                  <span>Mevcut ölçünün reçetesini kopyala (opsiyonel)</span>
                  <select
                    className="cc-select"
                    value={copyRecipeFromSizeId}
                    onChange={(e) => setCopyRecipeFromSizeId(e.target.value)}
                  >
                    <option value="">Kopyalama — yeni reçete girilecek</option>
                    {copySizeOptions.map((row) => (
                      <option key={row.sizeId} value={row.sizeId}>
                        {row.displayName} ({row.widthMm}×{row.lengthMm} mm)
                      </option>
                    ))}
                  </select>
                  <span className="cc-hint">
                    Kopya bağımsız reçete oluşturur; kaynak ölçü değişmez.
                  </span>
                </label>
              ) : null}
            </section>
          ) : null}

          {step === 'recipe' && !isSpecial && !copyRecipeFromSizeId ? (
            <section className="cc-form-section">
              <h3>Ham Madde / Reçete</h3>
              {materials.length === 0 ? (
                <div>
                  <p className="cc-error">Aktif ham madde yok.</p>
                  {onNavigateRawMaterials ? (
                    <button type="button" className="cc-btn cc-btn-sm" onClick={onNavigateRawMaterials}>
                      Ham Maddeler
                    </button>
                  ) : null}
                </div>
              ) : (
                recipeItems.map((item, index) => (
                  <div key={index} className="cc-form-section">
                    <label className="cc-field">
                      <span>Ham madde</span>
                      <select
                        className="cc-select"
                        value={item.rawMaterialId}
                        onChange={(e) => {
                          const next = [...recipeItems];
                          next[index] = { ...item, rawMaterialId: e.target.value };
                          setRecipeItems(next);
                        }}
                      >
                        <option value="">Seçin…</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {formatRawMaterialOptionLabel(m)} — {m.code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="cc-field">
                      <span>Hesap modu</span>
                      <select
                        className="cc-select"
                        value={item.calculationMode}
                        onChange={(e) => {
                          const next = [...recipeItems];
                          next[index] = {
                            ...item,
                            calculationMode: e.target.value as RecipeCalculationMode,
                          };
                          setRecipeItems(next);
                        }}
                      >
                        {CALC_MODES.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="cc-field">
                      <span>Miktar</span>
                      <input
                        className="cc-input"
                        value={item.quantity}
                        onChange={(e) => {
                          const next = [...recipeItems];
                          next[index] = { ...item, quantity: e.target.value };
                          setRecipeItems(next);
                        }}
                      />
                    </label>
                  </div>
                ))
              )}
              <button
                type="button"
                className="cc-btn cc-btn-sm"
                onClick={() =>
                  setRecipeItems([
                    ...recipeItems,
                    {
                      rawMaterialId: '',
                      calculationMode: 'PER_SHEET_YIELD',
                      quantity: '1',
                      sortOrder: recipeItems.length + 1,
                    },
                  ])
                }
              >
                + Reçete satırı
              </button>
            </section>
          ) : null}

          {step === 'net' && !isSpecial && !copyRecipeFromSizeId ? (
            <section className="cc-form-section">
              <h3>NET</h3>
              <p className="cc-hint">
                {recipeCalculationModeLabel('PER_SHEET_YIELD')} satırları için
                NET girin. Tahmin yapılmaz.
              </p>
              {recipeItems.map((item, index) =>
                item.calculationMode === 'PER_SHEET_YIELD' ? (
                  <label key={index} className="cc-field">
                    <span>Satır {index + 1} NET</span>
                    <input
                      className="cc-input"
                      value={item.newNetQty?.toString() ?? ''}
                      onChange={(e) => {
                        const n = parsePositiveInt(e.target.value);
                        const next = [...recipeItems];
                        next[index] = { ...item, newNetQty: n ?? undefined };
                        setRecipeItems(next);
                      }}
                    />
                  </label>
                ) : null,
              )}
            </section>
          ) : null}

          {step === 'extras' && !isSpecial ? (
            <section className="cc-form-section">
              <h3>Ek Maliyetler</h3>
              <p className="cc-hint">Mevcut tiplerden seçin; yeni global tip üretilmez.</p>
              {STANDARD_EXTRA_COST_TYPE_CODES.map((code) => {
                const existing = extraCosts.find((e) => e.typeCode === code);
                return (
                  <label key={code} className="cc-field">
                    <span>
                      {extraCostTypeLabel(code)} (ürüne özel TL, boş = yok)
                    </span>
                    <input
                      className="cc-input"
                      value={existing?.amount ?? ''}
                      onChange={(e) => {
                        const amount = e.target.value.trim();
                        const rest = extraCosts.filter((x) => x.typeCode !== code);
                        if (!amount) {
                          setExtraCosts(rest);
                          return;
                        }
                        setExtraCosts([
                          ...rest,
                          {
                            typeCode: code,
                            amount,
                            calculationMode: 'FIXED',
                            scope: 'PRODUCT',
                          },
                        ]);
                      }}
                    />
                  </label>
                );
              })}
              {extraTypes.length ? (
                <p className="cc-hint">
                  Mevcut ek maliyet türleri:{' '}
                  {extraTypes
                    .map((t) => extraCostTypeLabel(t.typeCode))
                    .join(', ')}
                </p>
              ) : null}
            </section>
          ) : null}

          {step === 'recipe' && isSpecial ? null : null}

          {isSpecial && step === 'size' ? (
            <section className="cc-form-section">
              <h3>Özel motor alanları</h3>
              <label className="cc-field">
                <span>Ham madde</span>
                <select
                  className="cc-select"
                  value={rawMaterialId}
                  onChange={(e) => setRawMaterialId(e.target.value)}
                >
                  <option value="">Seçin…</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {formatRawMaterialOptionLabel(m)} — {m.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cc-field">
                <span>NET</span>
                <input className="cc-input" value={netQty} onChange={(e) => setNetQty(e.target.value)} />
              </label>
              {productGroup === 'door_frame' ? (
                <label className="cc-field">
                  <span>İkinci NET</span>
                  <input
                    className="cc-input"
                    value={secondaryNetQty}
                    onChange={(e) => setSecondaryNetQty(e.target.value)}
                  />
                </label>
              ) : null}
              {productGroup === 'PERVAZ' ? (
                <label className="cc-field">
                  <span>Kılçık NET</span>
                  <input
                    className="cc-input"
                    value={kilcikNetQty}
                    onChange={(e) => setKilcikNetQty(e.target.value)}
                  />
                </label>
              ) : null}
            </section>
          ) : null}

          {step === 'preview' || step === 'save' ? (
            <section className="cc-form-section cc-catalog-preview">
              <h3>Önizleme</h3>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>
                {previewText ?? 'Önizleme için “Önizleme hesapla”ya basın.'}
              </pre>
            </section>
          ) : null}

          {formError ? <p className="cc-error">{formError}</p> : null}

          <div className="cc-drawer-actions">
            {stepIndex > 0 ? (
              <button type="button" className="cc-btn" onClick={goBack} disabled={saving}>
                Geri
              </button>
            ) : null}
            {step !== 'preview' && step !== 'save' ? (
              <button
                type="button"
                className="cc-btn cc-btn-primary"
                onClick={() => {
                  if (STEPS[stepIndex + 1] === 'preview') {
                    void runPreview();
                  } else {
                    goNext();
                  }
                }}
              >
                İleri
              </button>
            ) : (
              <>
                <button type="button" className="cc-btn" onClick={() => void runPreview()} disabled={saving}>
                  Önizleme hesapla
                </button>
                <button type="submit" className="cc-btn cc-btn-primary" disabled={saving}>
                  {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </>
            )}
          </div>
        </form>
      </aside>
    </div>
  );
}
