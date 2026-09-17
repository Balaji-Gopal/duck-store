import { Injectable } from '@nestjs/common';
import { PackagingStrategy } from './packaging-strategy.interface';
import { ShippingMode } from '../store.types';

@Injectable()
export class PlasticPackagingStrategy implements PackagingStrategy {
  readonly packageType = 'Plastic' as const;

  protectionFor(shippingMode: ShippingMode): string[] {
    switch (shippingMode) {
      case ShippingMode.AIR:
        return ['Bubble-wrap bags'];
      case ShippingMode.SEA:
        return ['Moisture-absorbing beads', 'Bubble-wrap bags'];
      case ShippingMode.LAND:
      default:
        return ['Polystyrene balls'];
    }
  }
}
