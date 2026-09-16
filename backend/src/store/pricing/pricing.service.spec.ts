import Decimal from 'decimal.js';
import { ShippingMode } from '../store.types';
import { WoodPackagingStrategy } from '../packaging/wood-packaging.strategy';
import { PricingService } from './pricing.service';
import { BulkDiscountRule } from './bulk-discount.rule';
import { PackagingSurchargeRule } from './packaging-surcharge.rule';
import { DestinationSurchargeRule } from './destination-surcharge.rule';
import { ShippingModeFeeRule } from './shipping-mode-fee.rule';
import { OrderContext } from './order-context';

describe('PricingService', () => {
  const pricingService = new PricingService(
    new BulkDiscountRule(),
    new PackagingSurchargeRule(),
    new DestinationSurchargeRule(),
    new ShippingModeFeeRule(),
  );

  it('applies bulk discount, wood surcharge, destination surcharge, and air fee in order, to the cent', () => {
    const context: OrderContext = {
      quantity: 150,
      destinationCountry: 'USA',
      shippingMode: ShippingMode.AIR,
      packaging: new WoodPackagingStrategy(),
    };

    const result = pricingService.price(new Decimal(50), context);

    // base: 50 * 150 = 7500
    // bulk discount -20%:      7500 - 1500 = 6000
    // wood surcharge +5%:      6000 +  300 = 6300
    // destination USA +18%:    6300 + 1134 = 7434
    // air fee (150 units, no >1000 reduction): 30 * 150 = 4500 -> 7434 + 4500 = 11934
    expect(result.totalToPay).toBe(11934);
    expect(result.breakdown).toEqual([
      { label: 'Bulk discount (>100 units)', amount: '-1500.00' },
      { label: 'Wood packaging surcharge', amount: '+300.00' },
      { label: 'Destination surcharge (USA)', amount: '+1134.00' },
      { label: 'Air shipping fee', amount: '+4500.00' },
    ]);
  });

  it('does not apply the bulk discount at or under 100 units', () => {
    const context: OrderContext = {
      quantity: 100,
      destinationCountry: 'Germany',
      shippingMode: ShippingMode.LAND,
      packaging: new WoodPackagingStrategy(),
    };

    const result = pricingService.price(new Decimal(10), context);
    expect(
      result.breakdown.find((i) => i.label.includes('Bulk discount')),
    ).toBeUndefined();
  });

  it('reduces the air fee by 15% for orders exceeding 1000 units', () => {
    const context: OrderContext = {
      quantity: 1200,
      destinationCountry: 'Other',
      shippingMode: ShippingMode.AIR,
      packaging: new WoodPackagingStrategy(),
    };

    const result = pricingService.price(new Decimal(1), context);
    const airFee = result.breakdown.find((i) => i.label === 'Air shipping fee');
    // 30 * 1200 = 36000, reduced 15% -> 30600.00
    expect(airFee?.amount).toBe('+30600.00');
  });

  it('applies the flat sea fee and the default 15% destination surcharge for unlisted countries', () => {
    const context: OrderContext = {
      quantity: 10,
      destinationCountry: 'Kenya',
      shippingMode: ShippingMode.SEA,
      packaging: new WoodPackagingStrategy(),
    };

    const result = pricingService.price(new Decimal(20), context);
    // base: 20 * 10 = 200
    // wood surcharge +5%:            200 +  10 = 210
    // destination Kenya (default 15%) on running total: 210 * 15% = 31.50 -> 241.50
    expect(result.breakdown).toContainEqual({
      label: 'Destination surcharge (Kenya)',
      amount: '+31.50',
    });
    expect(result.breakdown).toContainEqual({
      label: 'Sea shipping fee',
      amount: '+400.00',
    });
  });
});
