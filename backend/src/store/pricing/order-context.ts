import { ShippingMode } from '../store.types';
import { PackagingStrategy } from '../packaging/packaging-strategy.interface';

export interface OrderContext {
  quantity: number;
  destinationCountry: string;
  shippingMode: ShippingMode;
  packaging: PackagingStrategy;
}
