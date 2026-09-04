import { IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator';

export class CalculateProductionYieldDto {
  @IsUUID('4', { message: 'rawMaterialId geçerli bir UUID olmalıdır.' })
  @IsNotEmpty()
  rawMaterialId!: string;

  @IsInt({ message: 'pieceWidthMm tam sayı olmalıdır.' })
  @Min(1, { message: 'pieceWidthMm > 0 olmalıdır.' })
  pieceWidthMm!: number;

  @IsInt({ message: 'pieceLengthMm tam sayı olmalıdır.' })
  @Min(1, { message: 'pieceLengthMm > 0 olmalıdır.' })
  pieceLengthMm!: number;
}
