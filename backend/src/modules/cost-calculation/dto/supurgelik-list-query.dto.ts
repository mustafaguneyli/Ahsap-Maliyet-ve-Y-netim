import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty } from 'class-validator';
import {
  SUPURGELIK_PRODUCT_CODES,
  type SupurgelikProductCode,
} from '../../../calculation-engine/calculators/supurgelik-mdf-calculator';
import { MaterialPriceTypeQueryDto } from './material-price-type-query.dto';

/** GET /cost-calculation/supurgelik */
export class SupurgelikListQueryDto extends MaterialPriceTypeQueryDto {
  @IsNotEmpty({ message: 'productCode zorunludur.' })
  @IsIn(SUPURGELIK_PRODUCT_CODES, {
    message: 'productCode geçerli bir Süpürgelik ürünü olmalıdır.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productCode!: SupurgelikProductCode;
}
