import { IsNumber, IsOptional, IsPositive, Min } from 'class-validator';

export class UpdateDuckDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}
