import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const TARGETS = ['SIZE', 'PRODUCT', 'GROUP'] as const;

/**
 * Soft-deactivate (isActive=false). Hard delete yok.
 * SIZE → ilgili Recipe (product×size catalog bağlantısı)
 * PRODUCT → Product
 * GROUP → ProductGroup (yalnız aktif ürün yoksa)
 */
export class DeactivateCatalogItemDto {
  @IsIn(TARGETS)
  target!: (typeof TARGETS)[number];

  @ValidateIf((o: DeactivateCatalogItemDto) => o.target === 'SIZE')
  @IsUUID()
  recipeId?: string;

  @ValidateIf((o: DeactivateCatalogItemDto) => o.target === 'PRODUCT')
  @IsUUID()
  productId?: string;

  @ValidateIf((o: DeactivateCatalogItemDto) => o.target === 'GROUP')
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroupCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
