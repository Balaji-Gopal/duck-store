import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
} from 'class-validator';
import { DuckColor, DuckSize } from '../../shared/duck.entity';
import { ShippingMode } from '../store.types';

export class CreateOrderDto {
  @IsEnum(DuckColor)
  color: DuckColor;

  @IsEnum(DuckSize)
  size: DuckSize;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsString()
  @IsNotEmpty()
  destinationCountry: string;

  @IsEnum(ShippingMode)
  shippingMode: ShippingMode;
}
