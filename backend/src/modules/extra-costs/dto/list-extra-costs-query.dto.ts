import { IsIn, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListExtraCostsQueryDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['door_frame', 'PERVAZ', 'SUPURGELIK'], {
    message: 'productGroup şu an yalnızca door_frame, PERVAZ veya SUPURGELIK olabilir.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: 'door_frame' | 'PERVAZ' | 'SUPURGELIK';
}
