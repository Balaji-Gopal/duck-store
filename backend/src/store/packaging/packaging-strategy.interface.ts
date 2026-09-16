import { ShippingMode } from '../store.types';

export interface PackagingStrategy {
  readonly packageType: 'Wood' | 'Cardboard' | 'Plastic';
  protectionFor(shippingMode: ShippingMode): string[];
}
