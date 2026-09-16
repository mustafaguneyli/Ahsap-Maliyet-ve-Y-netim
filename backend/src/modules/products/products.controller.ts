import { Controller, Get } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('product-groups')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  listActiveGroups() {
    return this.productsService.listActiveGroups();
  }
}
