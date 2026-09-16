import { Injectable } from '@nestjs/common';
import { PricingRule } from './pricing-rule.interface';
import { PriceBreakdown } from './price-breakdown';
import { OrderContext } from './order-context';

const SURCHARGE_BY_COUNTRY: Record<string, number> = {
  USA: 18,
  Bolivia: 13,
  India: 19,
};
const DEFAULT_SURCHARGE = 15;

@Injectable()
export class DestinationSurchargeRule implements PricingRule {
  apply(breakdown: PriceBreakdown, context: OrderContext): void {
    const percentage =
      SURCHARGE_BY_COUNTRY[context.destinationCountry] ?? DEFAULT_SURCHARGE;
    breakdown.applyPercentage(
      `Destination surcharge (${context.destinationCountry})`,
      percentage,
    );
  }
}
