import { Injectable } from '@nestjs/common';
import { PricingRule } from './pricing-rule.interface';
import { PriceBreakdown } from './price-breakdown';
import { OrderContext } from './order-context';

@Injectable()
export class PackagingSurchargeRule implements PricingRule {
  apply(breakdown: PriceBreakdown, context: OrderContext): void {
    switch (context.packaging.packageType) {
      case 'Wood':
        breakdown.applyPercentage('Wood packaging surcharge', 5);
        break;
      case 'Plastic':
        breakdown.applyPercentage('Plastic packaging surcharge', 10);
        break;
      case 'Cardboard':
        breakdown.applyPercentage('Cardboard packaging discount', -1);
        break;
    }
  }
}
