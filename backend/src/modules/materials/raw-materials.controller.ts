import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateRawMaterialDto } from './dto/create-raw-material.dto';
import { ListRawMaterialsQueryDto } from './dto/list-raw-materials-query.dto';
import { UpdateRawMaterialDto } from './dto/update-raw-material.dto';
import { UpdateRawMaterialPricesDto } from './dto/update-raw-material-prices.dto';
import { RawMaterialsService } from './raw-materials.service';

@Controller('raw-materials')
export class RawMaterialsController {
  constructor(private readonly rawMaterialsService: RawMaterialsService) {}

  @Get()
  findAll(@Query() query: ListRawMaterialsQueryDto) {
    return this.rawMaterialsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rawMaterialsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRawMaterialDto) {
    return this.rawMaterialsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRawMaterialDto) {
    return this.rawMaterialsService.update(id, dto);
  }

  /** Mevcut açık fiyat dönemlerini kapatır; yeni CASH + CARD_INSTALLMENT kayıtları oluşturur. */
  @Post(':id/prices')
  updatePrices(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRawMaterialPricesDto,
  ) {
    return this.rawMaterialsService.updatePrices(id, dto);
  }

  /** Hard delete yok; isActive=false soft deactivate. */
  @Delete(':id')
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.rawMaterialsService.deactivate(id);
  }
}
