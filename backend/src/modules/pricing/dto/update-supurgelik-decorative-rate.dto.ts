import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, Matches } from 'class-validator';
import { SUPURGELIK_MANAGED_DECORATIVE_THICKNESSES } from '../supurgelik-decorative-thicknesses';

/** SUPURGELIK grup + kalınlık dekoratif oranı. 8/9/10 mm oluşturmaz. */
export class UpdateSupurgelikDecorativeRateDto {
  @IsNotEmpty({ message: 'productGroup zorunludur.' })
  @IsIn(['SUPURGELIK'], {
    message: 'productGroup Süpürgelik için SUPURGELIK olmalıdır.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productGroup!: 'SUPURGELIK';

  @Type(() => Number)
  @IsInt({ message: 'thicknessMm tam sayı olmalıdır.' })
  @IsIn([...SUPURGELIK_MANAGED_DECORATIVE_THICKNESSES], {
    message: 'Dekoratif oran yalnız 12, 14 veya 18 mm için güncellenebilir.',
  })
  thicknessMm!: (typeof SUPURGELIK_MANAGED_DECORATIVE_THICKNESSES)[number];

  @IsNotEmpty({ message: 'Dekoratif oran zorunludur.' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'Dekoratif oran geçerli bir Decimal olmalıdır (örn. 25).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(',', '.') : value,
  )
  rate!: string;
}
