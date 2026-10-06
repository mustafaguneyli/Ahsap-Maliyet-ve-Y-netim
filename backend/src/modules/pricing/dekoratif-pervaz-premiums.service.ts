import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { decimalToPrisma, toDecimal } from '../../common/decimal/decimal.util';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { discoverActiveProductMasterRows } from '../production-yields/active-product-master-discovery';
import {
  selectCurrentEffectivePeriod,
} from './ayarli-pervaz-profit-rate.resolver';
import { assertPricingRowException } from './pricing-row-exception.validation';
import {
  DEKORATIF_PERVAZ_PREMIUM_PRODUCT_CODES,
  type DekoratifPervazPremiumProductCode,
} from './dto/update-dekoratif-pervaz-premium.dto';

const EXCEPTION_ENTITY_TYPE = 'PricingRowException';

export type DekoratifPervazPremiumItem = {
  exceptionId: string | null;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  rate: string | null;
  isActive: boolean;
};

export type DekoratifPervazPremiumsResponse = {
  productGroupCode: 'PERVAZ';
  productCode: DekoratifPervazPremiumProductCode;
  productName: string;
  items: DekoratifPervazPremiumItem[];
};

@Injectable()
export class DekoratifPervazPremiumsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listPremiums(
    productCode: string,
    now: Date = new Date(),
  ): Promise<DekoratifPervazPremiumsResponse> {
    const code = this.requireProductCode(productCode);
    const { product, rows: masters } = await discoverActiveProductMasterRows(
      this.prisma,
      { productGroupCode: 'PERVAZ', productCode: code },
    );

    const exceptions = await this.prisma.pricingRowException.findMany({
      where: {
        productId: product.id,
        isActive: true,
      },
    });

    const items = masters
      .map((master) => {
        const thicknessMm = Number(master.thicknessMm);
        const current = selectCurrentEffectivePeriod(
          exceptions.filter(
            (row) =>
              row.thicknessMm === thicknessMm &&
              row.widthMm === master.widthMm &&
              row.lengthMm === master.lengthMm,
          ),
          now,
        );
        const rate =
          current?.decorativePremiumRate != null
            ? toDecimal(current.decorativePremiumRate.toString()).toString()
            : null;
        return {
          exceptionId: current?.id ?? null,
          thicknessMm,
          widthMm: master.widthMm,
          lengthMm: master.lengthMm,
          rate,
          isActive: current?.isActive === true && rate != null,
        };
      })
      .sort(
        (left, right) =>
          left.thicknessMm - right.thicknessMm ||
          left.widthMm - right.widthMm ||
          left.lengthMm - right.lengthMm,
      );

    return {
      productGroupCode: 'PERVAZ',
      productCode: code,
      productName: product.name,
      items,
    };
  }

  /**
   * Product + ölçü (thickness/width/length) scope'undaki dekoratif fark.
   * Ayarlı Pervaz ve diğer ürünler yazılmaz. Same-value no-op.
   */
  async replacePremium(
    dto: {
      productCode: string;
      thicknessMm: number;
      widthMm: number;
      lengthMm: number;
      rate: string;
    },
    now: Date = new Date(),
  ): Promise<DekoratifPervazPremiumsResponse> {
    const code = this.requireProductCode(dto.productCode);
    let rate;
    try {
      rate = toDecimal(dto.rate);
    } catch {
      throw new BadRequestException(
        'Dekoratif fark oranı geçerli bir Decimal olmalıdır.',
      );
    }
    if (!rate.isFinite() || rate.isNegative()) {
      throw new BadRequestException('Dekoratif fark oranı negatif olamaz.');
    }

    await this.prisma.$transaction(async (tx) => {
      const { product, rows: masters } = await discoverActiveProductMasterRows(
        tx as never,
        { productGroupCode: 'PERVAZ', productCode: code },
      );
      const master = masters.find(
        (row) =>
          Number(row.thicknessMm) === dto.thicknessMm &&
          row.widthMm === dto.widthMm &&
          row.lengthMm === dto.lengthMm,
      );
      if (!master) {
        throw new NotFoundException(
          `${code} için ${dto.thicknessMm} mm / ${dto.widthMm}×${dto.lengthMm} MASTER ölçüsü bulunamadı.`,
        );
      }

      const active = await tx.pricingRowException.findMany({
        where: {
          productId: product.id,
          thicknessMm: dto.thicknessMm,
          widthMm: dto.widthMm,
          lengthMm: dto.lengthMm,
          isActive: true,
        },
      });
      const current = selectCurrentEffectivePeriod(active, now);
      if (active.length > 1) {
        throw new BadRequestException(
          `${code} ${dto.thicknessMm} mm / ${dto.widthMm}×${dto.lengthMm} için birden fazla aktif satır istisnası bulundu.`,
        );
      }
      const currentRate =
        current?.decorativePremiumRate != null
          ? toDecimal(current.decorativePremiumRate.toString())
          : null;
      if (currentRate != null && currentRate.equals(rate)) {
        return;
      }

      assertPricingRowException({
        productId: product.id,
        thicknessMm: dto.thicknessMm,
        widthMm: dto.widthMm,
        lengthMm: dto.lengthMm,
        profitRate: current?.profitRate?.toString() ?? null,
        decorativePremiumRate: rate.toString(),
        adjustmentAmount: current?.adjustmentAmount?.toString() ?? null,
        cardSaleEnabled: current?.cardSaleEnabled ?? null,
        effectiveFrom: now,
        effectiveTo: null,
        productIsActive: product.isActive,
      });

      if (current) {
        await tx.pricingRowException.update({
          where: { id: current.id },
          data: { isActive: false },
        });
        await this.auditService.record(
          {
            entityType: EXCEPTION_ENTITY_TYPE,
            entityId: current.id,
            action: 'UPDATE',
            fieldName: 'isActive',
            oldValue: 'true',
            newValue: 'false',
            reason: `Yeni dekoratif fark için eski aktif kayıt kapatıldı (${code} ${dto.thicknessMm}/${dto.widthMm}/${dto.lengthMm})`,
          },
          tx,
        );
      }

      const created = await tx.pricingRowException.create({
        data: {
          productId: product.id,
          thicknessMm: dto.thicknessMm,
          widthMm: dto.widthMm,
          lengthMm: dto.lengthMm,
          profitRate: current?.profitRate ?? null,
          decorativePremiumRate: decimalToPrisma(rate),
          adjustmentAmount: current?.adjustmentAmount ?? null,
          cardSaleEnabled: current?.cardSaleEnabled ?? null,
          isActive: true,
          effectiveFrom: now,
          effectiveTo: null,
        },
      });
      await this.auditService.record(
        {
          entityType: EXCEPTION_ENTITY_TYPE,
          entityId: created.id,
          action: 'CREATE',
          fieldName: 'decorativePremiumRate',
          oldValue: currentRate?.toString() ?? null,
          newValue: rate.toFixed(4),
          reason: `Dekoratif Pervaz fark oranı güncellemesi (${code} ${dto.thicknessMm}/${dto.widthMm}/${dto.lengthMm})`,
        },
        tx,
      );
    });

    return this.listPremiums(code, now);
  }

  private requireProductCode(productCode: string): DekoratifPervazPremiumProductCode {
    if (
      !(DEKORATIF_PERVAZ_PREMIUM_PRODUCT_CODES as readonly string[]).includes(
        productCode,
      )
    ) {
      throw new BadRequestException(
        'productCode DEKORATIF_PERVAZ veya DEKORATIF_PERVAZ_GENIS_KILCIK olmalıdır.',
      );
    }
    return productCode as DekoratifPervazPremiumProductCode;
  }
}
