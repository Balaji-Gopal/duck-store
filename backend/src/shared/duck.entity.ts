import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

export enum DuckColor {
  RED = 'Red',
  GREEN = 'Green',
  YELLOW = 'Yellow',
  BLACK = 'Black',
}

export enum DuckSize {
  XLARGE = 'XLarge',
  LARGE = 'Large',
  MEDIUM = 'Medium',
  SMALL = 'Small',
  XSMALL = 'XSmall',
}

@Entity('duck')
@Unique('UQ_duck_color_size_price', ['color', 'size', 'price'])
export class Duck {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: DuckColor })
  color: DuckColor;

  @Column({ type: 'enum', enum: DuckSize })
  size: DuckSize;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;
}
