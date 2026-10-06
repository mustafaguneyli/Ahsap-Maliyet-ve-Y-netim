import { Type } from 'class-transformer';
import {
  ArrayUnique,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  DOOR_BUILD_MANUAL_COST_CODES,
  type DoorBuildManualCostCode,
  type DoorBuildManualCostScope,
} from '../../../calculation-engine/calculators/door-build-quote';

const MATERIAL_PRICE_TYPES = ['CASH', 'CARD_INSTALLMENT'] as const;
const SCOPES = ['PER_DOOR', 'ORDER_TOTAL'] as const;
const AMOUNT = /^(?:0|[1-9]\d*)(?:[.,]\d+)?$/;
const POSITIVE_DECIMAL = /^(?:0|[1-9]\d*)(?:[.,]\d+)?$/;
const FRAME_CODES = ['34_MM', '30_MM'] as const;
const PERVAZ_CODES = [
  'AYARLI_PERVAZ',
  'DEKORATIF_PERVAZ',
  'DEKORATIF_PERVAZ_GENIS_KILCIK',
] as const;

export class DoorBuildManualCostLineDto {
  @IsIn([...DOOR_BUILD_MANUAL_COST_CODES], {
    message: 'Manuel gider kodu geçersiz.',
  })
  code!: DoorBuildManualCostCode;

  @IsBoolean({ message: 'included true veya false olmalıdır.' })
  included!: boolean;

  @ValidateIf((o: DoorBuildManualCostLineDto) => o.included === true)
  @IsString({ message: 'Aktif gider için tutar zorunludur.' })
  @Matches(AMOUNT, {
    message: 'Gider tutarı 0 veya pozitif bir sayı olmalıdır.',
  })
  amount?: string;

  @IsIn([...SCOPES], {
    message: 'Gider kapsamı PER_DOOR veya ORDER_TOTAL olmalıdır.',
  })
  scope!: DoorBuildManualCostScope;
}

export class DoorBuildFrameSelectionDto {
  @IsIn([...FRAME_CODES], { message: 'Kasa ürün kodu 34_MM veya 30_MM olmalıdır.' })
  productCode!: (typeof FRAME_CODES)[number];

  @Type(() => Number)
  @IsInt({ message: 'Kasa eni mm tam sayı olmalıdır.' })
  @Min(1)
  widthMm!: number;

  @Type(() => Number)
  @IsInt({ message: 'Kasa boyu mm tam sayı olmalıdır.' })
  @Min(1)
  lengthMm!: number;

  /**
   * Sipariş toplamı kasa miktarı (boy). Örn. 2.5, 7.5.
   * Kapı adediyle tekrar çarpılmaz.
   */
  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message: 'Toplam kasa miktarı (boy) 0 veya pozitif bir sayı olmalıdır; 0 kabul edilmez.',
  })
  totalBoyQuantity!: string;
}

export class DoorBuildPervazSelectionDto {
  @IsIn([...PERVAZ_CODES], { message: 'Pervaz ürün kodu geçersiz.' })
  productCode!: (typeof PERVAZ_CODES)[number];

  @IsString()
  @Matches(POSITIVE_DECIMAL, { message: 'Kalınlık mm geçerli olmalıdır.' })
  thicknessMm!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, { message: 'En mm geçerli olmalıdır.' })
  widthMm!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, { message: 'Boy mm geçerli olmalıdır.' })
  lengthMm!: string;

  /**
   * İstemci gönderebilir; Kapı İmalatı normal pervaz için backend her zaman 4 kullanır.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Yan pervaz adedi tam sayı olmalıdır.' })
  @Min(1, { message: 'Yan pervaz adedi en az 1 olmalıdır.' })
  piecesPerDoor?: number;
}

export class DoorBuildHeaderSelectionDto {
  @IsIn([...PERVAZ_CODES], { message: 'Başlık ürün kodu geçersiz.' })
  productCode!: (typeof PERVAZ_CODES)[number];

  @IsString()
  @Matches(POSITIVE_DECIMAL, { message: 'Kalınlık mm geçerli olmalıdır.' })
  thicknessMm!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, { message: 'En mm geçerli olmalıdır.' })
  widthMm!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, { message: 'Boy mm geçerli olmalıdır.' })
  lengthMm!: string;
}

/** Fiziksel üretim malzemesi — parasal manuel giderlerden ayrıdır. */
export class DoorBuildPhysicalMaterialDto {
  @IsString()
  @MinLength(1, { message: 'Malzeme adı girilmelidir.' })
  @MaxLength(200)
  materialNameText!: string;

