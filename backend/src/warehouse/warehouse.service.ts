import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Duck } from '../shared/duck.entity';
import { toPriceString } from '../shared/duck-price.util';
import { CreateDuckDto } from './dto/create-duck.dto';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(Duck) private readonly duckRepository: Repository<Duck>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async addDuck(dto: CreateDuckDto): Promise<Duck> {
    const price = toPriceString(dto.price);

    await this.dataSource.query(
      `INSERT INTO duck (color, size, price, quantity, deleted)
       VALUES (?, ?, ?, ?, false)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity), deleted = false`,
      [dto.color, dto.size, price, dto.quantity],
    );

    return this.duckRepository.findOneByOrFail({
      color: dto.color,
      size: dto.size,
      price,
    });
  }
}
