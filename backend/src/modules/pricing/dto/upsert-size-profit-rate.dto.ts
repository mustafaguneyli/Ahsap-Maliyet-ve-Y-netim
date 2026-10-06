import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

function emptyToNull(value: unknown): unknown {
  if (value === undefined) return value;
  if (value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

function toPositiveInt(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return value;
  return Number(value);
}

const NON_NEG_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

/**
 * Ölçü bazlı kâr oranı.
 * profitRate=null veya boş → size override kapatılır (fallback).
 * profitRate="0" geçerli override’dır.
 */
export class UpsertSizeProfitRateDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ValidateIf((o: UpsertSizeProfitRateDto) => !o.productId)
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  productGroupCode?: string;

  @ValidateIf((o: UpsertSizeProfitRateDto) => !o.productId)
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  productCode?: string;

  @IsOptional()
  @IsUUID()
  productSizeId?: string;

  @ValidateIf((o: UpsertSizeProfitRateDto) => !o.productSizeId)
  @Transform(({ value }) => toPositiveInt(value))
  @IsInt()
  @Min(1)
  widthMm?: number;

  @ValidateIf((o: UpsertSizeProfitRateDto) => !o.productSizeId)
  @Transform(({ value }) => toPositiveInt(value))
  @IsInt()
  @Min(1)
  lengthMm?: number;

  /** null = override kaldır (blank). "0" saklanır. */
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, v) => v != null)
  @Matches(NON_NEG_DECIMAL, {
    message: 'profitRate 0 veya daha büyük ondalık olmalıdır.',
  })
  profitRate!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
