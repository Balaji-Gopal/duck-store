import { IsEnum, IsInt, IsNumber, IsPositive, Min } from 'class-validator';
import { DuckColor, DuckSize } from '../../shared/duck.entity';

export class CreateDuckDto {
  @IsEnum(DuckColor)
  color: DuckColor;

  @IsEnum(DuckSize)
  size: DuckSize;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;

  @IsInt()
  @Min(1)
  quantity: number;
}
