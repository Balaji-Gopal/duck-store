import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { createTestApp } from './utils/test-app';
import { truncateDucks } from './utils/reset-db';
import { Duck } from '../src/shared/duck.entity';

describe('Warehouse list/edit/delete', () => {
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

  async function seedDuck(overrides: Partial<Duck> = {}): Promise<Duck> {
    const repo = dataSource.getRepository(Duck);
    return repo.save(
      repo.create({
        color: 'Red' as any,
        size: 'XLarge' as any,
        price: '200.00',
        quantity: 10,
        deleted: false,
        ...overrides,
      }),
    );
  }

  it('lists non-deleted ducks sorted by quantity ascending', async () => {
    await seedDuck({ size: 'Large' as any, price: '10.00', quantity: 50 });
    await seedDuck({ size: 'Medium' as any, price: '5.00', quantity: 5 });
    await seedDuck({
      size: 'Small' as any,
      price: '1.00',
      quantity: 20,
      deleted: true,
    });

    const res = await request(app.getHttpServer()).get('/ducks');

    expect(res.status).toBe(200);
    expect(res.body.map((d: Duck) => d.quantity)).toEqual([5, 50]);
  });

  it('edits quantity and price, leaving color/size untouched', async () => {
    const duck = await seedDuck();

    const res = await request(app.getHttpServer())
      .patch(`/ducks/${duck.id}`)
      .send({ price: 250, quantity: 20 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      price: '250.00',
      quantity: 20,
      color: 'Red',
      size: 'XLarge',
    });
  });

  it('rejects an edit that would collide with another active duck at the same color+size+new price', async () => {
    const duck = await seedDuck({ price: '200.00' });
    await seedDuck({ price: '300.00' });

    const res = await request(app.getHttpServer())
      .patch(`/ducks/${duck.id}`)
      .send({ price: 300 });

    expect(res.status).toBe(409);
  });

  it('soft-deletes a duck, which then disappears from the listing', async () => {
    const duck = await seedDuck();

    const del = await request(app.getHttpServer()).delete(`/ducks/${duck.id}`);
    expect(del.status).toBe(204);

    const list = await request(app.getHttpServer()).get('/ducks');
    expect(list.body).toHaveLength(0);

    const stillInDb = await dataSource
      .getRepository(Duck)
      .findOneBy({ id: duck.id });
    expect(stillInDb?.deleted).toBe(true);
  });

  it('returns 404 when editing or deleting a duck that does not exist', async () => {
    const edit = await request(app.getHttpServer())
      .patch('/ducks/999999')
      .send({ price: 1 });
    expect(edit.status).toBe(404);

    const del = await request(app.getHttpServer()).delete('/ducks/999999');
    expect(del.status).toBe(404);
  });
});
