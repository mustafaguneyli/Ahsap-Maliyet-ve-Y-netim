import { Module } from '@nestjs/common';
import { PervazQtyService } from './pervaz-qty.service';

@Module({
  providers: [PervazQtyService],
  exports: [PervazQtyService],
})
export class PervazModule {}
