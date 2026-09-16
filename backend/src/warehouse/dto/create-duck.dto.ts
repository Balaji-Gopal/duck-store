import { IsEnum, IsNumber, IsPositive, Min } from 'class-validator';
import { DuckColor, DuckSize } from '../../shared/duck.entity';

export class CreateDuckDto {
  @IsEnum(DuckColor)
  color: DuckColor;

  @IsEnum(DuckSize)
  size: DuckSize;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsNumber()
  @Min(1)
  quantity: number;
}
