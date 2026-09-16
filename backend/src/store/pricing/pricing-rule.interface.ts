import { PriceBreakdown } from './price-breakdown';
import { OrderContext } from './order-context';

export interface PricingRule {
  apply(breakdown: PriceBreakdown, context: OrderContext): void;
}
