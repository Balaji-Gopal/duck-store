import { IsEnum, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';
import { DuckColor, DuckSize } from '../../shared/duck.entity';

export class UpdateDuckDto {
  @IsOptional()
  @IsEnum(DuckColor)
  color?: DuckColor;

  @IsOptional()
  @IsEnum(DuckSize)
  size?: DuckSize;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}
