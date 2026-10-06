import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AyarliPervazMdfResponse,
  DekoratifGenisKilcikResponse,
  DekoratifPervazResponse,
  DoorFrameMdfResponse,
  DoorFrameMdfRow,
  fetchAyarliPervazMdfCosts,
  fetchDekoratifGenisKilcikCosts,
  fetchDekoratifPervazCosts,
  fetchDoorFrameMdfCosts,
} from '../api/cost-calculation-api';
import { listExtraCosts, updateExtraCostValue } from '../api/extra-costs-api';
import {
  AyarliPervazPricingSetting,
  ProductPricingSetting,
  getDoorFramePricingSetting,
  getPervazPricingSetting,
  updateDoorFramePricingSetting,
  updateGroupCardMarkupRate,
  updatePervazPricingSetting,
} from '../api/pricing-settings-api';
import {
  DekoratifPervazPremiumItem,
  DekoratifPervazPremiumProductCode,
  listDekoratifPervazPremiums,
  updateDekoratifPervazPremium,
} from '../api/dekoratif-pervaz-premiums-api';
import { ApiError } from '../lib/api';
import { formatPieceSizeCm } from '../lib/length';
import {
  friendlyMaterialPriceError,
  materialPriceTypeLabel,
  showsCardSalePrice,
  showsCashSalePrice,
  type MaterialPriceType,
} from '../lib/material-price-type';
import { formatPercentRate, formatTry } from '../lib/money';
import { CitaCostList } from '../components/cita-cost-list';
import { CatalogItemDrawer } from '../components/catalog-item-drawer';
import { ProfitRateCell } from '../components/profit-rate-cell';
import { GenericProductCostTable } from '../components/generic-product-cost-table';
import { PervazCostTable } from '../components/pervaz-cost-table';
import { SupurgelikCostList } from '../components/supurgelik-cost-list';
import {
  deactivateDoorFrameCashOverride,
  upsertDoorFrameCashOverride,
} from '../api/price-overrides-api';
import {
  listProductGroups,
  type ProductGroupSummary,
} from '../api/product-groups-api';
import { extraCostTypeLabel } from '../lib/display-labels';
import './cost-calculation-page.css';

const SPECIAL_COST_GROUPS = new Set([
  'door_frame',
  'PERVAZ',
  'SUPURGELIK',
  'CITA',
]);

type ProductGroup = string;
type DoorFrameVariant = '34_MM' | '30_MM';
type PervazProduct =
  | 'AYARLI_PERVAZ'
  | 'DEKORATIF_PERVAZ'
  | 'DEKORATIF_PERVAZ_GENIS_KILCIK';

type ExtraForm = {
  CUTTING: string;
  GLUE: string;
  LABOR: string;
  OTHER: string;
};

type PricingForm = {
  vatRate: string;
  profitRate: string;
  cardMarkupRate: string;
  cardFixedSurchargeAmount: string;
};

const EXTRA_LABELS: Record<keyof ExtraForm, string> = {
  CUTTING: extraCostTypeLabel('CUTTING'),
  GLUE: extraCostTypeLabel('GLUE'),
  LABOR: extraCostTypeLabel('LABOR'),
  OTHER: extraCostTypeLabel('OTHER'),
};

const EXTRA_ORDER: Array<keyof ExtraForm> = ['CUTTING', 'GLUE', 'LABOR', 'OTHER'];
const PERVAZ_EXTRA_ORDER: Array<keyof ExtraForm> = ['CUTTING', 'GLUE', 'LABOR'];

const PERVAZ_PRODUCT_META: Record<
  PervazProduct,
  { label: string; description: string }
> = {
  AYARLI_PERVAZ: {
    label: 'Ayarlı Pervaz',
    description: 'Standart ayarlı seri',
  },
  DEKORATIF_PERVAZ: {
    label: 'Dekoratif Pervaz',
    description: 'Dekoratif fiyat farkı',
  },
  DEKORATIF_PERVAZ_GENIS_KILCIK: {
    label: 'Geniş Kılçık',
    description: 'Kartsız özel seri',
  },
};

const PERVAZ_PRODUCTS = Object.keys(PERVAZ_PRODUCT_META) as PervazProduct[];

function todayIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDecimalInput(value: string): string {
  return value.trim().replace(',', '.');
}

function isValidDecimal(value: string): boolean {
  return /^\d+(\.\d{1,4})?$/.test(value);
}

function amountsEqual(a: string, b: string): boolean {
  const na = normalizeDecimalInput(a);
  const nb = normalizeDecimalInput(b);
  if (!isValidDecimal(na) || !isValidDecimal(nb)) return false;
  // string karşılaştırma için trailing zero farkını basitçe ele al
  const strip = (v: string) => v.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return strip(na) === strip(nb);
}

function optionalAmountsEqual(a: string, b: string): boolean {
  const na = normalizeDecimalInput(a);
  const nb = normalizeDecimalInput(b);
  if (na === '' && nb === '') return true;
  return amountsEqual(a, b);
}

function partByThickness(row: DoorFrameMdfRow, thickness: string) {
  return row.parts.find((p) => p.thicknessMm === thickness || p.thicknessMm === `${thickness}.0`);
}

function emptyExtraForm(): ExtraForm {
  return { CUTTING: '', GLUE: '', LABOR: '', OTHER: '' };
}

