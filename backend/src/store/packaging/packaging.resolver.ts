import { Injectable } from '@nestjs/common';
import { DuckSize } from '../../shared/duck.entity';
import { PackagingStrategy } from './packaging-strategy.interface';
import { WoodPackagingStrategy } from './wood-packaging.strategy';
import { CardboardPackagingStrategy } from './cardboard-packaging.strategy';
import { PlasticPackagingStrategy } from './plastic-packaging.strategy';

@Injectable()
export class PackagingResolver {
  constructor(
    private readonly wood: WoodPackagingStrategy,
    private readonly cardboard: CardboardPackagingStrategy,
    private readonly plastic: PlasticPackagingStrategy,
  ) {}

  resolve(size: DuckSize): PackagingStrategy {
    switch (size) {
      case DuckSize.XLARGE:
      case DuckSize.LARGE:
        return this.wood;
      case DuckSize.MEDIUM:
        return this.cardboard;
      case DuckSize.SMALL:
      case DuckSize.XSMALL:
      default:
        return this.plastic;
    }
  }
}
