import { Body, Controller, Post } from '@nestjs/common';
import { StoreService } from './store.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('orders')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post('quote')
  quote(@Body() dto: CreateOrderDto) {
    return this.storeService.quoteOrder(dto);
  }
}
