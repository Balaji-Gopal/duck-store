import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { createTestApp } from './utils/test-app';
import { truncateDucks } from './utils/reset-db';
import { Duck, DuckColor, DuckSize } from '../src/shared/duck.entity';

describe('POST /ducks (add duck merge invariant)', () => {
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

  it('creates a new duck when none matches', async () => {
    const res = await request(app.getHttpServer())
      .post('/ducks')
      .send({ color: 'Red', size: 'XLarge', price: 200, quantity: 10 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ color: 'Red', size: 'XLarge', quantity: 10 });
  });

  it('merges quantity into the existing duck for the same color+size+price', async () => {
    await request(app.getHttpServer())
      .post('/ducks')
      .send({ color: 'Red', size: 'XLarge', price: 200, quantity: 10 });

    const res = await request(app.getHttpServer())
      .post('/ducks')
      .send({ color: 'Red', size: 'XLarge', price: 200, quantity: 5 });

    expect(res.status).toBe(201);
    expect(res.body.quantity).toBe(15);

    const ducks = await dataSource.getRepository(Duck).find();
    expect(ducks).toHaveLength(1);
  });

  it('undeletes and merges into a previously soft-deleted duck with the same key', async () => {
    const repo = dataSource.getRepository(Duck);
    await repo.save(
      repo.create({ color: DuckColor.GREEN, size: DuckSize.SMALL, price: '10.00', quantity: 3, deleted: true }),
    );

    const res = await request(app.getHttpServer())
      .post('/ducks')
      .send({ color: 'Green', size: 'Small', price: 10, quantity: 4 });

    expect(res.status).toBe(201);
    expect(res.body.quantity).toBe(7);
    expect(res.body.deleted).toBe(false);
  });

  it('merges quantities correctly when adds for the same duck arrive concurrently', async () => {
    const payload = { color: 'Yellow', size: 'Medium', price: 12.5 };
    await Promise.all([
      request(app.getHttpServer()).post('/ducks').send({ ...payload, quantity: 10 }),
      request(app.getHttpServer()).post('/ducks').send({ ...payload, quantity: 15 }),
      request(app.getHttpServer()).post('/ducks').send({ ...payload, quantity: 5 }),
    ]);

    const ducks = await dataSource.getRepository(Duck).find({
      where: { color: payload.color as any, size: payload.size as any, price: '12.50' as any },
    });
    expect(ducks).toHaveLength(1);
    expect(ducks[0].quantity).toBe(30);
  });
});
