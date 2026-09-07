import { IsIn, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListExtraCostsQueryDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['door_frame', 'PERVAZ'], {
    message: 'productGroup şu an yalnızca door_frame veya PERVAZ olabilir.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: 'door_frame' | 'PERVAZ';
}
