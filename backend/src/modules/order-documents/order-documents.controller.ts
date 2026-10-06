import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ListOrderDocumentsQueryDto } from './dto/list-order-documents-query.dto';
import {
  RecalculateOrderMaterialsDto,
  UpsertOrderDocumentDto,
} from './dto/upsert-order-document.dto';
import { OrderDocumentsService } from './order-documents.service';

@Controller('order-documents')
export class OrderDocumentsController {
  constructor(private readonly orderDocumentsService: OrderDocumentsService) {}

  @Get('catalog')
  catalog() {
    return this.orderDocumentsService.catalog();
  }

  @Get()
  list(@Query() query: ListOrderDocumentsQueryDto) {
    return this.orderDocumentsService.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orderDocumentsService.get(id);
  }

  @Post('preview')
  preview(@Body() dto: UpsertOrderDocumentDto) {
    return this.orderDocumentsService.preview(dto);
  }

  @Post()
  create(@Body() dto: UpsertOrderDocumentDto) {
    return this.orderDocumentsService.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertOrderDocumentDto) {
    return this.orderDocumentsService.update(id, dto);
  }

  @Post(':id/materials/recalculate')
  recalculate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecalculateOrderMaterialsDto,
  ) {
    if (dto.confirm !== true) {
      throw new BadRequestException('Yeniden hesaplama için onay gerekir.');
    }
    return this.orderDocumentsService.recalculateMaterials(id);
  }

  @Get(':id/prints/customer-priced.html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async customerHtml(@Param('id', ParseUUIDPipe) id: string) {
    const print = await this.orderDocumentsService.customerPrint(id);
    return print.html;
  }

  @Get(':id/prints/workshop-material.html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async workshopHtml(@Param('id', ParseUUIDPipe) id: string) {
    const print = await this.orderDocumentsService.workshopPrint(id);
    return print.html;
  }

  @Get(':id/prints/combined.html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async combinedHtml(@Param('id', ParseUUIDPipe) id: string) {
    const print = await this.orderDocumentsService.combinedPrint(id);
    return print.html;
  }
}
