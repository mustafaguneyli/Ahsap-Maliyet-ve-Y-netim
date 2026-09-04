import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class ReplaceProductionYieldDto {
  @IsInt({ message: 'netQty tam sayı olmalıdır.' })
  @Min(1, { message: 'netQty > 0 olmalıdır.' })
  netQty!: number;

  @IsString()
  @IsNotEmpty({ message: 'Değişiklik sebebi zorunludur.' })
  @MaxLength(1000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason!: string;
}
