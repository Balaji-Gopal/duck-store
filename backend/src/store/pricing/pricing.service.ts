import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PriceBreakdown } from './price-breakdown';
import { PricingRule } from './pricing-rule.interface';
import { OrderContext } from './order-context';
import { BulkDiscountRule } from './bulk-discount.rule';
import { PackagingSurchargeRule } from './packaging-surcharge.rule';
import { DestinationSurchargeRule } from './destination-surcharge.rule';
import { ShippingModeFeeRule } from './shipping-mode-fee.rule';

@Injectable()
export class PricingService {
  private readonly rules: PricingRule[];

  constructor(
    bulkDiscountRule: BulkDiscountRule,
    packagingSurchargeRule: PackagingSurchargeRule,
    destinationSurchargeRule: DestinationSurchargeRule,
    shippingModeFeeRule: ShippingModeFeeRule,
  ) {
    this.rules = [
      bulkDiscountRule,
      packagingSurchargeRule,
      destinationSurchargeRule,
      shippingModeFeeRule,
    ];
  }

  price(unitPrice: Decimal, context: OrderContext) {
    const breakdown = new PriceBreakdown(unitPrice.times(context.quantity));
    for (const rule of this.rules) {
      rule.apply(breakdown, context);
    }
    return breakdown.toResult();
  }
}
