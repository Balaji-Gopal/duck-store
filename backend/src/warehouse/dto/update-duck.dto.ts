import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { DuckColor, DuckSize } from '../../shared/duck.entity';
import { MAX_DUCK_PRICE } from './create-duck.dto';

export class UpdateDuckDto {
  @IsOptional()
  @IsEnum(DuckColor)
  color?: DuckColor;

  @IsOptional()
  @IsEnum(DuckSize)
  size?: DuckSize;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_DUCK_PRICE)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
