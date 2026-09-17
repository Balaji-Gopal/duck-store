import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { createTestApp } from './utils/test-app';
import { truncateDucks } from './utils/reset-db';
import { Duck } from '../src/shared/duck.entity';

describe('POST /orders/quote', () => {
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

  it('prices a wood-packaged air order to the destination and shipping rules', async () => {
    const repo = dataSource.getRepository(Duck);
    await repo.save(
      repo.create({
        color: 'Red' as any,
        size: 'XLarge' as any,
        price: '50.00',
        quantity: 10000,
      }),
    );

    const res = await request(app.getHttpServer()).post('/orders/quote').send({
      color: 'Red',
      size: 'XLarge',
      quantity: 150,
      destinationCountry: 'USA',
      shippingMode: 'Air',
    });

    expect(res.status).toBe(201);
    expect(res.body.unitPrice).toBe('50.00');
    expect(res.body.packageType).toBe('Wood');
    expect(res.body.protectionTypes).toEqual(['Polystyrene balls']);
    expect(res.body.totalToPay).toBe(11934);
    expect(res.body.breakdown).toHaveLength(5);
    expect(res.body.breakdown[0]).toEqual({ label: 'Base (150 x 50.00)', amount: '+7500.00' });

    // every breakdown line item sums exactly to totalToPay -- the response is
    // self-reconciling, not just a total with unexplained deltas.
    const sum = res.body.breakdown.reduce(
      (acc: number, item: { amount: string }) => acc + Number(item.amount),
      0,
    );
    expect(Number(sum.toFixed(2))).toBe(res.body.totalToPay);
  });

  it('resolves to the cheapest active price when more than one duck matches color+size', async () => {
    const repo = dataSource.getRepository(Duck);
    await repo.save(
      repo.create({
        color: 'Black' as any,
        size: 'Small' as any,
        price: '9.00',
        quantity: 100,
      }),
    );
    await repo.save(
      repo.create({
        color: 'Black' as any,
        size: 'Small' as any,
        price: '5.00',
        quantity: 100,
      }),
    );

    const res = await request(app.getHttpServer()).post('/orders/quote').send({
      color: 'Black',
      size: 'Small',
      quantity: 1,
      destinationCountry: 'Other',
      shippingMode: 'Land',
    });

    // base = 5.00 * 1 = 5; plastic +10% = 5.5; destination +15% = 6.325; land +10/unit = 16.325 -> 16.33 (bankers-neutral round)
    expect(res.status).toBe(201);
    expect(res.body.unitPrice).toBe('5.00'); // proves the cheapest active price (not 9.00) was resolved
    expect(res.body.totalToPay).toBeCloseTo(16.33, 2);
  });

  it('returns 404 when no active duck matches the requested color+size', async () => {
    const res = await request(app.getHttpServer()).post('/orders/quote').send({
      color: 'Yellow',
      size: 'XSmall',
      quantity: 1,
      destinationCountry: 'USA',
      shippingMode: 'Sea',
    });

    expect(res.status).toBe(404);
  });
});
