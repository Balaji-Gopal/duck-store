import { Injectable } from '@nestjs/common';
import { PackagingStrategy } from './packaging-strategy.interface';
import { ShippingMode } from '../store.types';

@Injectable()
export class WoodPackagingStrategy implements PackagingStrategy {
  readonly packageType = 'Wood' as const;

  protectionFor(shippingMode: ShippingMode): string[] {
    switch (shippingMode) {
      case ShippingMode.SEA:
        return ['Moisture-absorbing beads', 'Bubble-wrap bags'];
      case ShippingMode.AIR:
      case ShippingMode.LAND:
      default:
        return ['Polystyrene balls'];
    }
  }
}
