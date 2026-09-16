import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Duck } from '../shared/duck.entity';
import { toPriceString } from '../shared/duck-price.util';
import { CreateDuckDto } from './dto/create-duck.dto';
import { UpdateDuckDto } from './dto/update-duck.dto';

function isDuplicateKeyError(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = (error as QueryFailedError & { driverError?: { code?: string } })
    .driverError;
  return (
    (error as QueryFailedError & { code?: string }).code === 'ER_DUP_ENTRY' ||
    driverError?.code === 'ER_DUP_ENTRY'
  );
}

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

  async listDucks(): Promise<Duck[]> {
    return this.duckRepository.find({
      where: { deleted: false },
      order: { quantity: 'ASC' },
    });
  }

  async updateDuck(id: number, dto: UpdateDuckDto): Promise<Duck> {
    const duck = await this.duckRepository.findOneBy({ id, deleted: false });
    if (!duck) {
      throw new NotFoundException(`Duck ${id} not found`);
    }

    if (dto.color !== undefined && dto.color !== duck.color) {
      throw new BadRequestException('color is immutable and cannot be changed via edit');
    }
    if (dto.size !== undefined && dto.size !== duck.size) {
      throw new BadRequestException('size is immutable and cannot be changed via edit');
    }

    const changes: Partial<Pick<Duck, 'price' | 'quantity'>> = {};

    if (dto.price !== undefined) {
      const newPrice = toPriceString(dto.price);
      if (newPrice !== duck.price) {
        const collision = await this.duckRepository.findOneBy({
          color: duck.color,
          size: duck.size,
          price: newPrice,
          deleted: false,
        });
        if (collision) {
          throw new ConflictException(
            `A duck with color=${duck.color}, size=${duck.size}, price=${newPrice} already exists ` +
              `(id=${collision.id}). Use "add duck" to merge quantities instead of editing price into a collision.`,
          );
        }
        changes.price = newPrice;
      }
    }

    if (dto.quantity !== undefined) {
      changes.quantity = dto.quantity;
    }

    if (Object.keys(changes).length > 0) {
      try {
        await this.duckRepository.update(id, changes);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new ConflictException(
            `A duck with color=${duck.color}, size=${duck.size}, price=${changes.price ?? duck.price} already exists. ` +
              `Use "add duck" to merge quantities instead of editing price into a collision.`,
          );
        }
        throw error;
      }
    }

    return this.duckRepository.findOneByOrFail({ id });
  }

  async deleteDuck(id: number): Promise<void> {
    const duck = await this.duckRepository.findOneBy({ id, deleted: false });
    if (!duck) {
      throw new NotFoundException(`Duck ${id} not found`);
    }
    await this.duckRepository.update(id, { deleted: true });
  }
}
