import { IsIn, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListExtraCostsQueryDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['door_frame', 'PERVAZ', 'SUPURGELIK', 'CITA'], {
    message:
      'productGroup şu an yalnızca door_frame, PERVAZ, SUPURGELIK veya CITA olabilir.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: 'door_frame' | 'PERVAZ' | 'SUPURGELIK' | 'CITA';
}
