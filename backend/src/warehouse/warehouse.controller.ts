import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { CreateDuckDto } from './dto/create-duck.dto';
import { UpdateDuckDto } from './dto/update-duck.dto';

@Controller('ducks')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get()
  list() {
    return this.warehouseService.listDucks();
  }

  @Post()
  add(@Body() dto: CreateDuckDto) {
    return this.warehouseService.addDuck(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDuckDto) {
    return this.warehouseService.updateDuck(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.warehouseService.deleteDuck(id);
  }
}
