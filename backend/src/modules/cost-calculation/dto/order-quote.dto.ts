import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import { CITA_MATERIAL_PRICE_TYPES } from '../../../calculation-engine/calculators/cita-mdf-calculator';

const POSITIVE_MM = /^\d+(?:\.\d+)?$/;

export class OrderQuoteDto {
  @IsUUID('4', { message: 'productId geçerli bir UUID olmalıdır.' })
  productId!: string;

  @Type(() => Number)
  @IsInt({ message: 'Sipariş adedi pozitif tam sayı olmalıdır.' })
  @Min(1, { message: 'Sipariş adedi 1 veya daha büyük olmalıdır.' })
  quantity!: number;

  @IsOptional()
  @IsNotEmpty({ message: 'thicknessMm boş olamaz.' })
  @Matches(POSITIVE_MM, { message: 'thicknessMm geçerli bir mm değeri olmalıdır.' })
  thicknessMm?: string;

  @IsNotEmpty({ message: 'widthMm zorunludur.' })
  @Matches(POSITIVE_MM, { message: 'widthMm geçerli bir mm değeri olmalıdır.' })
  widthMm!: string;

  @IsNotEmpty({ message: 'lengthMm zorunludur.' })
  @Matches(POSITIVE_MM, { message: 'lengthMm geçerli bir mm değeri olmalıdır.' })
  lengthMm!: string;

  /** MDF alış türü. Yoksa CARD_INSTALLMENT. Satış kart yüzdesinden ayrıdır. */
  @IsOptional()
  @IsIn(CITA_MATERIAL_PRICE_TYPES, {
    message: 'materialPriceType CASH veya CARD_INSTALLMENT olmalıdır.',
  })
  materialPriceType?: (typeof CITA_MATERIAL_PRICE_TYPES)[number];
}
