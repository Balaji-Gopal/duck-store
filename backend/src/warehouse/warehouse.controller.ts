import { Body, Controller, Post } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { CreateDuckDto } from './dto/create-duck.dto';

@Controller('ducks')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  add(@Body() dto: CreateDuckDto) {
    return this.warehouseService.addDuck(dto);
  }
}
