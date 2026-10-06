import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

function toPositiveInt(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return value;
  }
  return Number(value);
}

const SPECIAL_GROUP_CODES = [
  'door_frame',
  'PERVAZ',
  'SUPURGELIK',
  'CITA',
] as const;

const RECIPE_MODES = [
  'PER_PIECE',
  'PER_SHEET_YIELD',
  'PER_METER',
  'PER_SQUARE_METER',
  'FIXED_QUANTITY',
] as const;

const EXTRA_MODES = [
  'FIXED',
  'PER_PRODUCT_QUANTITY',
  'PER_RECIPE_QUANTITY',
] as const;

const PRODUCT_UNITS = ['ADET', 'BOY', 'METRE', 'M2'] as const;

const NON_NEG_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const POSITIVE_DECIMAL = /^(?:[1-9]\d*)(?:\.\d+)?$|^0\.(?:0*[1-9]\d*)$/;

export class GenericRecipeItemDto {
  @IsUUID('4', { message: 'rawMaterialId geçerli UUID olmalıdır.' })
  rawMaterialId!: string;

  @IsIn(RECIPE_MODES, {
    message: `calculationMode şunlardan biri olmalı: ${RECIPE_MODES.join(', ')}`,
  })
  calculationMode!: (typeof RECIPE_MODES)[number];

  @IsNotEmpty({ message: 'quantity zorunludur.' })
  @Matches(POSITIVE_DECIMAL, { message: 'quantity > 0 olmalıdır.' })
  quantity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  quantityUnit?: string;

  @IsOptional()
  @Matches(NON_NEG_DECIMAL, { message: 'wasteRate negatif olamaz.' })
  wasteRate?: string;

  @IsOptional()
  @IsUUID('4')
  productionYieldId?: string;

  @IsOptional()
  @Transform(({ value }) => toPositiveInt(value))
  @IsInt()
  @Min(1)
  newNetQty?: number;

  @IsOptional()
  @Transform(({ value }) => toPositiveInt(value))
  @IsInt()
  @Min(1)
  pieceWidthMm?: number;

  @IsOptional()
  @Transform(({ value }) => toPositiveInt(value))
  @IsInt()
  @Min(1)
  pieceLengthMm?: number;

  @IsOptional()
  @Transform(({ value }) => toPositiveInt(value))
  @IsInt()
  @Min(1)
  sortOrder?: number;
}

export class GenericExtraCostDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  typeCode!: string;

  @IsNotEmpty()
  @Matches(NON_NEG_DECIMAL, { message: 'amount negatif olamaz.' })
  amount!: string;

  @IsIn(EXTRA_MODES)
  calculationMode!: (typeof EXTRA_MODES)[number];

  @IsIn(['GROUP', 'PRODUCT'])
  scope!: 'GROUP' | 'PRODUCT';
}

export class GenericPreviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroupCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  productGroupName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  productCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  productName?: string;

  @IsOptional()
  @IsIn(PRODUCT_UNITS)
  productUnit?: (typeof PRODUCT_UNITS)[number];

  @Transform(({ value }) => toPositiveInt(value))
  @IsInt()
  @Min(1)
  widthMm!: number;

  @Transform(({ value }) => toPositiveInt(value))
  @IsInt()
  @Min(1)
  lengthMm!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string;

  @IsOptional()
  @IsIn(['CASH', 'CARD_INSTALLMENT'])
  materialPriceType?: 'CASH' | 'CARD_INSTALLMENT';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GenericRecipeItemDto)
  recipeItems!: GenericRecipeItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GenericExtraCostDto)
  extraCosts?: GenericExtraCostDto[];

  @IsOptional()
  @Matches(NON_NEG_DECIMAL)
  vatRate?: string;

  @IsOptional()
  @Matches(NON_NEG_DECIMAL)
  profitRate?: string;

  @IsOptional()
  @Matches(NON_NEG_DECIMAL)
  cardMarkupRate?: string;
}

/**
 * POST /cost-calculation/catalog-items
 * SPECIAL gruplar → CatalogItemsService
 * GENERIC / NEW_GROUP → GenericRecipeService
 */
export class CreateCatalogItemDto {
  @IsIn(['NEW_GROUP', 'NEW_PRODUCT', 'NEW_SIZE'], {
    message: 'mode NEW_GROUP, NEW_PRODUCT veya NEW_SIZE olmalıdır.',
  })
  mode!: 'NEW_GROUP' | 'NEW_PRODUCT' | 'NEW_SIZE';

