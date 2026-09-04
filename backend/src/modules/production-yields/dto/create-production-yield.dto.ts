import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateProductionYieldDto {
  @IsUUID('4', { message: 'rawMaterialId geçerli bir UUID olmalıdır.' })
  @IsNotEmpty()
  rawMaterialId!: string;

  @IsInt({ message: 'pieceWidthMm tam sayı olmalıdır.' })
  @Min(1, { message: 'pieceWidthMm > 0 olmalıdır.' })
  pieceWidthMm!: number;

  @IsInt({ message: 'pieceLengthMm tam sayı olmalıdır.' })
  @Min(1, { message: 'pieceLengthMm > 0 olmalıdır.' })
  pieceLengthMm!: number;

  @IsInt({ message: 'netQty tam sayı olmalıdır.' })
  @Min(1, { message: 'netQty > 0 olmalıdır.' })
  netQty!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
