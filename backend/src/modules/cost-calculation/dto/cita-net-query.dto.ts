import { Transform } from 'class-transformer';
import { IsNotEmpty } from 'class-validator';

function trimQuery(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** GET /cost-calculation/cita/net ve /cita/mdf — internal ölçüler mm, Decimal string. */
export class CitaNetQueryDto {
  @IsNotEmpty({ message: 'thicknessMm zorunludur.' })
  @Transform(({ value }) => trimQuery(value))
  thicknessMm!: string;

  @IsNotEmpty({ message: 'widthMm zorunludur.' })
  @Transform(({ value }) => trimQuery(value))
  widthMm!: string;

  @IsNotEmpty({ message: 'lengthMm zorunludur.' })
  @Transform(({ value }) => trimQuery(value))
  lengthMm!: string;
}
