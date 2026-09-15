import { IsIn, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListPricingThicknessModifiersQueryDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['SUPURGELIK'], {
    message: 'productGroup şu an yalnızca SUPURGELIK olabilir.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: 'SUPURGELIK';
}
