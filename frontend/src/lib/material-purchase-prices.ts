import {
  updateRawMaterialCardInstallmentPrice,
  updateRawMaterialCashPrice,
  type RawMaterial,
} from '../api/raw-materials-api';

function normalizeDecimalInput(value: string): string {
  return value.trim().replace(',', '.');
}

function isPositiveDecimal(value: string): boolean {
  return /^\d+(\.\d{1,4})?$/.test(value) && !/^0+(\.0+)?$/.test(value);
}

function decimalKey(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  return `${whole.replace(/^0+(?=\d)/, '') || '0'}.${(fraction + '0000').slice(0, 4)}`;
}

function samePrice(input: string, current: string | null): boolean {
  if (input === '') return current == null || current === '';
  if (current == null || current === '') return false;
  const currentKey = normalizeDecimalInput(current);
  if (!isPositiveDecimal(input) || !/^\d+(\.\d{1,4})?$/.test(currentKey)) {
    return false;
  }
  return decimalKey(input) === decimalKey(currentKey);
}

/**
 * Yalnız değişen alış türünü kendi endpoint’ine yazar.
 * Diğer tür gönderilmez; eksik tür 0 yapılmaz.
 */
export async function saveChangedPurchasePrices(
  material: RawMaterial,
  cashInput: string,
  cardInput: string,
): Promise<{ changed: boolean; message: string }> {
  const cashNext = normalizeDecimalInput(cashInput);
  const cardNext = normalizeDecimalInput(cardInput);

  if (cashNext !== '' && !isPositiveDecimal(cashNext)) {
    throw new Error('Nakit alış fiyatı 0’dan büyük geçerli bir tutar olmalıdır.');
  }
  if (cardNext !== '' && !isPositiveDecimal(cardNext)) {
    throw new Error(
      'Kart / taksitli alış fiyatı 0’dan büyük geçerli bir tutar olmalıdır.',
    );
  }

  const cashChanged = !samePrice(cashNext, material.cashPrice);
  const cardChanged = !samePrice(cardNext, material.cardInstallmentPrice);

  if (cashChanged && cashNext === '') {
    throw new Error('Nakit alış fiyatı boş bırakılamaz.');
  }
  if (cardChanged && cardNext === '') {
    throw new Error('Kart / taksitli alış fiyatı boş bırakılamaz.');
  }
  if (!cashChanged && !cardChanged) {
    return {
      changed: false,
      message: 'Fiyat değişmedi; yeni geçmiş kaydı oluşturulmadı.',
    };
  }

  if (cashChanged) {
    await updateRawMaterialCashPrice(material.id, { price: cashNext });
  }
  if (cardChanged) {
    await updateRawMaterialCardInstallmentPrice(material.id, { price: cardNext });
  }

  return {
    changed: true,
    message: `${material.thicknessMm} mm MDF alış fiyatı güncellendi.`,
  };
}
