import { IsIn, IsNotEmpty } from 'class-validator';
import { MaterialPriceTypeQueryDto } from './material-price-type-query.dto';

/** GET /cost-calculation/door-frame/mdf */
export class DoorFrameMdfQueryDto extends MaterialPriceTypeQueryDto {
  @IsNotEmpty({ message: 'variant query parametresi 34_MM veya 30_MM olmalıdır.' })
  @IsIn(['34_MM', '30_MM'], {
    message: 'variant query parametresi 34_MM veya 30_MM olmalıdır.',
  })
  variant!: '34_MM' | '30_MM';
}
