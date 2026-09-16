import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListAuditEventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit tam sayı olmalıdır.' })
  @Min(1, { message: 'limit en az 1 olmalıdır.' })
  @Max(50, { message: 'limit en fazla 50 olabilir.' })
  limit?: number;
}