export function CostCalculationPage({
  initialProductGroup = 'door_frame',
  initialSettingsOpen = false,
  materialPriceType,
  onMaterialPriceTypeChange,
  onOpenPriceList,
}: {
  initialProductGroup?: ProductGroup;
  initialSettingsOpen?: boolean;
  materialPriceType: MaterialPriceType;
  onMaterialPriceTypeChange: (value: MaterialPriceType) => void;
  onOpenPriceList?: () => void;
}) {
  const [productGroup, setProductGroup] =
    useState<ProductGroup>(initialProductGroup);
  const [groupTabs, setGroupTabs] = useState<ProductGroupSummary[]>([]);
  const [variant, setVariant] = useState<DoorFrameVariant>('34_MM');
  const [pervazProduct, setPervazProduct] =
    useState<PervazProduct>('AYARLI_PERVAZ');
  const [pervazQuery, setPervazQuery] = useState('');
  const [pervazThickness, setPervazThickness] = useState('ALL');
  const [data, setData] = useState<DoorFrameMdfResponse | null>(null);
  const [pervazData, setPervazData] =
    useState<
      | AyarliPervazMdfResponse
      | DekoratifPervazResponse
      | DekoratifGenisKilcikResponse
      | null
    >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [catalogDrawerOpen, setCatalogDrawerOpen] = useState(false);
  const [catalogRefreshToken, setCatalogRefreshToken] = useState(0);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [extraBaseline, setExtraBaseline] = useState<ExtraForm>(emptyExtraForm());
  const [extraForm, setExtraForm] = useState<ExtraForm>(emptyExtraForm());
  const [pricingBaseline, setPricingBaseline] = useState<PricingForm>({
    vatRate: '',
    profitRate: '',
    cardMarkupRate: '',
    cardFixedSurchargeAmount: '',
  });
  const [pricingForm, setPricingForm] = useState<PricingForm>({
    vatRate: '',
    profitRate: '',
    cardMarkupRate: '',
    cardFixedSurchargeAmount: '',
  });
  const [pricingMeta, setPricingMeta] = useState<
    ProductPricingSetting | AyarliPervazPricingSetting | null
  >(null);
  const [productCardMarkupRate, setProductCardMarkupRate] = useState<string | null>(
    null,
  );

  const [priceEditRow, setPriceEditRow] = useState<DoorFrameMdfRow | null>(null);
  const [priceEditCash, setPriceEditCash] = useState('');
  const [priceEditReason, setPriceEditReason] = useState('');
  const [priceEditSaving, setPriceEditSaving] = useState(false);
  const [priceEditError, setPriceEditError] = useState<string | null>(null);
  const [dekoratifPremiums, setDekoratifPremiums] = useState<
    DekoratifPervazPremiumItem[]
  >([]);
  const [dekoratifPremiumsError, setDekoratifPremiumsError] = useState<
    string | null
  >(null);
  const [editingPremiumKey, setEditingPremiumKey] = useState<string | null>(
    null,
  );
  const [premiumRateInput, setPremiumRateInput] = useState('');
  const [premiumSaving, setPremiumSaving] = useState(false);

  const thicknesses = useMemo(
    () => (variant === '34_MM' ? (['22', '12'] as const) : (['18', '12'] as const)),
    [variant],
  );
  const activeExtraOrder =
    productGroup === 'PERVAZ' ? PERVAZ_EXTRA_ORDER : EXTRA_ORDER;
  const pervazProductLabel = PERVAZ_PRODUCT_META[pervazProduct].label;
  const canEditPervazCardRate =
    productGroup === 'PERVAZ' &&
    (pervazProduct === 'AYARLI_PERVAZ' || pervazProduct === 'DEKORATIF_PERVAZ');
  const canEditPervazDecorativePremium =
    productGroup === 'PERVAZ' &&
    (pervazProduct === 'DEKORATIF_PERVAZ' ||
      pervazProduct === 'DEKORATIF_PERVAZ_GENIS_KILCIK');

  const pervazThicknesses = useMemo(
    () =>
      Array.from(new Set((pervazData?.rows ?? []).map((row) => row.thicknessMm))).sort(
        (a, b) => a - b,
      ),
    [pervazData],
  );

  const filteredPervazRows = useMemo(() => {
    const normalizedQuery = pervazQuery
      .toLocaleLowerCase('tr-TR')
      .replace(/[×x\s-]/g, '');

    return (pervazData?.rows ?? []).filter((row) => {
      if (
        pervazThickness !== 'ALL' &&
        String(row.thicknessMm) !== pervazThickness
      ) {
        return false;
      }
      if (!normalizedQuery) return true;

      const searchable = [
        `${row.widthMm / 10}x${row.lengthMm / 10}`,
        `${row.thicknessMm}mm`,
        row.mainPiece.rawMaterialCode,
      ]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .replace(/[×x\s-]/g, '');
      return searchable.includes(normalizedQuery);
    });
  }, [pervazData, pervazQuery, pervazThickness]);

  const pervazCardRowCount = useMemo(
    () =>
      (pervazData?.rows ?? []).filter((row) => row.pricing.cardSaleAvailable)
        .length,
    [pervazData],
  );

  const reloadCosts = async (targetVariant: DoorFrameVariant = variant) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchDoorFrameMdfCosts(
        targetVariant,
        materialPriceType,
      );
      setData(response);
    } catch (err) {
      setData(null);
      setError(
        friendlyMaterialPriceError(
          err instanceof ApiError ? err.message : 'MDF maliyeti yüklenemedi.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const reloadPervazCosts = async () => {
    setLoading(true);
    setError(null);
    try {
      setPervazData(
        pervazProduct === 'AYARLI_PERVAZ'
          ? await fetchAyarliPervazMdfCosts(materialPriceType)
          : pervazProduct === 'DEKORATIF_PERVAZ'
            ? await fetchDekoratifPervazCosts(materialPriceType)
            : await fetchDekoratifGenisKilcikCosts(materialPriceType),
      );
    } catch (err) {
      setPervazData(null);
      setError(
        friendlyMaterialPriceError(
          err instanceof ApiError
            ? err.message
            : 'Pervaz maliyetleri yüklenemedi.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (productGroup !== 'door_frame') return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    void fetchDoorFrameMdfCosts(variant, materialPriceType)
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(
            friendlyMaterialPriceError(
              err instanceof ApiError ? err.message : 'MDF maliyeti yüklenemedi.',
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productGroup, variant, materialPriceType, catalogRefreshToken]);

  useEffect(() => {
    if (productGroup !== 'PERVAZ') return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPervazData(null);
    const request =
      pervazProduct === 'AYARLI_PERVAZ'
        ? fetchAyarliPervazMdfCosts(materialPriceType)
        : pervazProduct === 'DEKORATIF_PERVAZ'
          ? fetchDekoratifPervazCosts(materialPriceType)
          : fetchDekoratifGenisKilcikCosts(materialPriceType);
    void request
      .then((response) => {
        if (!cancelled) setPervazData(response);
      })
      .catch((err) => {
        if (!cancelled) {
          setPervazData(null);
          setError(
            friendlyMaterialPriceError(
              err instanceof ApiError
                ? err.message
                : 'Pervaz maliyetleri yüklenemedi.',
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productGroup, pervazProduct, materialPriceType, catalogRefreshToken]);

  useEffect(() => {
    setPervazQuery('');
    setPervazThickness('ALL');
  }, [pervazProduct]);

  useEffect(() => {
    if (!initialSettingsOpen) return;
    if (productGroup !== 'door_frame' && productGroup !== 'PERVAZ') return;
    void loadSettingsIntoDrawer();
    // Sayfa bu grup için yeniden açıldığında bir kez doldurulur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    let cancelled = false;
    void listProductGroups()
      .then((res) => {
        if (cancelled) return;
        const items = res.items.filter((g) => g.code !== 'KAPI_IMALATI');
        setGroupTabs(items);
        if (!items.some((g) => g.code === productGroup) && items[0]) {
          setProductGroup(items[0].code);
        }
      })
      .catch(() => {
        if (!cancelled) setGroupTabs([]);
      });
    return () => {
      cancelled = true;
    };
    // yalnız mount / kayıt sonrası
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogRefreshToken]);

  const loadSettingsIntoDrawer = async () => {
    setSettingsLoading(true);
    setFormError(null);
    setDekoratifPremiumsError(null);
    setEditingPremiumKey(null);
    setPremiumRateInput('');
    try {
      const [extras, pricing, premiums] =
        productGroup === 'PERVAZ'
          ? await Promise.all([
              listExtraCosts('PERVAZ'),
              getPervazPricingSetting(pervazProduct),
              canEditPervazDecorativePremium
                ? listDekoratifPervazPremiums(
                    pervazProduct as DekoratifPervazPremiumProductCode,
                  )
                : Promise.resolve(null),
            ])
          : await Promise.all([
              listExtraCosts('door_frame'),
              getDoorFramePricingSetting(variant),
              Promise.resolve(null),
            ]);

      const nextExtra: ExtraForm = emptyExtraForm();
      for (const code of activeExtraOrder) {
        const item = extras.items.find((i) => i.typeCode === code);
        nextExtra[code] = item?.amount ?? '';
      }
      setExtraBaseline(nextExtra);
      setExtraForm(nextExtra);

      const nextPricing = {
        vatRate: pricing.vatRate ?? '',
        profitRate: pricing.profitRate,
        cardMarkupRate:
          'groupCardMarkupRate' in pricing
            ? (pricing.groupCardMarkupRate ?? '')
            : (pricing.cardMarkupRate ?? ''),
        cardFixedSurchargeAmount:
          productGroup === 'PERVAZ' &&
          'cardFixedSurchargeAmount' in pricing &&
          pricing.cardFixedSurchargeAmount != null
            ? pricing.cardFixedSurchargeAmount
            : '',
      };
      setPricingBaseline(nextPricing);
      setPricingForm(nextPricing);
      setPricingMeta(pricing);
      setProductCardMarkupRate(
        'productCardMarkupRate' in pricing ? pricing.productCardMarkupRate : null,
      );
      setDekoratifPremiums(premiums?.items ?? []);
      setDrawerOpen(true);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Maliyet ayarları yüklenemedi.',
      );
      setDrawerOpen(true);
    } finally {
      setSettingsLoading(false);
    }
  };

  const premiumKey = (item: {
    thicknessMm: number;
    widthMm: number;
    lengthMm: number;
  }) => `${item.thicknessMm}-${item.widthMm}-${item.lengthMm}`;

  const saveDekoratifPremium = async (item: DekoratifPervazPremiumItem) => {
    if (!canEditPervazDecorativePremium) return;
    const rate = normalizeDecimalInput(premiumRateInput);
    if (!isValidDecimal(rate)) {
      setDekoratifPremiumsError(
        'Dekoratif fark oranı 0 veya daha büyük geçerli bir değer olmalıdır (örn. 50).',
      );
      return;
    }

    setPremiumSaving(true);
    setDekoratifPremiumsError(null);
    try {
      const result = await updateDekoratifPervazPremium(
        pervazProduct as DekoratifPervazPremiumProductCode,
        {
          thicknessMm: item.thicknessMm,
          widthMm: item.widthMm,
          lengthMm: item.lengthMm,
          rate,
        },
      );
      setDekoratifPremiums(result.items);
      setEditingPremiumKey(null);
      setPremiumRateInput('');
      setNotice('Dekoratif fark kaydedildi. Tablo güncelleniyor…');
      await reloadPervazCosts();
      setNotice('Dekoratif fark uygulandı.');
    } catch (err) {
      setDekoratifPremiumsError(
        err instanceof ApiError
          ? err.message
          : 'Dekoratif fark kaydedilemedi.',
      );
    } finally {
      setPremiumSaving(false);
    }
  };

  const closeDrawer = () => {
    if (saving) return;
    setDrawerOpen(false);
    setFormError(null);
  };

  const openPriceEdit = (row: DoorFrameMdfRow) => {
    setPriceEditRow(row);
    setPriceEditCash(row.pricing.publishedCashPrice);
    setPriceEditReason(row.pricing.cashOverride?.reason ?? '');
    setPriceEditError(null);
  };

  const closePriceEdit = () => {
    if (priceEditSaving) return;
    setPriceEditRow(null);
    setPriceEditError(null);
  };

  const onSavePriceOverride = async (event: FormEvent) => {
    event.preventDefault();
    if (!priceEditRow) return;
    const cash = normalizeDecimalInput(priceEditCash);
    if (!isValidDecimal(cash) || /^0+(\.0+)?$/.test(cash)) {
      setPriceEditError('Yayınlanan nakit fiyatı 0\'dan büyük bir tutar olmalıdır (örn. 300).');
      return;
    }
    setPriceEditSaving(true);
    setPriceEditError(null);
    try {
      await upsertDoorFrameCashOverride(variant, priceEditRow.widthCm, priceEditRow.lengthCm, {
        productGroup: 'door_frame',
        cashPrice: cash,
        reason: priceEditReason.trim() || undefined,
      });
      setPriceEditRow(null);
      setNotice('Nakit fiyat kaydedildi. Tablo güncelleniyor…');
      await reloadCosts(variant);
      setNotice('Yayınlanan nakit fiyatı uygulandı.');
    } catch (err) {
      setPriceEditError(err instanceof ApiError ? err.message : 'Nakit fiyat kaydedilemedi.');
    } finally {
      setPriceEditSaving(false);
    }
  };

  const onUseFormulaPrice = async () => {
    if (!priceEditRow) return;
    setPriceEditSaving(true);
    setPriceEditError(null);
    try {
      await deactivateDoorFrameCashOverride(
        variant,
        priceEditRow.widthCm,
        priceEditRow.lengthCm,
      );
      setPriceEditRow(null);
      setNotice('Özel nakit fiyat kaldırıldı. Hesaplanan fiyat kullanılıyor…');
      await reloadCosts(variant);
      setNotice('Hesaplanan nakit fiyatı uygulandı.');
    } catch (err) {
      setPriceEditError(
        err instanceof ApiError ? err.message : 'Özel nakit fiyat kaldırılamadı.',
      );
    } finally {
      setPriceEditSaving(false);
    }
  };

  const pendingChanges = useMemo(() => {
    const changes: Array<{ label: string; from: string; to: string }> = [];
    for (const code of activeExtraOrder) {
      if (!amountsEqual(extraForm[code], extraBaseline[code])) {
        changes.push({
          label: EXTRA_LABELS[code],
          from: formatTry(normalizeDecimalInput(extraBaseline[code])),
          to: formatTry(normalizeDecimalInput(extraForm[code])),
        });
      }
    }
    if (
      productGroup === 'door_frame' &&
      !amountsEqual(pricingForm.vatRate, pricingBaseline.vatRate)
    ) {
      changes.push({
        label: 'KDV Oranı',
        from: formatPercentRate(normalizeDecimalInput(pricingBaseline.vatRate)),
        to: formatPercentRate(normalizeDecimalInput(pricingForm.vatRate)),
      });
    }
    if (!amountsEqual(pricingForm.profitRate, pricingBaseline.profitRate)) {
      changes.push({
        label: 'Kâr Oranı',
        from: formatPercentRate(normalizeDecimalInput(pricingBaseline.profitRate)),
        to: formatPercentRate(normalizeDecimalInput(pricingForm.profitRate)),
      });
    }
    if (
      (productGroup === 'door_frame' || canEditPervazCardRate) &&
      !optionalAmountsEqual(pricingForm.cardMarkupRate, pricingBaseline.cardMarkupRate)
    ) {
      changes.push({
        label: 'Kart / Taksit Farkı',
        from: pricingBaseline.cardMarkupRate
          ? formatPercentRate(normalizeDecimalInput(pricingBaseline.cardMarkupRate))
          : '—',
        to: formatPercentRate(normalizeDecimalInput(pricingForm.cardMarkupRate)),
      });
    }
    return changes;
  }, [
    activeExtraOrder,
    extraForm,
    extraBaseline,
    pricingForm,
    pricingBaseline,
    productGroup,
    canEditPervazCardRate,
  ]);

  const onSaveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (productGroup === 'SUPURGELIK') return;

    for (const code of activeExtraOrder) {
      const amount = normalizeDecimalInput(extraForm[code]);
      if (!isValidDecimal(amount)) {
        setFormError(`${EXTRA_LABELS[code]} geçerli bir tutar olmalıdır (örn. 17.00).`);
        return;
      }
    }
    const profit = normalizeDecimalInput(pricingForm.profitRate);
    if (!isValidDecimal(profit)) {
      setFormError('Kâr oranı geçerli olmalıdır (örn. 20).');
      return;
    }
    const vat = normalizeDecimalInput(pricingForm.vatRate);
    const card = normalizeDecimalInput(pricingForm.cardMarkupRate);
    const cardChanged = !optionalAmountsEqual(
      pricingForm.cardMarkupRate,
      pricingBaseline.cardMarkupRate,
    );
    if (productGroup === 'door_frame' || canEditPervazCardRate) {
      if (productGroup === 'door_frame' && !isValidDecimal(vat)) {
        setFormError('KDV oranı geçerli olmalıdır (örn. 0 veya 10).');
        return;
      }
      if (cardChanged && !isValidDecimal(card)) {
        setFormError('Kart / taksit farkı geçerli olmalıdır (örn. 20 veya 0).');
        return;
      }
    }
    if (pendingChanges.length === 0) {
      setFormError('Değişiklik yok.');
      return;
    }

    setSaving(true);
    try {
      const effectiveFrom = todayIsoDate();
      for (const code of activeExtraOrder) {
        if (amountsEqual(extraForm[code], extraBaseline[code])) continue;
        await updateExtraCostValue(code, {
          productGroup: productGroup as 'door_frame' | 'PERVAZ',
          amount: normalizeDecimalInput(extraForm[code]),
          effectiveFrom,
        });
      }

      if (productGroup === 'PERVAZ') {
        const profitChanged = !amountsEqual(
          pricingForm.profitRate,
          pricingBaseline.profitRate,
        );
        const cardRateChanged =
          canEditPervazCardRate &&
          !optionalAmountsEqual(
            pricingForm.cardMarkupRate,
            pricingBaseline.cardMarkupRate,
          );
        if (profitChanged || cardRateChanged) {
          await updatePervazPricingSetting(
            pervazProduct,
            profit,
            cardRateChanged ? card : undefined,
          );
        }
      } else {
        const vatChanged = !amountsEqual(pricingForm.vatRate, pricingBaseline.vatRate);
        const profitChanged = !amountsEqual(
          pricingForm.profitRate,
          pricingBaseline.profitRate,
        );
        if (cardChanged) {
          await updateGroupCardMarkupRate('door_frame', card);
        }
        if (vatChanged || profitChanged) {
          await updateDoorFramePricingSetting(variant, {
            productGroup: 'door_frame',
            vatRate: vat,
            profitRate: profit,
          });
        }
      }

      setDrawerOpen(false);
      setNotice('Maliyet ayarları kaydedildi. Tablo güncelleniyor…');
      if (productGroup === 'PERVAZ') {
        await reloadPervazCosts();
      } else {
        await reloadCosts(variant);
      }
      setNotice('Maliyet ayarları uygulandı.');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Ayarlar kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="cc-page">
      <div className="cc-toolbar">
        <label className="cc-field">
          <span>Ürün Grubu</span>
          <select
            className="cc-select"
            value={productGroup}
            onChange={(e) => setProductGroup(e.target.value as ProductGroup)}
          >
            {(groupTabs.length
              ? groupTabs
              : [
                  { code: 'door_frame', name: 'Kapı Kasası' },
                  { code: 'PERVAZ', name: 'Pervaz' },
                  { code: 'SUPURGELIK', name: 'Süpürgelik' },
                  { code: 'CITA', name: 'Çıta' },
                ]
            ).map((g) => (
              <option key={g.code} value={g.code}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <div className="cc-price-type" role="group" aria-label="MDF alış fiyatı">
          <span>MDF Alış Fiyatı</span>
          <div className="cc-price-type-options">
            <button
              type="button"
              className={materialPriceType === 'CASH' ? 'active' : undefined}
              aria-pressed={materialPriceType === 'CASH'}
              onClick={() => onMaterialPriceTypeChange('CASH')}
            >
              Nakit (Peşin Alış)
            </button>
            <button
              type="button"
              className={
                materialPriceType === 'CARD_INSTALLMENT' ? 'active' : undefined
              }
              aria-pressed={materialPriceType === 'CARD_INSTALLMENT'}
              onClick={() => onMaterialPriceTypeChange('CARD_INSTALLMENT')}
            >
              Kart / Taksitli Alış
            </button>
          </div>
        </div>

        <div className="cc-toolbar-actions">
          <button
            type="button"
            className="cc-btn cc-btn-primary"
            onClick={() => setCatalogDrawerOpen(true)}
            disabled={loading}
          >
            + Yeni Ürün / Ölçü Ekle
          </button>
          {onOpenPriceList ? (
            <button
              type="button"
              className="cc-btn"
              onClick={onOpenPriceList}
            >
              Fiyat Listesi Oluştur
            </button>
          ) : null}
          {productGroup === 'door_frame' || productGroup === 'PERVAZ' ? (
            <button
              type="button"
              className="cc-btn"
              onClick={() => void loadSettingsIntoDrawer()}
              disabled={settingsLoading || loading}
            >
              {settingsLoading ? 'Yükleniyor…' : 'Maliyet Ayarlarını Düzenle'}
            </button>
          ) : null}
        </div>
      </div>

      {productGroup === 'PERVAZ' ? (
        <div
          className="cc-pervaz-product-tabs"
          role="tablist"
          aria-label="Pervaz ürünü"
        >
          {PERVAZ_PRODUCTS.map((productCode) => {
            const meta = PERVAZ_PRODUCT_META[productCode];
            const active = pervazProduct === productCode;
            return (
              <button
                key={productCode}
                type="button"
                role="tab"
                aria-selected={active}
                className={
                  active
                    ? 'cc-pervaz-product-tab active'
                    : 'cc-pervaz-product-tab'
                }
                onClick={() => setPervazProduct(productCode)}
              >
                <span>{meta.label}</span>
                <small>{meta.description}</small>
              </button>
            );
          })}
        </div>
      ) : null}

      {productGroup === 'door_frame' ? (
        <>
          <div className="cc-segments" role="tablist" aria-label="Kapı kasası tipi">
            <button
              type="button"
              role="tab"
              aria-selected={variant === '34_MM'}
              className={variant === '34_MM' ? 'cc-segment active' : 'cc-segment'}
              onClick={() => setVariant('34_MM')}
            >
              34 MM MDF KASA
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={variant === '30_MM'}
              className={variant === '30_MM' ? 'cc-segment active' : 'cc-segment'}
              onClick={() => setVariant('30_MM')}
            >
              30 MM MDF KASA
            </button>
          </div>

          <p className="cc-note">
            Seçili MDF alış türü: {materialPriceTypeLabel(materialPriceType)}. İki
            parça da bu türden hesaplanır.
          </p>
          {notice ? <div className="cc-notice">{notice}</div> : null}
          {error ? <div className="cc-alert">{error}</div> : null}

          <div className="cc-table-wrap">
            {loading ? (
              <p className="cc-empty">Hesaplanıyor…</p>
            ) : !data || data.rows.length === 0 ? (
              <p className="cc-empty">Gösterilecek satır yok.</p>
            ) : (
              <table className="cc-table">
                <thead>
                  <tr>
                    <th rowSpan={2} className="cc-col-size">
                      Ölçü
                    </th>
                    <th colSpan={2}>Hesaplanan</th>
                    <th colSpan={2}>NET</th>
                    <th colSpan={2}>
                      <span className="cc-th-stack">
                        Parça
                        <span>Maliyeti</span>
                      </span>
                    </th>
                    <th rowSpan={2} className="cc-th-result">
                      <span className="cc-th-stack">
                        MDF
                        <span>Maliyeti</span>
                      </span>
                    </th>
                    <th rowSpan={2} className="cc-th-expense">
                      Kesim
                    </th>
                    <th rowSpan={2} className="cc-th-expense">
                      Tutkal
                    </th>
                    <th rowSpan={2} className="cc-th-expense">
                      İşçilik
                    </th>
                    <th rowSpan={2} className="cc-th-expense">
                      Diğer
                    </th>
                    <th rowSpan={2} className="cc-th-result">
                      <span className="cc-th-stack">
                        MDF +
                        <span>Masraf</span>
                      </span>
                    </th>
                    <th rowSpan={2}>KDV %</th>
                    <th rowSpan={2}>KDV ₺</th>
                    <th rowSpan={2} className="cc-th-result">
                      <span className="cc-th-stack">
                        KDV Dahil
                        <span>Maliyet</span>
                      </span>
                    </th>
                    <th rowSpan={2}>Kâr %</th>
                    <th rowSpan={2}>Kâr ₺</th>
                    <th rowSpan={2} className="cc-th-result">
                      <span className="cc-th-stack">
                        Yuvarlama
                        <span>Öncesi</span>
                      </span>
                    </th>
                    <th rowSpan={2} className="cc-th-result">
                      <span className="cc-th-stack">
                        Yuvarlanmış
                        <span>Satış</span>
                      </span>
                    </th>
                    {showsCashSalePrice(materialPriceType) ? (
                      <>
                        <th rowSpan={2} className="cc-th-final">
                          <span className="cc-th-stack">
                            Hesaplanan
                            <span>Nakit</span>
                          </span>
                        </th>
                        <th rowSpan={2} className="cc-th-final">
                          <span className="cc-th-stack">
                            Yayınlanan
                            <span>Nakit</span>
                          </span>
                        </th>
                      </>
                    ) : null}
                    {showsCardSalePrice(materialPriceType) ? (
                      <th rowSpan={2} className="cc-th-final">
                        <span className="cc-th-stack">
                          Kart /
                          <span>Taksit Satış</span>
                        </span>
                      </th>
                    ) : null}
                    <th rowSpan={2} className="cc-th-action">
                      {' '}
                    </th>
                  </tr>
                  <tr>
                    <th className="cc-th-sub">{thicknesses[0]}</th>
                    <th className="cc-th-sub">{thicknesses[1]}</th>
                    <th className="cc-th-sub">{thicknesses[0]}</th>
                    <th className="cc-th-sub">{thicknesses[1]}</th>
                    <th className="cc-th-sub">{thicknesses[0]}</th>
                    <th className="cc-th-sub">{thicknesses[1]}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const primary = partByThickness(row, thicknesses[0]);
                    const secondary = partByThickness(row, thicknesses[1]);
                    return (
                      <tr key={row.displayName}>
                        <td className="cc-col-size">{row.displayName.replace('×', '×')}</td>
                        <td className="cc-qty">{primary?.calculatedQty ?? '—'}</td>
                        <td className="cc-qty">{secondary?.calculatedQty ?? '—'}</td>
                        <td className="cc-qty">{primary?.netQty ?? '—'}</td>
                        <td className="cc-qty">{secondary?.netQty ?? '—'}</td>
                        <td className="cc-money">{formatTry(primary?.unitCost)}</td>
                        <td className="cc-money">{formatTry(secondary?.unitCost)}</td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-mdf">{formatTry(row.mdfCost)}</span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-expense">
                            {formatTry(row.extraCosts.cutting)}
                          </span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-expense">
                            {formatTry(row.extraCosts.glue)}
                          </span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-expense">
                            {formatTry(row.extraCosts.labor)}
                          </span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-expense">
                            {formatTry(row.extraCosts.other)}
                          </span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-prod">
                            {formatTry(row.productionCost)}
                          </span>
                        </td>
                        <td className="cc-qty">{formatPercentRate(row.pricing.vatRate)}</td>
                        <td className="cc-money">{formatTry(row.pricing.vatAmount)}</td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-vat">
                            {formatTry(row.pricing.costWithVat)}
                          </span>
                        </td>
                        <td className="cc-qty">
                          <ProfitRateCell
                            value={row.pricing.profitRate}
                            payload={{
                              productGroupCode: 'door_frame',
                              productCode: variant,
                              widthMm: row.widthCm * 10,
                              lengthMm: row.lengthCm * 10,
                            }}
                            onSaved={(message) => {
                              setNotice(message);
                              setCatalogRefreshToken((n) => n + 1);
                            }}
                          />
                        </td>
                        <td className="cc-money">{formatTry(row.pricing.profitAmount)}</td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-pre">
                            {formatTry(row.pricing.priceBeforeRounding)}
                          </span>
                        </td>
                        <td className="cc-money">
                          <span className="cc-badge cc-badge-sale">
                            {formatTry(row.pricing.roundedSalePrice)}
                          </span>
                        </td>
                        {showsCashSalePrice(materialPriceType) ? (
                          <>
                            <td className="cc-money">
                              <span className="cc-badge cc-badge-cash">
                                {formatTry(
                                  row.pricing.calculatedCashPrice ??
                                    row.pricing.cashSalePrice,
                                )}
                              </span>
                            </td>
                            <td className="cc-money">
                              <span
                                className={
                                  row.pricing.cashOverride
                                    ? 'cc-badge cc-badge-published'
                                    : 'cc-badge cc-badge-cash'
                                }
                              >
                                {formatTry(
                                  row.pricing.publishedCashPrice ??
                                    row.pricing.cashSalePrice,
                                )}
                              </span>
                            </td>
                          </>
                        ) : null}
                        {showsCardSalePrice(materialPriceType) ? (
                          <td className="cc-money">
                            <span className="cc-badge cc-badge-card">
                              {row.pricing.publishedCardPrice != null ||
                              row.pricing.cardSalePrice != null
                                ? formatTry(
                                    row.pricing.publishedCardPrice ??
                                      row.pricing.cardSalePrice,
                                  )
                                : (row.pricing.cardStatusMessage ??
                                  'Kart/taksit oranı tanımlı değil')}
                            </span>
                          </td>
                        ) : null}
                        <td className="cc-col-action">
                          <button
                            type="button"
                            className="cc-btn cc-btn-row"
                            onClick={() => openPriceEdit(row)}
                          >
                            Fiyat Düzenle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}

      {productGroup === 'PERVAZ' ? (
          <>
            <div className="cc-pervaz-overview">
              <div className="cc-pervaz-overview-main">
                <div>
                  <span className="cc-pervaz-eyebrow">Pervaz fiyat listesi</span>
                  <h2>{pervazProductLabel}</h2>
                  <p>{PERVAZ_PRODUCT_META[pervazProduct].description}</p>
                  <p className="cc-note">
                    Seçili MDF alış türü: {materialPriceTypeLabel(materialPriceType)}.
                    Ana parça ve kılçık bu türden hesaplanır.
                  </p>
                </div>
                <button
                  type="button"
                  className="cc-btn cc-btn-sm"
                  onClick={() => void reloadPervazCosts()}
                  disabled={loading}
                >
                  {loading ? 'Yükleniyor…' : 'Listeyi Yenile'}
                </button>
              </div>

              <div className="cc-pervaz-stats" aria-label="Pervaz liste özeti">
                <div className="cc-pervaz-stat">
                  <span>Ölçü sayısı</span>
                  <strong>{pervazData?.verifiedMeasureCount ?? '—'}</strong>
                </div>
                <div className="cc-pervaz-stat">
                  <span>Kartlı satır</span>
                  <strong>
                    {pervazData
                      ? pervazProduct === 'DEKORATIF_PERVAZ_GENIS_KILCIK'
                        ? 'Yok'
                        : pervazCardRowCount
                      : '—'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="cc-pervaz-filters" aria-label="Pervaz liste filtreleri">
              <label className="cc-field cc-pervaz-search-field">
                <span>Ölçü ara</span>
                <input
                  className="cc-input"
                  type="search"
                  value={pervazQuery}
                  onChange={(event) => setPervazQuery(event.target.value)}
                  placeholder="Örn. 10×220"
                />
              </label>
              <label className="cc-field cc-pervaz-thickness-field">
                <span>Kalınlık</span>
                <select
                  className="cc-select"
                  value={pervazThickness}
                  onChange={(event) => setPervazThickness(event.target.value)}
                >
                  <option value="ALL">Tümü</option>
                  {pervazThicknesses.map((thickness) => (
                    <option key={thickness} value={String(thickness)}>
                      {thickness} mm
                    </option>
                  ))}
                </select>
              </label>
              <div className="cc-pervaz-filter-result" aria-live="polite">
                <strong>{filteredPervazRows.length}</strong>
                <span>
                  {pervazData
                    ? ` / ${pervazData.verifiedMeasureCount} satır gösteriliyor`
                    : ' satır'}
                </span>
              </div>
              {pervazQuery || pervazThickness !== 'ALL' ? (
                <button
                  type="button"
                  className="cc-btn cc-btn-sm cc-pervaz-clear"
                  onClick={() => {
                    setPervazQuery('');
                    setPervazThickness('ALL');
                  }}
                >
                  Filtreyi Temizle
                </button>
              ) : null}
            </div>

            {notice ? <div className="cc-notice">{notice}</div> : null}
            {error ? (
              <div className="cc-alert cc-alert-actions">
                <span>{error}</span>
                <button
                  type="button"
                  className="cc-btn cc-btn-sm"
                  onClick={() => void reloadPervazCosts()}
                >
                  Yeniden Dene
                </button>
              </div>
            ) : null}

            <div className="cc-table-wrap cc-pervaz-table-wrap">
              {loading ? (
                <div
                  className="cc-table-skeleton"
                  aria-label="Pervaz maliyetleri yükleniyor"
                >
                  {Array.from({ length: 8 }).map((_, index) => (
                    <span key={index} />
                  ))}
                </div>
              ) : !pervazData || pervazData.rows.length === 0 ? (
                <div className="cc-empty">
                  <p>Gösterilecek Pervaz ölçüsü yok.</p>
                  <button
                    type="button"
                    className="cc-btn cc-btn-sm"
                    onClick={() => void reloadPervazCosts()}
                  >
                    Yenile
                  </button>
                </div>
              ) : filteredPervazRows.length === 0 ? (
                <div className="cc-empty">
                  <p>Bu filtrelerle eşleşen Pervaz ölçüsü yok.</p>
                  <button
                    type="button"
                    className="cc-btn cc-btn-sm"
                    onClick={() => {
                      setPervazQuery('');
                      setPervazThickness('ALL');
                    }}
                  >
                    Filtreyi Temizle
                  </button>
                </div>
              ) : (
                <PervazCostTable
                  mode={
                    pervazProduct === 'AYARLI_PERVAZ'
                      ? 'ayarli'
                      : 'dekoratif'
                  }
                  materialPriceType={materialPriceType}
                  rows={filteredPervazRows}
                  onProfitSaved={(message) => {
                    setNotice(message);
                    void reloadPervazCosts();
                  }}
                />
              )}
            </div>
          </>
      ) : null}

      {productGroup === 'SUPURGELIK' ? (
        <SupurgelikCostList
          materialPriceType={materialPriceType}
          initialSourceDrawer={initialSettingsOpen}
          refreshToken={catalogRefreshToken}
        />
      ) : null}

      {productGroup === 'CITA' ? (
        <CitaCostList
          materialPriceType={materialPriceType}
          initialSourceDrawer={initialSettingsOpen}
          refreshToken={catalogRefreshToken}
        />
      ) : null}

      {!SPECIAL_COST_GROUPS.has(productGroup) ? (
        <GenericProductCostTable
          productGroupCode={productGroup}
          materialPriceType={materialPriceType}
          refreshToken={catalogRefreshToken}
          onChanged={(message) => {
            setNotice(message);
            setCatalogRefreshToken((n) => n + 1);
          }}
        />
      ) : null}

      <CatalogItemDrawer
        open={catalogDrawerOpen}
        defaultProductGroup={productGroup}
        defaultProductCode={
          productGroup === 'door_frame'
            ? variant
            : productGroup === 'PERVAZ'
              ? pervazProduct
              : productGroup === 'CITA'
                ? 'CITA'
                : productGroup === 'SUPURGELIK'
                  ? 'DUZ_SUPURGELIK'
                  : undefined
        }
        materialPriceType={materialPriceType}
        onClose={() => setCatalogDrawerOpen(false)}
        onSaved={(message, groupCode) => {
          setNotice(message || 'Ürün / ölçü başarıyla eklendi.');
          if (groupCode) setProductGroup(groupCode);
          setCatalogRefreshToken((n) => n + 1);
        }}
      />

      {drawerOpen ? (
        <div className="cc-drawer-overlay" onClick={closeDrawer} role="presentation">
          <aside
            className="cc-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Maliyet ayarlarını düzenle"
          >
            <div className="cc-drawer-header">
              <h2>Maliyet Ayarlarını Düzenle</h2>
              <button type="button" className="cc-btn cc-btn-sm" onClick={closeDrawer} disabled={saving}>
                Kapat
              </button>
            </div>

            {settingsLoading ? (
              <p className="cc-empty">Ayarlar yükleniyor…</p>
            ) : (
              <form className="cc-form" onSubmit={onSaveSettings}>
                <section className="cc-form-section">
                  <h3>
                    {productGroup === 'PERVAZ'
                      ? 'Pervaz Ortak Masrafları'
                      : 'Ortak Kapı Kasası Giderleri'}
                  </h3>
                  <p className="cc-hint">
                    {productGroup === 'PERVAZ'
                      ? 'Kesim, tutkal ve işçilik tüm Pervaz hesaplarında ortak kullanılır.'
                      : '34 MM ve 30 MM aynı değerleri kullanır.'}{' '}
                    MDF alış fiyatları Ham Maddeler ekranından düzenlenir.
                  </p>
                  {activeExtraOrder.map((code) => (
                    <label key={code} className="cc-field">
                      <span>{EXTRA_LABELS[code]} (TL)</span>
                      <input
                        className="cc-input"
                        value={extraForm[code]}
                        onChange={(e) =>
                          setExtraForm((prev) => ({ ...prev, [code]: e.target.value }))
                        }
                        inputMode="decimal"
                      />
                    </label>
                  ))}
                </section>

                <section className="cc-form-section">
                  <h3>
                    {productGroup === 'PERVAZ'
                      ? `${pervazProductLabel} Fiyatlandırma`
                      : `${
                          variant === '34_MM' ? '34 MM' : '30 MM'
                        } Fiyatlandırma Ayarları`}
                  </h3>
                  <p className="cc-hint">
                    {pricingMeta?.productName ??
                      (productGroup === 'PERVAZ' ? pervazProductLabel : variant)}
                    {' — '}
                    {productGroup === 'PERVAZ'
                      ? pervazProduct === 'AYARLI_PERVAZ'
                        ? 'özel satır oranları değiştirilmez.'
                        : 'dekoratif fark oranları aşağıdan düzenlenir.'
                      : 'yalnızca seçili kasa etkilenir.'}
                  </p>
                  {productGroup === 'door_frame' ? (
                    <label className="cc-field">
                      <span>KDV Oranı (%)</span>
                      <input
                        className="cc-input"
                        value={pricingForm.vatRate}
                        onChange={(e) =>
                          setPricingForm((prev) => ({
                            ...prev,
                            vatRate: e.target.value,
                          }))
                        }
                        inputMode="decimal"
                      />
                    </label>
                  ) : null}
                  <label className="cc-field">
                    <span>
                      {productGroup === 'PERVAZ'
                        ? 'Varsayılan Kâr Oranı (%)'
                        : 'Kâr Oranı (%)'}
                    </span>
                    <input
                      className="cc-input"
                      value={pricingForm.profitRate}
                      onChange={(e) =>
                        setPricingForm((prev) => ({ ...prev, profitRate: e.target.value }))
                      }
                      inputMode="decimal"
                    />
                  </label>
                  {productGroup === 'door_frame' || canEditPervazCardRate ? (
                    <label className="cc-field">
                      <span>Grup kart oranı (%)</span>
                      <input
                        className="cc-input"
                        value={pricingForm.cardMarkupRate}
                        onChange={(e) =>
                          setPricingForm((prev) => ({
                            ...prev,
                            cardMarkupRate: e.target.value,
                          }))
                        }
                        inputMode="decimal"
                        placeholder="Tanımlı değil"
                      />
                      {productGroup === 'door_frame' &&
                      pricingForm.cardMarkupRate.trim() === '' &&
                      productCardMarkupRate ? (
                        <span className="cc-hint">
                          Grup kart oranı: Tanımlı değil. Mevcut hesaplama: Ürün oranı{' '}
                          {formatPercentRate(productCardMarkupRate)}
                        </span>
                      ) : null}
                    </label>
                  ) : null}
                  {productGroup === 'PERVAZ' &&
                  pervazProduct === 'DEKORATIF_PERVAZ_GENIS_KILCIK' ? (
                    <p className="cc-hint">Bu ürün için kart fiyatı yok.</p>
                  ) : null}
                </section>

                {canEditPervazDecorativePremium ? (
                  <section className="cc-form-section">
                    <h3>Dekoratif Maliyetler</h3>
                    <p className="cc-hint">
                      Satır bazlı dekoratif fark oranı. Ayarlı Pervaz etkilenmez.
                    </p>
                    {dekoratifPremiumsError ? (
                      <div className="cc-alert">{dekoratifPremiumsError}</div>
                    ) : null}
                    {dekoratifPremiums.length === 0 ? (
                      <p className="cc-hint">Bu ürün için ölçü bulunamadı.</p>
                    ) : (
                      <div className="cc-supurgelik-source-list">
                        {dekoratifPremiums.map((item) => {
                          const key = premiumKey(item);
                          const editing = editingPremiumKey === key;
                          return (
                            <div className="cc-supurgelik-source-row" key={key}>
                              <div className="cc-supurgelik-source-material">
                                <strong>{item.thicknessMm} mm</strong>
                                <span>
                                  {formatPieceSizeCm(item.widthMm, item.lengthMm)}
                                </span>
                              </div>
                              {editing ? (
                                <div className="cc-supurgelik-source-edit">
                                  <label className="cc-field">
                                    <span>Dekoratif fark (%)</span>
                                    <input
                                      className="cc-input"
                                      inputMode="decimal"
                                      autoFocus
                                      value={premiumRateInput}
                                      onChange={(event) =>
                                        setPremiumRateInput(event.target.value)
                                      }
                                      placeholder="50"
                                      disabled={premiumSaving}
                                    />
                                  </label>
                                  <div className="cc-supurgelik-source-edit-actions">
                                    <button
                                      type="button"
                                      className="cc-btn cc-btn-sm"
                                      onClick={() => {
                                        setEditingPremiumKey(null);
                                        setPremiumRateInput('');
                                        setDekoratifPremiumsError(null);
                                      }}
                                      disabled={premiumSaving}
                                    >
                                      İptal
                                    </button>
                                    <button
                                      type="button"
                                      className="cc-btn cc-btn-primary cc-btn-sm"
                                      onClick={() => void saveDekoratifPremium(item)}
                                      disabled={premiumSaving}
                                    >
                                      {premiumSaving ? 'Kaydediliyor…' : 'Kaydet'}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="cc-supurgelik-source-price">
                                  <span>Mevcut Oran</span>
                                  {item.rate == null ? (
                                    <strong className="missing">
                                      Tanımlı değil
                                    </strong>
                                  ) : (
                                    <strong>{formatPercentRate(item.rate)}</strong>
                                  )}
                                  <button
                                    type="button"
                                    className="cc-btn cc-btn-sm"
                                    onClick={() => {
                                      setEditingPremiumKey(key);
                                      setPremiumRateInput(item.rate ?? '');
                                      setDekoratifPremiumsError(null);
                                    }}
                                    disabled={saving || premiumSaving}
                                  >
                                    {item.rate == null ? 'Değer Gir' : 'Düzenle'}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                ) : null}

                {pendingChanges.length > 0 ? (
                  <div className="cc-summary">
                    <div className="cc-summary-label">Kaydedilecek değişiklikler</div>
                    <ul className="cc-change-list">
                      {pendingChanges.map((c) => (
                        <li key={c.label}>
                          <strong>{c.label}:</strong> {c.from} → {c.to}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="cc-hint">Henüz değişiklik yok.</p>
                )}

                {formError ? <div className="cc-alert">{formError}</div> : null}

                <div className="cc-form-actions">
                  <button type="button" className="cc-btn" onClick={closeDrawer} disabled={saving}>
                    İptal
                  </button>
                  <button
                    type="submit"
                    className="cc-btn cc-btn-primary"
                    disabled={saving || pendingChanges.length === 0}
                  >
                    {saving ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}
                  </button>
                </div>
              </form>
            )}
          </aside>
        </div>
      ) : null}

      {priceEditRow ? (
        <div className="cc-drawer-overlay" onClick={closePriceEdit} role="presentation">
          <aside
            className="cc-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Nakit fiyat düzenle"
          >
            <div className="cc-drawer-header">
              <h2>Fiyat Düzenle</h2>
              <button
                type="button"
                className="cc-btn cc-btn-sm"
                onClick={closePriceEdit}
                disabled={priceEditSaving}
              >
                Kapat
              </button>
            </div>
            <form className="cc-form" onSubmit={onSavePriceOverride}>
              <section className="cc-form-section">
                <p className="cc-hint">
                  {variant === '34_MM' ? '34 MM' : '30 MM'} · Ölçü:{' '}
                  <strong>{priceEditRow.displayName}</strong>
                </p>
                <div className="cc-summary">
                  <div className="cc-summary-label">Hesaplanan Nakit</div>
                  <strong>
                    {formatTry(
                      priceEditRow.pricing.calculatedCashPrice ??
                        priceEditRow.pricing.cashSalePrice,
                    )}
                  </strong>
                </div>
                <label className="cc-field">
                  <span>Yayınlanan Nakit (TL)</span>
                  <input
                    className="cc-input"
                    value={priceEditCash}
                    onChange={(e) => setPriceEditCash(e.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label className="cc-field">
                  <span>Değişiklik Sebebi (isteğe bağlı)</span>
                  <input
                    className="cc-input"
                    value={priceEditReason}
                    onChange={(e) => setPriceEditReason(e.target.value)}
                  />
                </label>
                <p className="cc-hint">
                  Kart fiyatı, yayınlanan nakit fiyata kart farkı uygulanarak hesaplanır.
                </p>
              </section>

              {priceEditError ? <div className="cc-alert">{priceEditError}</div> : null}

              <div className="cc-form-actions">
                <button
                  type="button"
                  className="cc-btn"
                  onClick={closePriceEdit}
                  disabled={priceEditSaving}
                >
                  İptal
                </button>
                <button
                  type="button"
                  className="cc-btn"
                  onClick={() => void onUseFormulaPrice()}
                  disabled={priceEditSaving || !priceEditRow.pricing.cashOverride}
                >
                  Hesaplanan fiyata dön
                </button>
                <button
                  type="submit"
                  className="cc-btn cc-btn-primary"
                  disabled={priceEditSaving}
                >
                  {priceEditSaving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

    </section>
  );
}