  @IsOptional()
  @Matches(POSITIVE_DECIMAL)
  thicknessMm?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sheetWidthMm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sheetLengthMm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  surfaceType?: string;

  @Matches(AMOUNT, { message: 'Malzeme miktarı geçerli bir sayı olmalıdır.' })
  quantity!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unitText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}

export class DoorBuildQuoteDto {
  @Type(() => Number)
  @IsInt({ message: 'Kapı boyu mm cinsinden tam sayı olmalıdır.' })
  @Min(1, { message: 'Kapı boyu pozitif olmalıdır.' })
  doorHeightMm!: number;

  @Type(() => Number)
  @IsInt({ message: 'Kapı eni mm cinsinden tam sayı olmalıdır.' })
  @Min(1, { message: 'Kapı eni pozitif olmalıdır.' })
  doorWidthMm!: number;

  @Type(() => Number)
  @IsInt({ message: 'Kapı adedi pozitif tam sayı olmalıdır.' })
  @Min(1, { message: 'Kapı adedi 1 veya daha büyük olmalıdır.' })
  quantity!: number;

  @IsUUID('4', { message: 'surfaceRawMaterialId geçerli bir UUID olmalıdır.' })
  surfaceRawMaterialId!: string;

  @IsOptional()
  @IsIn([...MATERIAL_PRICE_TYPES], {
    message: 'materialPriceType CASH veya CARD_INSTALLMENT olmalıdır.',
  })
  materialPriceType?: (typeof MATERIAL_PRICE_TYPES)[number];

  @IsOptional()
  @ValidateNested()
  @Type(() => DoorBuildFrameSelectionDto)
  frame?: DoorBuildFrameSelectionDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => DoorBuildPervazSelectionDto)
  sideTrims?: DoorBuildPervazSelectionDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => DoorBuildHeaderSelectionDto)
  header?: DoorBuildHeaderSelectionDto | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DoorBuildManualCostLineDto)
  @ArrayUnique((line: DoorBuildManualCostLineDto) => line.code, {
    message: 'Aynı manuel gider iki kez eklenemez.',
  })
  manualCostLines!: DoorBuildManualCostLineDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DoorBuildPhysicalMaterialDto)
  physicalMaterials?: DoorBuildPhysicalMaterialDto[];

  /** Kapı İmalatı kâr % — boşsa nihai satış hesaplanmaz. 0 kabul. */
  @IsOptional()
  @Matches(AMOUNT, { message: 'Kâr oranı geçerli bir sayı olmalıdır.' })
  profitRate?: string;

  /** Kapı İmalatı KDV % — boşsa nihai satış hesaplanmaz. 0 kabul. */
  @IsOptional()
  @Matches(AMOUNT, { message: 'KDV oranı geçerli bir sayı olmalıdır.' })
  vatRate?: string;

  /**
   * Müşteri kart/taksit satış farkı (%).
   * materialPriceType ile karıştırılmaz. Boşsa cardSale null.
   */
  @IsOptional()
  @Matches(AMOUNT, { message: 'Kart/taksit oranı geçerli bir sayı olmalıdır.' })
  cardMarkupRate?: string;
}

export class DoorBuildOrderTransferDto {
  @ValidateNested()
  @Type(() => DoorBuildQuoteDto)
  quote!: DoorBuildQuoteDto;

  /**
   * CASH → quote.cashSale, CARD → quote.cardSale, MANUAL → unitPrice.
   * Seçilmeden birim fiyat yazılmaz.
   */
  @IsIn(['CASH', 'CARD', 'MANUAL'], {
    message: 'salePriceSource CASH, CARD veya MANUAL olmalıdır.',
  })
  salePriceSource!: 'CASH' | 'CARD' | 'MANUAL';

  @IsOptional()
  @Matches(AMOUNT, {
    message: 'Manuel birim satış fiyatı girilmelidir.',
  })
  unitPrice?: string;

  @IsOptional()
  @Matches(AMOUNT)
  discountRate?: string;

  @Matches(AMOUNT, { message: 'Sipariş KDV oranı girilmelidir.' })
  vatRate!: string;

  @IsString()
  @MinLength(1)
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
}