  @ValidateIf((o: CreateCatalogItemDto) => o.mode !== 'NEW_GROUP')
  @IsNotEmpty({ message: 'productGroupCode zorunludur.' })
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroupCode?: string;

  @ValidateIf((o: CreateCatalogItemDto) => o.mode === 'NEW_GROUP')
  @IsNotEmpty({ message: 'newGroupCode zorunludur.' })
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  newGroupCode?: string;

  @ValidateIf((o: CreateCatalogItemDto) => o.mode === 'NEW_GROUP')
  @IsNotEmpty({ message: 'newGroupName zorunludur.' })
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  newGroupName?: string;

  @ValidateIf((o: CreateCatalogItemDto) => o.mode === 'NEW_SIZE')
  @IsNotEmpty({ message: 'productCode zorunludur.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productCode?: string;

  @ValidateIf(
    (o: CreateCatalogItemDto) =>
      o.mode === 'NEW_GROUP' || o.mode === 'NEW_PRODUCT',
  )
  @IsNotEmpty({ message: 'newProductCode zorunludur.' })
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  newProductCode?: string;

  @ValidateIf(
    (o: CreateCatalogItemDto) =>
      o.mode === 'NEW_GROUP' || o.mode === 'NEW_PRODUCT',
  )
  @IsNotEmpty({ message: 'productName zorunludur.' })
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productName?: string;

  @IsOptional()
  @IsIn(PRODUCT_UNITS)
  productUnit?: (typeof PRODUCT_UNITS)[number];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasSizes?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @Transform(({ value }) => toPositiveInt(value))
  @IsInt({ message: 'widthMm tam mm olmalıdır.' })
  @Min(1, { message: 'widthMm pozitif olmalıdır.' })
  widthMm!: number;

  @Transform(({ value }) => toPositiveInt(value))
  @IsInt({ message: 'lengthMm tam mm olmalıdır.' })
  @Min(1, { message: 'lengthMm pozitif olmalıdır.' })
  lengthMm!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  displayName?: string;

  @ValidateIf((o: CreateCatalogItemDto) => isSpecialCatalogDto(o))
  @IsUUID('4', { message: 'rawMaterialId geçerli UUID olmalıdır.' })
  rawMaterialId?: string;

  @ValidateIf((o: CreateCatalogItemDto) => isSpecialCatalogDto(o))
  @Transform(({ value }) => toPositiveInt(value))
  @IsInt({ message: 'netQty tam sayı olmalıdır.' })
  @Min(1, { message: 'netQty > 0 olmalıdır.' })
  netQty?: number;

  @IsOptional()
  @IsUUID('4')
  secondaryRawMaterialId?: string;

  @IsOptional()
  @Transform(({ value }) => toPositiveInt(value))
  @IsInt()
  @Min(1)
  secondaryNetQty?: number;

  @IsOptional()
  @IsUUID('4')
  kilcikRawMaterialId?: string;

  @IsOptional()
  @Transform(({ value }) => toPositiveInt(value))
  @IsInt()
  @Min(1)
  kilcikNetQty?: number;

  @IsOptional()
  @IsUUID('4')
  kilcikTypeId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  useGroupExtraCostDefaults?: boolean;

  @ValidateIf((o: CreateCatalogItemDto) => !isSpecialCatalogDto(o))
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GenericRecipeItemDto)
  recipeItems?: GenericRecipeItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GenericExtraCostDto)
  extraCosts?: GenericExtraCostDto[];

  @IsOptional()
  @IsUUID('4')
  copyRecipeFromSizeId?: string;

  @IsOptional()
  @IsIn(['CASH', 'CARD_INSTALLMENT'])
  materialPriceType?: 'CASH' | 'CARD_INSTALLMENT';

  @IsOptional()
  @IsString()
  @MaxLength(240)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason?: string;
}

export function isSpecialCatalogDto(dto: {
  mode?: string;
  productGroupCode?: string;
}): boolean {
  if (dto.mode === 'NEW_GROUP') return false;
  const code = dto.productGroupCode;
  return (
    code != null &&
    (SPECIAL_GROUP_CODES as readonly string[]).includes(code)
  );
}
