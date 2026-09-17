import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PricingRule } from './pricing-rule.interface';
import { PriceBreakdown } from './price-breakdown';
import { OrderContext } from './order-context';
import { ShippingMode } from '../store.types';

@Injectable()
export class ShippingModeFeeRule implements PricingRule {
  apply(breakdown: PriceBreakdown, context: OrderContext): void {
    switch (context.shippingMode) {
      case ShippingMode.SEA:
        breakdown.applyFlatAmount('Sea shipping fee', new Decimal(400));
        break;
      case ShippingMode.LAND:
        breakdown.applyFlatAmount(
          'Land shipping fee',
          new Decimal(10).times(context.quantity),
        );
        break;
      case ShippingMode.AIR: {
        let airFee = new Decimal(30).times(context.quantity);
        if (context.quantity > 1000) {
          airFee = airFee.minus(airFee.times(0.15));
        }
        breakdown.applyFlatAmount('Air shipping fee', airFee);
        break;
      }
    }
  }
}
