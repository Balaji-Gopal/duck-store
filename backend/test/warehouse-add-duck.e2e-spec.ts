import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import * as request from 'supertest';
import { createTestApp } from './utils/test-app';
import { truncateDucks } from './utils/reset-db';
import { Duck, DuckColor, DuckSize } from '../src/shared/duck.entity';
import { WarehouseService } from '../src/warehouse/warehouse.service';

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
    const concurrency = 50;

    const responses = await Promise.all(
      Array.from({ length: concurrency }, (_, i) =>
        request(app.getHttpServer())
          .post('/ducks')
          .send({ ...payload, quantity: i + 1 }),
      ),
    );

    expect(responses.every((r) => r.status === 201)).toBe(true);

    const expectedTotal = Array.from({ length: concurrency }, (_, i) => i + 1).reduce(
      (sum, n) => sum + n,
      0,
    );

    const ducks = await dataSource.getRepository(Duck).find({
      where: { color: payload.color as any, size: payload.size as any, price: '12.50' as any },
    });
    expect(ducks).toHaveLength(1);
    expect(ducks[0].quantity).toBe(expectedTotal);
  });

  it('does not clobber a concurrent quantity merge with a stale-read update (regression for read-modify-write races)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/ducks')
      .send({ color: 'Black', size: 'Large', price: 40, quantity: 10 });
    const id = createRes.body.id;

    // Deterministically force the interleaving that exposes the bug: updateDuck is allowed to run
    // its read(s) (capturing quantity=10, the pre-add value) to completion, but its persistence
    // call (save() in the old load->mutate->save() implementation, or update() in the fixed
    // targeted-column implementation) is gated so it cannot execute until the concurrent addDuck
    // request has fully committed its +25 merge. If updateDuck then writes back a full-column
    // save() using the entity loaded before the add committed, it silently overwrites the merged
    // quantity with the stale value. A targeted update() (the fix) only writes the price column,
    // so the add's contribution survives regardless of this interleaving.
    const warehouseService = app.get(WarehouseService);
    const duckRepository = (warehouseService as unknown as { duckRepository: Repository<Duck> })
      .duckRepository;
    const originalSave = duckRepository.save.bind(duckRepository);
    const originalUpdate = duckRepository.update.bind(duckRepository);

    let signalWriteStarted!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      signalWriteStarted = resolve;
    });
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });

    const saveSpy = jest.spyOn(duckRepository, 'save').mockImplementation(((
      ...args: unknown[]
    ) => {
      signalWriteStarted();
      return writeGate.then(() => (originalSave as (...a: unknown[]) => unknown)(...args));
    }) as typeof duckRepository.save);
    const updateSpy = jest.spyOn(duckRepository, 'update').mockImplementation(((
      ...args: unknown[]
    ) => {
      signalWriteStarted();
      return writeGate.then(() => (originalUpdate as (...a: unknown[]) => unknown)(...args));
    }) as typeof duckRepository.update);

    try {
      // supertest's Test object doesn't actually dispatch the HTTP request until it is awaited
      // or `.then()`-ed, so kick it off explicitly here rather than leaving it uninitiated while
      // we wait on writeStarted below.
      const patchPromise = request(app.getHttpServer())
        .patch(`/ducks/${id}`)
        .send({ price: 41 })
        .then((res) => res);

      // Wait until updateDuck has finished its read phase and is blocked on the write call.
      await writeStarted;

      const addRes = await request(app.getHttpServer())
        .post('/ducks')
        .send({ color: 'Black', size: 'Large', price: 40, quantity: 25 });
      expect(addRes.status).toBe(201);
      expect(addRes.body.quantity).toBe(35);

      releaseWrite();
      const patchRes = await patchPromise;

      expect(patchRes.status).toBe(200);

      const finalDuck = await dataSource.getRepository(Duck).findOneByOrFail({ id });
      expect(finalDuck.quantity).toBe(35);
      expect(finalDuck.price).toBe('41.00');
    } finally {
      saveSpy.mockRestore();
      updateSpy.mockRestore();
    }
  });
});
