import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const DECIMAL_TEXT = /^-?(?:0|[1-9]\d*)(?:[.,]\d+)?$/;
const OPTIONAL_DECIMAL = /^(?:0|[1-9]\d*)(?:[.,]\d+)?$/;

export class OrderLineInputDto {
  @IsIn(['CATALOG', 'FREE_TEXT'])
  kind!: 'CATALOG' | 'FREE_TEXT';

  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsString()
  @MinLength(1, { message: 'Ürün adı girilmelidir.' })
  @MaxLength(240)
  productNameText!: string;

  @IsOptional()
  @Matches(OPTIONAL_DECIMAL)
  widthMm?: string;

  @IsOptional()
  @Matches(OPTIONAL_DECIMAL)
  lengthMm?: string;

  @IsOptional()
  @Matches(OPTIONAL_DECIMAL)
  thicknessMm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  decorText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  productionNote?: string;

  @Matches(DECIMAL_TEXT, { message: 'Miktar geçerli bir sayı olmalıdır.' })
  quantity!: string;

  @IsString()
  @MinLength(1, { message: 'Birim girilmelidir.' })
  @MaxLength(20)
  unitText!: string;

  @Matches(DECIMAL_TEXT, { message: 'İskonto yüzdesi geçerli bir sayı olmalıdır.' })
  discountRate!: string;

  @Matches(DECIMAL_TEXT, {
    message: 'Birim fiyat girilmedi. Tanımsız satış fiyatı 0 TL yapılmaz.',
  })
  unitPrice!: string;

  @IsIn(['ENTERED', 'SUGGESTED_CASH', 'SUGGESTED_CARD'])
  priceSource!: 'ENTERED' | 'SUGGESTED_CASH' | 'SUGGESTED_CARD';
}

export class OrderManualMaterialInputDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  lineNo?: number;

  @IsOptional()
  @IsUUID('4')
  rawMaterialId?: string;

  @IsString()
  @MinLength(1, { message: 'Malzeme adı girilmelidir.' })
  @MaxLength(200)
  materialNameText!: string;

  @IsOptional()
  @Matches(OPTIONAL_DECIMAL)
  thicknessMm?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sheetWidthMm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  sheetLengthMm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  surfaceType?: string;

  @Matches(DECIMAL_TEXT, { message: 'Manuel malzeme miktarı geçerli bir sayı olmalıdır.' })
  quantity!: string;

  @IsOptional()
  @Matches(OPTIONAL_DECIMAL)
  pieceQuantity?: string;

  @IsOptional()
  @Matches(OPTIONAL_DECIMAL)
  sheetQuantity?: string;

  @IsString()
  @MinLength(1, { message: 'Malzeme birimi girilmelidir.' })
  @MaxLength(20)
  unitText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  componentRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;

  @IsOptional()
  @IsBoolean()
  unverified?: boolean;
}

export class UpsertOrderDocumentDto {
  @IsString()
  @MinLength(1, { message: 'Müşteri / firma adı girilmelidir.' })
  @MaxLength(200)
  customerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  customerAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxOffice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  documentDateText?: string;

  @Matches(DECIMAL_TEXT, {
    message: 'KDV oranı girilmedi. Boş oran %0 olarak kabul edilmez.',
  })
  vatRate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderLineInputDto)
  lines!: OrderLineInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderManualMaterialInputDto)
  manualMaterials?: OrderManualMaterialInputDto[];
}

export class RecalculateOrderMaterialsDto {
  @Equals(true, { message: 'Yeniden hesaplama için onay gerekir.' })
  confirm!: boolean;
}
