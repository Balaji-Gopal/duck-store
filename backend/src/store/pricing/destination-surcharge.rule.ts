import { Injectable } from '@nestjs/common';
import { PricingRule } from './pricing-rule.interface';
import { PriceBreakdown } from './price-breakdown';
import { OrderContext } from './order-context';

const SURCHARGE_BY_COUNTRY = new Map<string, number>([
  ['usa', 18],
  ['bolivia', 13],
  ['india', 19],
]);
const DEFAULT_SURCHARGE = 15;

@Injectable()
export class DestinationSurchargeRule implements PricingRule {
  apply(breakdown: PriceBreakdown, context: OrderContext): void {
    const key = context.destinationCountry.trim().toLowerCase();
    const percentage = SURCHARGE_BY_COUNTRY.get(key) ?? DEFAULT_SURCHARGE;
    breakdown.applyPercentage(
      `Destination surcharge (${context.destinationCountry})`,
      percentage,
    );
  }
}
