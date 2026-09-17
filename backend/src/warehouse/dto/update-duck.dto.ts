import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';
import { DuckColor, DuckSize } from '../../shared/duck.entity';

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
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
