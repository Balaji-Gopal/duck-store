import { DuckSize } from '../../shared/duck.entity';
import { ShippingMode } from '../store.types';
import { PackagingResolver } from './packaging.resolver';
import { WoodPackagingStrategy } from './wood-packaging.strategy';
import { CardboardPackagingStrategy } from './cardboard-packaging.strategy';
import { PlasticPackagingStrategy } from './plastic-packaging.strategy';

describe('PackagingResolver', () => {
  const resolver = new PackagingResolver(
    new WoodPackagingStrategy(),
    new CardboardPackagingStrategy(),
    new PlasticPackagingStrategy(),
  );

  it.each([
    [DuckSize.XLARGE, 'Wood'],
    [DuckSize.LARGE, 'Wood'],
    [DuckSize.MEDIUM, 'Cardboard'],
    [DuckSize.SMALL, 'Plastic'],
    [DuckSize.XSMALL, 'Plastic'],
  ])('maps size %s to package type %s', (size, expected) => {
    expect(resolver.resolve(size).packageType).toBe(expected);
  });

  it.each([
    ['Wood' as const, ShippingMode.AIR, ['Polystyrene balls']],
    ['Wood' as const, ShippingMode.LAND, ['Polystyrene balls']],
    ['Wood' as const, ShippingMode.SEA, ['Moisture-absorbing beads', 'Bubble-wrap bags']],
    ['Cardboard' as const, ShippingMode.AIR, ['Polystyrene balls']],
    ['Cardboard' as const, ShippingMode.LAND, ['Polystyrene balls']],
    ['Cardboard' as const, ShippingMode.SEA, ['Moisture-absorbing beads', 'Bubble-wrap bags']],
    ['Plastic' as const, ShippingMode.AIR, ['Bubble-wrap bags']],
    ['Plastic' as const, ShippingMode.LAND, ['Polystyrene balls']],
    ['Plastic' as const, ShippingMode.SEA, ['Moisture-absorbing beads', 'Bubble-wrap bags']],
  ])('%s package under %s shipping needs %s', (packageType, mode, expected) => {
    const strategyBySize = {
      Wood: DuckSize.LARGE,
      Cardboard: DuckSize.MEDIUM,
      Plastic: DuckSize.SMALL,
    }[packageType];
    expect(resolver.resolve(strategyBySize).protectionFor(mode)).toEqual(expected);
  });
});
