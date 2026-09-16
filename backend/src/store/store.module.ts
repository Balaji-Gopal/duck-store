import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Duck } from '../shared/duck.entity';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { PackagingResolver } from './packaging/packaging.resolver';
import { WoodPackagingStrategy } from './packaging/wood-packaging.strategy';
import { CardboardPackagingStrategy } from './packaging/cardboard-packaging.strategy';
import { PlasticPackagingStrategy } from './packaging/plastic-packaging.strategy';
import { PricingService } from './pricing/pricing.service';
import { BulkDiscountRule } from './pricing/bulk-discount.rule';
import { PackagingSurchargeRule } from './pricing/packaging-surcharge.rule';
import { DestinationSurchargeRule } from './pricing/destination-surcharge.rule';
import { ShippingModeFeeRule } from './pricing/shipping-mode-fee.rule';

@Module({
  imports: [TypeOrmModule.forFeature([Duck])],
  controllers: [StoreController],
  providers: [
    StoreService,
    PackagingResolver,
    WoodPackagingStrategy,
    CardboardPackagingStrategy,
    PlasticPackagingStrategy,
    PricingService,
    BulkDiscountRule,
    PackagingSurchargeRule,
    DestinationSurchargeRule,
    ShippingModeFeeRule,
  ],
})
export class StoreModule {}
