import { IsIn, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListExtraCostsQueryDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['door_frame'], { message: 'productGroup şu an yalnızca door_frame olabilir.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: 'door_frame';
}
