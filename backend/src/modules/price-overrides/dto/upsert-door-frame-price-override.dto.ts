import { IsIn, IsNotEmpty, IsOptional, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpsertDoorFramePriceOverrideDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['door_frame'], { message: 'productGroup şu an yalnızca door_frame olabilir.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: 'door_frame';

  @IsNotEmpty({ message: 'Nakit satış fiyatı zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Nakit satış fiyatı geçerli bir Decimal olmalıdır (örn. 300).',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(',', '.') : value))
  cashPrice!: string;

  @IsOptional()
  @MaxLength(500, { message: 'Değişiklik sebebi en fazla 500 karakter olabilir.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason?: string;
}
