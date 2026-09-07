import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  resolveKilcikExcelQty,
  resolvePervazPieceQty,
  type PervazQtyResolution,
} from './pervaz-qty-resolver';

const KILCIK_SHEET = { sheetWidthMm: 2200, sheetLengthMm: 2800 } as const;

@Injectable()
export class PervazQtyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ana pervaz: aktif ProductionYield master varsa onu kullanır; yoksa Excel geometrisi.
   * Hesaplanan öneri kaydedilmez.
   */
  async resolvePervazPiece(input: {
    rawMaterialId: string;
    sheetWidthMm: number;
    sheetLengthMm: number;
    pieceWidthMm: number;
    pieceLengthMm: number;
  }): Promise<PervazQtyResolution> {
    const master = await this.prisma.productionYield.findFirst({
      where: {
        rawMaterialId: input.rawMaterialId,
        pieceWidthMm: input.pieceWidthMm,
        pieceLengthMm: input.pieceLengthMm,
        isActive: true,
      },
    });

    return resolvePervazPieceQty({
      sheetWidthMm: input.sheetWidthMm,
      sheetLengthMm: input.sheetLengthMm,
      pieceWidthMm: input.pieceWidthMm,
      pieceLengthMm: input.pieceLengthMm,
      masterNetQty: master?.netQty ?? null,
    });
  }

  /**
   * Kılçık: aktif EXCEL_MASTER (product + kalınlık + boy) varsa onu kullanır.
   * Yoksa Excel 42/45/50/55 profili. Tip seçimi master anahtarına girmez.
   * Hesaplanan öneri kaydedilmez.
   */
  async resolveKilcik(input: {
    productId?: string;
    kilcikTypeId?: string;
    pervazThicknessMm: number;
    pieceLengthMm: number;
    sheetWidthMm?: number;
    sheetLengthMm?: number;
  }): Promise<PervazQtyResolution> {
    let masterNetQty: number | null = null;
    if (input.productId) {
      const master = await this.prisma.pervazKilcikYield.findFirst({
        where: {
          productId: input.productId,
          pervazThicknessMm: input.pervazThicknessMm,
          pieceLengthMm: input.pieceLengthMm,
          source: 'EXCEL_MASTER',
          isActive: true,
        },
      });
      masterNetQty = master?.netQty ?? null;
    }

    return resolveKilcikExcelQty({
      sheetWidthMm: input.sheetWidthMm ?? KILCIK_SHEET.sheetWidthMm,
      sheetLengthMm: input.sheetLengthMm ?? KILCIK_SHEET.sheetLengthMm,
      pieceLengthMm: input.pieceLengthMm,
      pervazThicknessMm: input.pervazThicknessMm,
      masterNetQty,
    });
  }
}
