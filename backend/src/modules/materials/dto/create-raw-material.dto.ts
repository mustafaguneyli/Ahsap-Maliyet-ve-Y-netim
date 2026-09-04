import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRawMaterialDto {
  @IsString()
  @IsNotEmpty({ message: 'code boş olamaz.' })
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  code!: string;

  @IsString()
  @IsNotEmpty({ message: 'name boş olamaz.' })
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsNumber({}, { message: 'thicknessMm sayı olmalıdır.' })
  @Min(0.01, { message: 'thicknessMm > 0 olmalıdır.' })
  thicknessMm!: number;

  @IsInt({ message: 'sheetWidthMm tam sayı olmalıdır.' })
  @Min(1, { message: 'sheetWidthMm > 0 olmalıdır.' })
  sheetWidthMm!: number;

  @IsInt({ message: 'sheetLengthMm tam sayı olmalıdır.' })
  @Min(1, { message: 'sheetLengthMm > 0 olmalıdır.' })
  sheetLengthMm!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  surfaceType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  supplierName?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
