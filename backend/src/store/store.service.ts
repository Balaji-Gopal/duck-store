import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { Duck } from '../shared/duck.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { PackagingResolver } from './packaging/packaging.resolver';
import { PricingService } from './pricing/pricing.service';
import { OrderContext } from './pricing/order-context';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Duck) private readonly duckRepository: Repository<Duck>,
    private readonly packagingResolver: PackagingResolver,
    private readonly pricingService: PricingService,
  ) {}

  async quoteOrder(dto: CreateOrderDto) {
    const duck = await this.duckRepository.findOne({
      where: { color: dto.color, size: dto.size, deleted: false },
      order: { price: 'ASC' },
    });
    if (!duck) {
      throw new NotFoundException(
        `No active duck found for color=${dto.color}, size=${dto.size}`,
      );
    }

    const packaging = this.packagingResolver.resolve(dto.size);
    const context: OrderContext = {
      quantity: dto.quantity,
      destinationCountry: dto.destinationCountry,
      shippingMode: dto.shippingMode,
      packaging,
    };

    const { totalToPay, breakdown } = this.pricingService.price(
      new Decimal(duck.price),
      context,
    );

    return {
      packageType: packaging.packageType,
      protectionTypes: packaging.protectionFor(dto.shippingMode),
      totalToPay,
      breakdown,
    };
  }
}
