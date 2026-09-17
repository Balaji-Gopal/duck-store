import { IsEnum, IsInt, IsNumber, IsPositive, Max, Min } from 'class-validator';
import { DuckColor, DuckSize } from '../../shared/duck.entity';

// Matches the `duck.price` column's decimal(10,2) precision (8 integer digits, 2
// decimal places) -- keeps out-of-range values a 400 instead of an unhandled DB error.
export const MAX_DUCK_PRICE = 99999999.99;

export class CreateDuckDto {
  @IsEnum(DuckColor)
  color: DuckColor;

  @IsEnum(DuckSize)
  size: DuckSize;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_DUCK_PRICE)
  price: number;

  @IsInt()
  @Min(1)
  quantity: number;
}
