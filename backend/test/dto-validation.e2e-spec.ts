import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { createTestApp } from './utils/test-app';
import { truncateDucks } from './utils/reset-db';
import { Duck } from '../src/shared/duck.entity';

describe('DTO validation: quantity must be an integer, price at most 2 decimal places', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  beforeEach(async () => {
    await truncateDucks(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a fractional quantity on POST /ducks', async () => {
    const res = await request(app.getHttpServer())
      .post('/ducks')
      .send({ color: 'Red', size: 'XLarge', price: 200, quantity: 2.5 });

    expect(res.status).toBe(400);
  });

  it('rejects a price with more than 2 decimal places on POST /ducks', async () => {
    const res = await request(app.getHttpServer())
      .post('/ducks')
      .send({ color: 'Red', size: 'XLarge', price: 12.999, quantity: 10 });

    expect(res.status).toBe(400);
  });

  it('rejects a fractional quantity on PATCH /ducks/:id', async () => {
    const repo = dataSource.getRepository(Duck);
    const duck = await repo.save(
      repo.create({ color: 'Red' as any, size: 'XLarge' as any, price: '200.00', quantity: 10 }),
    );

    const res = await request(app.getHttpServer())
      .patch(`/ducks/${duck.id}`)
      .send({ quantity: 3.5 });

    expect(res.status).toBe(400);
  });

  it('rejects a price with more than 2 decimal places on PATCH /ducks/:id', async () => {
    const repo = dataSource.getRepository(Duck);
    const duck = await repo.save(
      repo.create({ color: 'Red' as any, size: 'XLarge' as any, price: '200.00', quantity: 10 }),
    );

    const res = await request(app.getHttpServer())
      .patch(`/ducks/${duck.id}`)
      .send({ price: 199.999 });

    expect(res.status).toBe(400);
  });

  it('rejects a fractional quantity on POST /orders/quote', async () => {
    const repo = dataSource.getRepository(Duck);
    await repo.save(
      repo.create({ color: 'Red' as any, size: 'XLarge' as any, price: '200.00', quantity: 10000 }),
    );

    const res = await request(app.getHttpServer()).post('/orders/quote').send({
      color: 'Red',
      size: 'XLarge',
      quantity: 1.5,
      destinationCountry: 'USA',
      shippingMode: 'Air',
    });

    expect(res.status).toBe(400);
  });
});
