import { DoorFrameCalculator } from '../../calculation-engine/calculators/door-frame-calculator';
import {
  DOOR_FRAME_MATERIAL_CODES,
  formatDoorFrameSizeLabel,
  getSecondary12MaterialCode,
} from '../../calculation-engine/calculators/door-frame-variants';
import {
  DOOR_FRAME_EXCEL_GOLDEN_34_MM,
  DOOR_FRAME_EXCEL_GOLDEN_INPUTS,
} from '../../calculation-engine/calculators/fixtures/door-frame-excel-golden.fixture';
import { applyPublishedSalePrices } from './apply-published-sale-prices';

const PRINTED_34_MM: Array<{
  widthCm: number;
  lengthCm: number;
  override: string | null;
  publishedCash: string;
  publishedCard: string;
}> = [
  { widthCm: 10, lengthCm: 210, override: '300', publishedCash: '300', publishedCard: '360' },
  { widthCm: 12, lengthCm: 210, override: null, publishedCash: '356', publishedCard: '428' },
  { widthCm: 14, lengthCm: 210, override: '415', publishedCash: '415', publishedCard: '498' },
  { widthCm: 16, lengthCm: 210, override: null, publishedCash: '465', publishedCard: '558' },
  { widthCm: 18, lengthCm: 210, override: '525', publishedCash: '525', publishedCard: '630' },
  { widthCm: 20, lengthCm: 210, override: '600', publishedCash: '600', publishedCard: '720' },
  { widthCm: 22, lengthCm: 210, override: null, publishedCash: '655', publishedCard: '786' },
  { widthCm: 24, lengthCm: 210, override: null, publishedCash: '708', publishedCard: '850' },
];

describe('34 MM basılı liste yayın katmanı (calculator + override)', () => {
  it('8/8 nakit ve 8/8 kart; calculated Excel golden ile aynı kalır', () => {
    const calculator = new DoorFrameCalculator();
    const extras = { ...DOOR_FRAME_EXCEL_GOLDEN_INPUTS.extras };

    for (const printed of PRINTED_34_MM) {
      const golden = DOOR_FRAME_EXCEL_GOLDEN_34_MM.find(
        (g) => g.widthCm === printed.widthCm && g.lengthCm === printed.lengthCm,
      );
      if (!golden) {
        throw new Error(`Golden fixture eksik: ${printed.widthCm}x${printed.lengthCm}`);
      }

      const secondaryCode = getSecondary12MaterialCode(printed.widthCm, printed.lengthCm);
      const [row] = calculator.calculateCostsWithProfit(
        [
          {
            widthCm: printed.widthCm,
            lengthCm: printed.lengthCm,
            displayName: formatDoorFrameSizeLabel(printed.widthCm, printed.lengthCm),
            parts: [
              {
                thicknessMm: '22',
                rawMaterialId: 'm22',
                rawMaterialCode: DOOR_FRAME_MATERIAL_CODES.PRIMARY_22,
                rawMaterialName: '22 MM',
                sheetWidthMm: 2100,
                sheetLengthMm: 2800,
                sheetPrice: DOOR_FRAME_EXCEL_GOLDEN_INPUTS.price22,
                netQty: golden.netPrimary,
                pieceWidthMm: printed.widthCm * 10,
                pieceLengthMm: printed.lengthCm * 10,
              },
              {
                thicknessMm: '12',
                rawMaterialId: 'm12',
                rawMaterialCode: secondaryCode,
                rawMaterialName: '12 MM',
                sheetWidthMm: secondaryCode.includes('2200') ? 2200 : 2100,
                sheetLengthMm: 2800,
                sheetPrice: DOOR_FRAME_EXCEL_GOLDEN_INPUTS.price12_210,
                netQty: golden.netSecondary,
                pieceWidthMm: printed.widthCm * 10,
                pieceLengthMm: printed.lengthCm * 10,
              },
            ],
          },
        ],
        extras,
        '0',
        '20',
        '20',
      );

      expect(row.pricing.roundedSalePrice).toBe(golden.roundedSalePrice);
      expect(row.pricing.cashSalePrice).toBe(golden.roundedSalePrice);

      const published = applyPublishedSalePrices(
        row.pricing.cashSalePrice,
        '20',
        printed.override
          ? { id: 'ov', cashPrice: printed.override, reason: '2026-4' }
          : null,
      );
      expect(published.calculatedCashPrice).toBe(row.pricing.cashSalePrice);
      expect(published.publishedCashPrice).toBe(printed.publishedCash);
      expect(published.publishedCardPrice).toBe(printed.publishedCard);
    }
  });
});
