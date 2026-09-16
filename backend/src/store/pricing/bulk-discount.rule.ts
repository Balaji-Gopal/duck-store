import { Injectable } from '@nestjs/common';
import { PricingRule } from './pricing-rule.interface';
import { PriceBreakdown } from './price-breakdown';
import { OrderContext } from './order-context';

@Injectable()
export class BulkDiscountRule implements PricingRule {
  apply(breakdown: PriceBreakdown, context: OrderContext): void {
    if (context.quantity > 100) {
      breakdown.applyPercentage('Bulk discount (>100 units)', -20);
    }
  }
}
