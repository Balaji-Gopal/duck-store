# Duck Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Duck Store coding exercise — a NestJS+MySQL warehouse CRUD module with a React UI, and a stateless order-pricing/packaging REST endpoint — matching the Digital Harbor spec exactly, including its concurrency invariant and design-pattern requirements.

**Architecture:** A single NestJS application with two feature modules (`warehouse`, `store`) sharing one MySQL database via TypeORM, plus a separate React (Vite) frontend for the warehouse UI only. Packaging decisions use the Strategy pattern; pricing math uses Chain of Responsibility. Money math uses `decimal.js` throughout to guarantee cent-accurate totals.

**Tech Stack:** NestJS (TypeScript), TypeORM + MySQL 8 (via Docker Compose), `decimal.js`, class-validator; React + Vite + TypeScript frontend; Jest + Supertest (backend), Vitest + React Testing Library (frontend).

**Spec:** [docs/superpowers/specs/2026-09-16-duck-store-design.md](../specs/2026-09-16-duck-store-design.md)

## Global Constraints

- Duck entity fields exactly: `id` (int, PK), `color` (enum: Red, Green, Yellow, Black), `size` (enum: XLarge, Large, Medium, Small, XSmall), `price` (decimal, USD), `quantity` (int), `deleted` (boolean).
- Warehouse API: `GET /ducks`, `POST /ducks`, `PATCH /ducks/:id`, `DELETE /ducks/:id`. List excludes deleted ducks, sorted by quantity.
- Add-duck merge invariant (same color+size+price merges quantity instead of duplicating) must hold under **concurrent** requests — verified with an integration test against a real MySQL instance, not mocks.
- Edit only allows changing `quantity` and `price`; `color`/`size` are immutable.
- Delete is logical (`deleted = true`); deleted ducks never appear in `GET /ducks`.
- Store module is backend-only: one endpoint, `POST /orders/quote`, no UI.
- Packaging rules (size × shipping mode → package type + protection filler) implemented as a Strategy pattern.
- Pricing rules (bulk discount, packaging surcharge, destination surcharge, shipping fee) implemented as a Chain of Responsibility, and the response must include an itemized breakdown of every discount/increment applied.
- All monetary math done via `decimal.js` — no raw floating-point arithmetic on prices.
- README must document every ambiguity decision from the spec (§5 undelete-on-re-add, §6 sort direction, §7a price resolution, plus the edit-price-collision rule decided in Task 4 below).
- No stock reservation/decrement on order placement; no store-module UI; no multi-service split; no auth — all explicitly out of scope per the spec.

---

### Task 1: Backend scaffolding — NestJS boots against MySQL

**Files:**
- Create: `backend/` (via Nest CLI)
- Create: `docker-compose.yml`
- Create: `backend/docker/init-test-db.sql`
- Create: `backend/.env.example`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/main.ts`
- Create: `backend/src/data-source.ts`
- Create: `.gitignore` (repo root)

**Interfaces:**
- Produces: a running Nest app on port 3000, connected to MySQL via `ConfigService`-driven `TypeOrmModule.forRootAsync`, and `AppDataSource` (a `DataSource` instance in `backend/src/data-source.ts`) for the TypeORM CLI to use for migrations.

- [ ] **Step 1: Scaffold the Nest app**

Run from the repo root:
```bash
npx @nestjs/cli@10 new backend --package-manager npm --skip-git
```

- [ ] **Step 2: Install runtime and dev dependencies**

```bash
cd backend
npm install @nestjs/typeorm typeorm mysql2 @nestjs/config class-validator class-transformer decimal.js
npm install --save-dev supertest @types/supertest
cd ..
```

- [ ] **Step 3: Add Docker Compose for local MySQL**

Create `docker-compose.yml` at the repo root:
```yaml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: duck_store
      MYSQL_USER: duck_store
      MYSQL_PASSWORD: duck_store
    ports:
      - '3306:3306'
    volumes:
      - duck-store-mysql-data:/var/lib/mysql
      - ./backend/docker/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql
volumes:
  duck-store-mysql-data:
```

Create `backend/docker/init-test-db.sql` (creates the second schema used only by integration tests):
```sql
CREATE DATABASE IF NOT EXISTS duck_store_test;
GRANT ALL PRIVILEGES ON duck_store_test.* TO 'duck_store'@'%';
FLUSH PRIVILEGES;
```

- [ ] **Step 4: Add environment config**

Create `backend/.env.example`:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=duck_store
DB_PASSWORD=duck_store
DB_NAME=duck_store
TEST_DB_HOST=localhost
TEST_DB_PORT=3306
TEST_DB_USER=duck_store
TEST_DB_PASSWORD=duck_store
TEST_DB_NAME=duck_store_test
```

```bash
cp backend/.env.example backend/.env
```

Create `.gitignore` at the repo root:
```
node_modules/
dist/
.env
coverage/
```

- [ ] **Step 5: Wire TypeORM into the app**

Replace `backend/src/data-source.ts` (new file):
```ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USER ?? 'duck_store',
  password: process.env.DB_PASSWORD ?? 'duck_store',
  database: process.env.DB_NAME ?? 'duck_store',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
```

Replace `backend/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'mysql' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number(config.get('DB_PORT', 3306)),
        username: config.get<string>('DB_USER', 'duck_store'),
        password: config.get<string>('DB_PASSWORD', 'duck_store'),
        database: config.get<string>('DB_NAME', 'duck_store'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: false,
        migrationsRun: true,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

Replace `backend/src/main.ts`:
```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();
  await app.listen(3000);
}
bootstrap();
```

Add these scripts to `backend/package.json` under `"scripts"`:
```json
"typeorm": "typeorm-ts-node-commonjs -d src/data-source.ts",
"migration:generate": "npm run typeorm -- migration:generate",
"migration:run": "npm run typeorm -- migration:run",
"migration:revert": "npm run typeorm -- migration:revert"
```

- [ ] **Step 6: Verify it boots against MySQL**

```bash
docker compose up -d
cd backend && npm run start:dev
```
Expected: no errors, log line `Nest application successfully started`. In another shell: `curl -i http://localhost:3000` returns `200` (Nest's default hello-world controller, still present at this point).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: scaffold NestJS backend with Docker MySQL

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Duck entity + initial migration

**Files:**
- Create: `backend/src/shared/duck.entity.ts`
- Create: `backend/src/shared/duck-price.util.ts`
- Create: `backend/src/migrations/1758000000000-CreateDuckTable.ts`
- Modify: `backend/src/app.module.ts` (register `Duck` in `entities`, already glob-matched — no change needed if the glob from Task 1 is kept)

**Interfaces:**
- Produces: `Duck` entity class, `DuckColor`/`DuckSize` enums, `toPriceString(price: number): string` util (used by later tasks for exact-price lookups), and the `duck` table with a unique `(color, size, price)` index.

- [ ] **Step 1: Write the entity**

Create `backend/src/shared/duck.entity.ts`:
```ts
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
```

Create `backend/src/shared/duck-price.util.ts`:
```ts
export function toPriceString(price: number): string {
  return price.toFixed(2);
}
```

- [ ] **Step 2: Write the migration**

The unique index is deliberately **not** scoped to `deleted` — MySQL has no partial/filtered unique index, and scoping it would work against the merge/undelete invariant designed in the spec (§5): we want at most one row per `(color, size, price)` ever, active or deleted, so the same atomic upsert used for merging active ducks also handles "re-adding" a previously-deleted duck.

Create `backend/src/migrations/1758000000000-CreateDuckTable.ts`:
```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDuckTable1758000000000 implements MigrationInterface {
  name = 'CreateDuckTable1758000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`duck\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`color\` enum ('Red','Green','Yellow','Black') NOT NULL,
        \`size\` enum ('XLarge','Large','Medium','Small','XSmall') NOT NULL,
        \`price\` decimal(10,2) NOT NULL,
        \`quantity\` int NOT NULL,
        \`deleted\` tinyint NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_duck_color_size_price\` (\`color\`, \`size\`, \`price\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `duck`');
  }
}
```

- [ ] **Step 3: Run the migration and verify the table**

```bash
docker compose up -d
cd backend && npm run migration:run
```
Expected: log shows `CreateDuckTable1758000000000` migration applied.

Verify:
```bash
docker compose exec mysql mysql -uduck_store -pduck_store duck_store -e "DESCRIBE duck;"
```
Expected: columns `id, color, size, price, quantity, deleted` with the unique key listed.

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared backend/src/migrations
git commit -m "$(cat <<'EOF'
feat: add Duck entity and initial migration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Warehouse service — add duck (merge invariant, including concurrency)

**Files:**
- Create: `backend/src/warehouse/dto/create-duck.dto.ts`
- Create: `backend/src/warehouse/warehouse.service.ts`
- Create: `backend/src/warehouse/warehouse.module.ts`
- Create: `backend/test/utils/test-app.ts`
- Create: `backend/test/utils/reset-db.ts`
- Test: `backend/test/warehouse-add-duck.e2e-spec.ts`

**Interfaces:**
- Consumes: `Duck`, `DuckColor`, `DuckSize` from `../shared/duck.entity`; `toPriceString` from `../shared/duck-price.util`.
- Produces: `WarehouseService.addDuck(dto: CreateDuckDto): Promise<Duck>`, `WarehouseModule` (exports `WarehouseService`), `createTestApp(): Promise<{ app: INestApplication; dataSource: DataSource }>` test helper, `truncateDucks(dataSource: DataSource): Promise<void>` test helper — both reused by every later integration/e2e test.

- [ ] **Step 1: Write the DTO**

Create `backend/src/warehouse/dto/create-duck.dto.ts`:
```ts
import { IsEnum, IsNumber, IsPositive, Min } from 'class-validator';
import { DuckColor, DuckSize } from '../../shared/duck.entity';

export class CreateDuckDto {
  @IsEnum(DuckColor)
  color: DuckColor;

  @IsEnum(DuckSize)
  size: DuckSize;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsNumber()
  @Min(1)
  quantity: number;
}
```

- [ ] **Step 2: Write the shared integration test helpers**

Create `backend/test/utils/test-app.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Duck } from '../../src/shared/duck.entity';
import { WarehouseModule } from '../../src/warehouse/warehouse.module';
import { StoreModule } from '../../src/store/store.module';

export async function createTestApp(): Promise<{
  app: INestApplication;
  dataSource: DataSource;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'mysql',
        host: process.env.TEST_DB_HOST ?? 'localhost',
        port: Number(process.env.TEST_DB_PORT ?? 3306),
        username: process.env.TEST_DB_USER ?? 'duck_store',
        password: process.env.TEST_DB_PASSWORD ?? 'duck_store',
        database: process.env.TEST_DB_NAME ?? 'duck_store_test',
        entities: [Duck],
        synchronize: true,
        dropSchema: true,
      }),
      WarehouseModule,
      StoreModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const dataSource = moduleRef.get<DataSource>(getDataSourceToken());
  return { app, dataSource };
}
```

Create `backend/test/utils/reset-db.ts`:
```ts
import { DataSource } from 'typeorm';

export async function truncateDucks(dataSource: DataSource): Promise<void> {
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  await dataSource.query('TRUNCATE TABLE duck');
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
}
```

Note: `StoreModule` doesn't exist until Task 8 — stub it now so `test-app.ts` compiles for the rest of the plan:

Create `backend/src/store/store.module.ts`:
```ts
import { Module } from '@nestjs/common';

@Module({})
export class StoreModule {}
```

- [ ] **Step 3: Write the failing test**

Create `backend/test/warehouse-add-duck.e2e-spec.ts`:
```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { createTestApp } from './utils/test-app';
import { truncateDucks } from './utils/reset-db';
import { Duck } from '../src/shared/duck.entity';

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
    await repo.save(repo.create({ color: 'Green', size: 'Small', price: '10.00', quantity: 3, deleted: true }));

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
```

- [ ] **Step 4: Run test to verify it fails**

```bash
docker compose up -d
cd backend && npm run test:e2e -- warehouse-add-duck
```
Expected: FAIL — `Cannot find module '../src/warehouse/warehouse.module'` (nothing implemented yet).

- [ ] **Step 5: Implement `WarehouseService.addDuck` and `WarehouseModule`**

Create `backend/src/warehouse/warehouse.service.ts`:
```ts
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
```

Create `backend/src/warehouse/warehouse.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Duck } from '../shared/duck.entity';
import { WarehouseService } from './warehouse.service';

@Module({
  imports: [TypeOrmModule.forFeature([Duck])],
  providers: [WarehouseService],
  exports: [WarehouseService],
})
export class WarehouseModule {}
```

This step doesn't yet expose an HTTP route (no controller), so wire a temporary controller stub only for the test to hit `POST /ducks` — actually add the real controller now since the test depends on it; the controller's other routes (`GET`, `PATCH`, `DELETE`) are added in Task 5, `POST` here is enough:

Create `backend/src/warehouse/warehouse.controller.ts`:
```ts
import { Body, Controller, Post } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { CreateDuckDto } from './dto/create-duck.dto';

@Controller('ducks')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  add(@Body() dto: CreateDuckDto) {
    return this.warehouseService.addDuck(dto);
  }
}
```

Register it in `backend/src/warehouse/warehouse.module.ts` by adding `controllers: [WarehouseController]` to the `@Module` decorator.

Register `WarehouseModule` in `backend/src/app.module.ts`'s `imports` array (alongside the existing `TypeOrmModule.forRootAsync`).

- [ ] **Step 6: Run test to verify it passes**

```bash
npm run test:e2e -- warehouse-add-duck
```
Expected: PASS, all 4 tests green — including the concurrency test.

- [ ] **Step 7: Commit**

```bash
git add backend/src/warehouse backend/src/store/store.module.ts backend/src/app.module.ts backend/test
git commit -m "$(cat <<'EOF'
feat(warehouse): add duck with atomic merge invariant

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Warehouse service — list, edit, delete

**Files:**
- Create: `backend/src/warehouse/dto/update-duck.dto.ts`
- Modify: `backend/src/warehouse/warehouse.service.ts`
- Test: `backend/test/warehouse-crud.e2e-spec.ts`

**Interfaces:**
- Consumes: `WarehouseService` from Task 3; `createTestApp`/`truncateDucks` from Task 3.
- Produces: `WarehouseService.listDucks(): Promise<Duck[]>`, `WarehouseService.updateDuck(id: number, dto: UpdateDuckDto): Promise<Duck>`, `WarehouseService.deleteDuck(id: number): Promise<void>`.

- [ ] **Step 1: Write the DTO**

Create `backend/src/warehouse/dto/update-duck.dto.ts`:
```ts
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
```

- [ ] **Step 2: Write the failing tests**

Create `backend/test/warehouse-crud.e2e-spec.ts`:
```ts
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
    await seedDuck({ size: 'Small' as any, price: '1.00', quantity: 20, deleted: true });

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
    expect(res.body).toMatchObject({ price: '250.00', quantity: 20, color: 'Red', size: 'XLarge' });
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

    const stillInDb = await dataSource.getRepository(Duck).findOneBy({ id: duck.id });
    expect(stillInDb?.deleted).toBe(true);
  });

  it('returns 404 when editing or deleting a duck that does not exist', async () => {
    const edit = await request(app.getHttpServer()).patch('/ducks/999999').send({ price: 1 });
    expect(edit.status).toBe(404);

    const del = await request(app.getHttpServer()).delete('/ducks/999999');
    expect(del.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test:e2e -- warehouse-crud
```
Expected: FAIL — routes don't exist yet (404s where 200/409/204 expected).

- [ ] **Step 4: Implement the service methods**

The edit-price-collision rule (returning 409 rather than silently merging or overwriting) is a documented decision not covered by the spec: since `price` is part of the uniqueness key, editing a duck's price into another active duck's key would either need to silently merge two distinct records (surprising side effect of an "edit") or be rejected. Rejecting with a clear message — pointing the user at "add duck" (Task 3), which already has well-defined merge semantics — is the least surprising choice.

Add to `backend/src/warehouse/warehouse.service.ts`:
```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
// ...existing imports...
import { UpdateDuckDto } from './dto/update-duck.dto';

// inside WarehouseService, alongside addDuck:

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
      duck.price = newPrice;
    }
  }

  if (dto.quantity !== undefined) {
    duck.quantity = dto.quantity;
  }

  return this.duckRepository.save(duck);
}

async deleteDuck(id: number): Promise<void> {
  const duck = await this.duckRepository.findOneBy({ id, deleted: false });
  if (!duck) {
    throw new NotFoundException(`Duck ${id} not found`);
  }
  duck.deleted = true;
  await this.duckRepository.save(duck);
}
```

Update `backend/src/warehouse/warehouse.controller.ts` (add the three new routes):
```ts
import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { CreateDuckDto } from './dto/create-duck.dto';
import { UpdateDuckDto } from './dto/update-duck.dto';

@Controller('ducks')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get()
  list() {
    return this.warehouseService.listDucks();
  }

  @Post()
  add(@Body() dto: CreateDuckDto) {
    return this.warehouseService.addDuck(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDuckDto) {
    return this.warehouseService.updateDuck(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.warehouseService.deleteDuck(id);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:e2e -- warehouse-crud
```
Expected: PASS, all 5 tests green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/warehouse backend/test/warehouse-crud.e2e-spec.ts
git commit -m "$(cat <<'EOF'
feat(warehouse): list, edit, and soft-delete ducks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Packaging module (Strategy pattern)

**Files:**
- Create: `backend/src/store/store.types.ts`
- Create: `backend/src/store/packaging/packaging-strategy.interface.ts`
- Create: `backend/src/store/packaging/wood-packaging.strategy.ts`
- Create: `backend/src/store/packaging/cardboard-packaging.strategy.ts`
- Create: `backend/src/store/packaging/plastic-packaging.strategy.ts`
- Create: `backend/src/store/packaging/packaging.resolver.ts`
- Test: `backend/src/store/packaging/packaging.resolver.spec.ts`

**Interfaces:**
- Consumes: `DuckSize` from `../../shared/duck.entity`.
- Produces: `ShippingMode` enum, `PackagingStrategy` interface (`packageType: 'Wood' | 'Cardboard' | 'Plastic'`, `protectionFor(mode: ShippingMode): string[]`), `PackagingResolver.resolve(size: DuckSize): PackagingStrategy` — all consumed by Task 7 (`StoreService`).

- [ ] **Step 1: Write the failing test**

Create `backend/src/store/store.types.ts`:
```ts
export enum ShippingMode {
  LAND = 'Land',
  AIR = 'Air',
  SEA = 'Sea',
}
```

Create `backend/src/store/packaging/packaging-strategy.interface.ts`:
```ts
import { ShippingMode } from '../store.types';

export interface PackagingStrategy {
  readonly packageType: 'Wood' | 'Cardboard' | 'Plastic';
  protectionFor(shippingMode: ShippingMode): string[];
}
```

Create `backend/src/store/packaging/packaging.resolver.spec.ts`:
```ts
import { DuckSize } from '../../shared/duck.entity';
import { ShippingMode } from '../store.types';
import { PackagingResolver } from './packaging.resolver';
import { WoodPackagingStrategy } from './wood-packaging.strategy';
import { CardboardPackagingStrategy } from './cardboard-packaging.strategy';
import { PlasticPackagingStrategy } from './plastic-packaging.strategy';

describe('PackagingResolver', () => {
  const resolver = new PackagingResolver(
    new WoodPackagingStrategy(),
    new CardboardPackagingStrategy(),
    new PlasticPackagingStrategy(),
  );

  it.each([
    [DuckSize.XLARGE, 'Wood'],
    [DuckSize.LARGE, 'Wood'],
    [DuckSize.MEDIUM, 'Cardboard'],
    [DuckSize.SMALL, 'Plastic'],
    [DuckSize.XSMALL, 'Plastic'],
  ])('maps size %s to package type %s', (size, expected) => {
    expect(resolver.resolve(size).packageType).toBe(expected);
  });

  it.each([
    ['Wood' as const, ShippingMode.AIR, ['Polystyrene balls']],
    ['Wood' as const, ShippingMode.LAND, ['Polystyrene balls']],
    ['Wood' as const, ShippingMode.SEA, ['Moisture-absorbing beads', 'Bubble-wrap bags']],
    ['Cardboard' as const, ShippingMode.AIR, ['Polystyrene balls']],
    ['Cardboard' as const, ShippingMode.LAND, ['Polystyrene balls']],
    ['Cardboard' as const, ShippingMode.SEA, ['Moisture-absorbing beads', 'Bubble-wrap bags']],
    ['Plastic' as const, ShippingMode.AIR, ['Bubble-wrap bags']],
    ['Plastic' as const, ShippingMode.LAND, ['Polystyrene balls']],
    ['Plastic' as const, ShippingMode.SEA, ['Moisture-absorbing beads', 'Bubble-wrap bags']],
  ])('%s package under %s shipping needs %s', (packageType, mode, expected) => {
    const strategyBySize = {
      Wood: DuckSize.LARGE,
      Cardboard: DuckSize.MEDIUM,
      Plastic: DuckSize.SMALL,
    }[packageType];
    expect(resolver.resolve(strategyBySize).protectionFor(mode)).toEqual(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npm run test -- packaging.resolver
```
Expected: FAIL — the strategy/resolver files don't exist yet.

- [ ] **Step 3: Implement the strategies and resolver**

Create `backend/src/store/packaging/wood-packaging.strategy.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PackagingStrategy } from './packaging-strategy.interface';
import { ShippingMode } from '../store.types';

@Injectable()
export class WoodPackagingStrategy implements PackagingStrategy {
  readonly packageType = 'Wood' as const;

  protectionFor(shippingMode: ShippingMode): string[] {
    switch (shippingMode) {
      case ShippingMode.SEA:
        return ['Moisture-absorbing beads', 'Bubble-wrap bags'];
      case ShippingMode.AIR:
      case ShippingMode.LAND:
      default:
        return ['Polystyrene balls'];
    }
  }
}
```

Create `backend/src/store/packaging/cardboard-packaging.strategy.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PackagingStrategy } from './packaging-strategy.interface';
import { ShippingMode } from '../store.types';

@Injectable()
export class CardboardPackagingStrategy implements PackagingStrategy {
  readonly packageType = 'Cardboard' as const;

  protectionFor(shippingMode: ShippingMode): string[] {
    switch (shippingMode) {
      case ShippingMode.SEA:
        return ['Moisture-absorbing beads', 'Bubble-wrap bags'];
      case ShippingMode.AIR:
      case ShippingMode.LAND:
      default:
        return ['Polystyrene balls'];
    }
  }
}
```

Create `backend/src/store/packaging/plastic-packaging.strategy.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PackagingStrategy } from './packaging-strategy.interface';
import { ShippingMode } from '../store.types';

@Injectable()
export class PlasticPackagingStrategy implements PackagingStrategy {
  readonly packageType = 'Plastic' as const;

  protectionFor(shippingMode: ShippingMode): string[] {
    switch (shippingMode) {
      case ShippingMode.AIR:
        return ['Bubble-wrap bags'];
      case ShippingMode.SEA:
        return ['Moisture-absorbing beads', 'Bubble-wrap bags'];
      case ShippingMode.LAND:
      default:
        return ['Polystyrene balls'];
    }
  }
}
```

Create `backend/src/store/packaging/packaging.resolver.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { DuckSize } from '../../shared/duck.entity';
import { PackagingStrategy } from './packaging-strategy.interface';
import { WoodPackagingStrategy } from './wood-packaging.strategy';
import { CardboardPackagingStrategy } from './cardboard-packaging.strategy';
import { PlasticPackagingStrategy } from './plastic-packaging.strategy';

@Injectable()
export class PackagingResolver {
  constructor(
    private readonly wood: WoodPackagingStrategy,
    private readonly cardboard: CardboardPackagingStrategy,
    private readonly plastic: PlasticPackagingStrategy,
  ) {}

  resolve(size: DuckSize): PackagingStrategy {
    switch (size) {
      case DuckSize.XLARGE:
      case DuckSize.LARGE:
        return this.wood;
      case DuckSize.MEDIUM:
        return this.cardboard;
      case DuckSize.SMALL:
      case DuckSize.XSMALL:
      default:
        return this.plastic;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- packaging.resolver
```
Expected: PASS, all 14 cases green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/store
git commit -m "$(cat <<'EOF'
feat(store): packaging strategies for size + shipping mode

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Pricing module (Chain of Responsibility)

**Files:**
- Create: `backend/src/store/pricing/order-context.ts`
- Create: `backend/src/store/pricing/price-breakdown.ts`
- Create: `backend/src/store/pricing/pricing-rule.interface.ts`
- Create: `backend/src/store/pricing/bulk-discount.rule.ts`
- Create: `backend/src/store/pricing/packaging-surcharge.rule.ts`
- Create: `backend/src/store/pricing/destination-surcharge.rule.ts`
- Create: `backend/src/store/pricing/shipping-mode-fee.rule.ts`
- Create: `backend/src/store/pricing/pricing.service.ts`
- Test: `backend/src/store/pricing/pricing.service.spec.ts`

**Interfaces:**
- Consumes: `PackagingStrategy`, `ShippingMode` from Task 5.
- Produces: `PricingService.price(unitPrice: Decimal, context: OrderContext): { totalToPay: number; breakdown: PriceLineItem[] }` — consumed by Task 7 (`StoreService`).

- [ ] **Step 1: Write the supporting types**

Create `backend/src/store/pricing/order-context.ts`:
```ts
import { ShippingMode } from '../store.types';
import { PackagingStrategy } from '../packaging/packaging-strategy.interface';

export interface OrderContext {
  quantity: number;
  destinationCountry: string;
  shippingMode: ShippingMode;
  packaging: PackagingStrategy;
}
```

Create `backend/src/store/pricing/price-breakdown.ts`:
```ts
import Decimal from 'decimal.js';

export interface PriceLineItem {
  label: string;
  amount: string;
}

export class PriceBreakdown {
  private total: Decimal;
  private readonly items: PriceLineItem[] = [];

  constructor(initialTotal: Decimal) {
    this.total = initialTotal;
  }

  applyPercentage(label: string, percentage: number): void {
    const delta = this.total.times(percentage).dividedBy(100);
    this.total = this.total.plus(delta);
    this.items.push({ label, amount: this.formatSigned(delta) });
  }

  applyFlatAmount(label: string, amount: Decimal): void {
    this.total = this.total.plus(amount);
    this.items.push({ label, amount: this.formatSigned(amount) });
  }

  toResult(): { totalToPay: number; breakdown: PriceLineItem[] } {
    return {
      totalToPay: Number(this.total.toFixed(2)),
      breakdown: this.items,
    };
  }

  private formatSigned(amount: Decimal): string {
    const rounded = amount.toFixed(2);
    return amount.isNegative() ? rounded : `+${rounded}`;
  }
}
```

Create `backend/src/store/pricing/pricing-rule.interface.ts`:
```ts
import { PriceBreakdown } from './price-breakdown';
import { OrderContext } from './order-context';

export interface PricingRule {
  apply(breakdown: PriceBreakdown, context: OrderContext): void;
}
```

- [ ] **Step 2: Write the failing test**

Create `backend/src/store/pricing/pricing.service.spec.ts`:
```ts
import Decimal from 'decimal.js';
import { DuckSize } from '../../shared/duck.entity';
import { ShippingMode } from '../store.types';
import { WoodPackagingStrategy } from '../packaging/wood-packaging.strategy';
import { PricingService } from './pricing.service';
import { BulkDiscountRule } from './bulk-discount.rule';
import { PackagingSurchargeRule } from './packaging-surcharge.rule';
import { DestinationSurchargeRule } from './destination-surcharge.rule';
import { ShippingModeFeeRule } from './shipping-mode-fee.rule';
import { OrderContext } from './order-context';

describe('PricingService', () => {
  const pricingService = new PricingService(
    new BulkDiscountRule(),
    new PackagingSurchargeRule(),
    new DestinationSurchargeRule(),
    new ShippingModeFeeRule(),
  );

  it('applies bulk discount, wood surcharge, destination surcharge, and air fee in order, to the cent', () => {
    const context: OrderContext = {
      quantity: 150,
      destinationCountry: 'USA',
      shippingMode: ShippingMode.AIR,
      packaging: new WoodPackagingStrategy(),
    };

    const result = pricingService.price(new Decimal(50), context);

    // base: 50 * 150 = 7500
    // bulk discount -20%:      7500 - 1500 = 6000
    // wood surcharge +5%:      6000 +  300 = 6300
    // destination USA +18%:    6300 + 1134 = 7434
    // air fee (150 units, no >1000 reduction): 30 * 150 = 4500 -> 7434 + 4500 = 11934
    expect(result.totalToPay).toBe(11934);
    expect(result.breakdown).toEqual([
      { label: 'Bulk discount (>100 units)', amount: '-1500.00' },
      { label: 'Wood packaging surcharge', amount: '+300.00' },
      { label: 'Destination surcharge (USA)', amount: '+1134.00' },
      { label: 'Air shipping fee', amount: '+4500.00' },
    ]);
  });

  it('does not apply the bulk discount at or under 100 units', () => {
    const context: OrderContext = {
      quantity: 100,
      destinationCountry: 'Germany',
      shippingMode: ShippingMode.LAND,
      packaging: new WoodPackagingStrategy(),
    };

    const result = pricingService.price(new Decimal(10), context);
    expect(result.breakdown.find((i) => i.label.includes('Bulk discount'))).toBeUndefined();
  });

  it('reduces the air fee by 15% for orders exceeding 1000 units', () => {
    const context: OrderContext = {
      quantity: 1200,
      destinationCountry: 'Other',
      shippingMode: ShippingMode.AIR,
      packaging: new WoodPackagingStrategy(),
    };

    const result = pricingService.price(new Decimal(1), context);
    const airFee = result.breakdown.find((i) => i.label === 'Air shipping fee');
    // 30 * 1200 = 36000, reduced 15% -> 30600.00
    expect(airFee?.amount).toBe('+30600.00');
  });

  it('applies the flat sea fee and the default 15% destination surcharge for unlisted countries', () => {
    const context: OrderContext = {
      quantity: 10,
      destinationCountry: 'Kenya',
      shippingMode: ShippingMode.SEA,
      packaging: new WoodPackagingStrategy(),
    };

    const result = pricingService.price(new Decimal(20), context);
    expect(result.breakdown).toContainEqual({ label: 'Destination surcharge (Kenya)', amount: '+30.00' });
    expect(result.breakdown).toContainEqual({ label: 'Sea shipping fee', amount: '+400.00' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend && npm run test -- pricing.service
```
Expected: FAIL — rule classes and `PricingService` don't exist yet.

- [ ] **Step 4: Implement the rules and the chain runner**

Create `backend/src/store/pricing/bulk-discount.rule.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PricingRule } from './pricing-rule.interface';
import { PriceBreakdown } from './price-breakdown';
import { OrderContext } from './order-context';

@Injectable()
export class BulkDiscountRule implements PricingRule {
  apply(breakdown: PriceBreakdown, context: OrderContext): void {
    if (context.quantity > 100) {
      breakdown.applyPercentage('Bulk discount (>100 units)', -20);
    }
  }
}
```

Create `backend/src/store/pricing/packaging-surcharge.rule.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PricingRule } from './pricing-rule.interface';
import { PriceBreakdown } from './price-breakdown';
import { OrderContext } from './order-context';

@Injectable()
export class PackagingSurchargeRule implements PricingRule {
  apply(breakdown: PriceBreakdown, context: OrderContext): void {
    switch (context.packaging.packageType) {
      case 'Wood':
        breakdown.applyPercentage('Wood packaging surcharge', 5);
        break;
      case 'Plastic':
        breakdown.applyPercentage('Plastic packaging surcharge', 10);
        break;
      case 'Cardboard':
        breakdown.applyPercentage('Cardboard packaging discount', -1);
        break;
    }
  }
}
```

Create `backend/src/store/pricing/destination-surcharge.rule.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PricingRule } from './pricing-rule.interface';
import { PriceBreakdown } from './price-breakdown';
import { OrderContext } from './order-context';

const SURCHARGE_BY_COUNTRY: Record<string, number> = {
  USA: 18,
  Bolivia: 13,
  India: 19,
};
const DEFAULT_SURCHARGE = 15;

@Injectable()
export class DestinationSurchargeRule implements PricingRule {
  apply(breakdown: PriceBreakdown, context: OrderContext): void {
    const percentage = SURCHARGE_BY_COUNTRY[context.destinationCountry] ?? DEFAULT_SURCHARGE;
    breakdown.applyPercentage(`Destination surcharge (${context.destinationCountry})`, percentage);
  }
}
```

Create `backend/src/store/pricing/shipping-mode-fee.rule.ts`:
```ts
import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PricingRule } from './pricing-rule.interface';
import { PriceBreakdown } from './price-breakdown';
import { OrderContext } from './order-context';
import { ShippingMode } from '../store.types';

@Injectable()
export class ShippingModeFeeRule implements PricingRule {
  apply(breakdown: PriceBreakdown, context: OrderContext): void {
    switch (context.shippingMode) {
      case ShippingMode.SEA:
        breakdown.applyFlatAmount('Sea shipping fee', new Decimal(400));
        break;
      case ShippingMode.LAND:
        breakdown.applyFlatAmount('Land shipping fee', new Decimal(10).times(context.quantity));
        break;
      case ShippingMode.AIR: {
        let airFee = new Decimal(30).times(context.quantity);
        if (context.quantity > 1000) {
          airFee = airFee.minus(airFee.times(0.15));
        }
        breakdown.applyFlatAmount('Air shipping fee', airFee);
        break;
      }
    }
  }
}
```

Create `backend/src/store/pricing/pricing.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PriceBreakdown } from './price-breakdown';
import { PricingRule } from './pricing-rule.interface';
import { OrderContext } from './order-context';
import { BulkDiscountRule } from './bulk-discount.rule';
import { PackagingSurchargeRule } from './packaging-surcharge.rule';
import { DestinationSurchargeRule } from './destination-surcharge.rule';
import { ShippingModeFeeRule } from './shipping-mode-fee.rule';

@Injectable()
export class PricingService {
  private readonly rules: PricingRule[];

  constructor(
    bulkDiscountRule: BulkDiscountRule,
    packagingSurchargeRule: PackagingSurchargeRule,
    destinationSurchargeRule: DestinationSurchargeRule,
    shippingModeFeeRule: ShippingModeFeeRule,
  ) {
    this.rules = [bulkDiscountRule, packagingSurchargeRule, destinationSurchargeRule, shippingModeFeeRule];
  }

  price(unitPrice: Decimal, context: OrderContext) {
    const breakdown = new PriceBreakdown(unitPrice.times(context.quantity));
    for (const rule of this.rules) {
      rule.apply(breakdown, context);
    }
    return breakdown.toResult();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test -- pricing.service
```
Expected: PASS, all 4 tests green, including the to-the-cent worked example.

- [ ] **Step 6: Commit**

```bash
git add backend/src/store/pricing
git commit -m "$(cat <<'EOF'
feat(store): pricing rule chain with decimal.js-backed math

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Store module — price resolution, controller, e2e

**Files:**
- Create: `backend/src/store/dto/create-order.dto.ts`
- Create: `backend/src/store/store.service.ts`
- Create: `backend/src/store/store.controller.ts`
- Modify: `backend/src/store/store.module.ts` (replace the Task-3 stub)
- Test: `backend/test/store-quote.e2e-spec.ts`

**Interfaces:**
- Consumes: `Duck` (Task 2), `PackagingResolver` (Task 5), `PricingService` (Task 6).
- Produces: `POST /orders/quote` — `{ packageType, protectionTypes, totalToPay, breakdown }`.

- [ ] **Step 1: Write the DTO**

Create `backend/src/store/dto/create-order.dto.ts`:
```ts
import { IsEnum, IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';
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
```

- [ ] **Step 2: Write the failing test**

Create `backend/test/store-quote.e2e-spec.ts`:
```ts
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
    await repo.save(repo.create({ color: 'Red' as any, size: 'XLarge' as any, price: '50.00', quantity: 10000 }));

    const res = await request(app.getHttpServer()).post('/orders/quote').send({
      color: 'Red',
      size: 'XLarge',
      quantity: 150,
      destinationCountry: 'USA',
      shippingMode: 'Air',
    });

    expect(res.status).toBe(201);
    expect(res.body.packageType).toBe('Wood');
    expect(res.body.protectionTypes).toEqual(['Polystyrene balls']);
    expect(res.body.totalToPay).toBe(11934);
    expect(res.body.breakdown).toHaveLength(4);
  });

  it('resolves to the cheapest active price when more than one duck matches color+size', async () => {
    const repo = dataSource.getRepository(Duck);
    await repo.save(repo.create({ color: 'Black' as any, size: 'Small' as any, price: '9.00', quantity: 100 }));
    await repo.save(repo.create({ color: 'Black' as any, size: 'Small' as any, price: '5.00', quantity: 100 }));

    const res = await request(app.getHttpServer()).post('/orders/quote').send({
      color: 'Black',
      size: 'Small',
      quantity: 1,
      destinationCountry: 'Other',
      shippingMode: 'Land',
    });

    // base = 5.00 * 1 = 5; plastic +10% = 5.5; destination +15% = 6.325; land +10/unit = 16.325 -> 16.33 (bankers-neutral round)
    expect(res.status).toBe(201);
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
```

- [ ] **Step 3: Run test to verify it fails**

```bash
docker compose up -d
cd backend && npm run test:e2e -- store-quote
```
Expected: FAIL — `StoreService`/`StoreController` don't exist yet (the Task-3 stub `StoreModule` has no routes).

- [ ] **Step 4: Implement the service, controller, and module**

Create `backend/src/store/store.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { Duck } from '../shared/duck.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { PackagingResolver } from './packaging/packaging.resolver';
import { PricingService } from './pricing/pricing.service';
import { OrderContext } from './pricing/order-context';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(Duck) private readonly duckRepository: Repository<Duck>,
    private readonly packagingResolver: PackagingResolver,
    private readonly pricingService: PricingService,
  ) {}

  async quoteOrder(dto: CreateOrderDto) {
    const duck = await this.duckRepository.findOne({
      where: { color: dto.color, size: dto.size, deleted: false },
      order: { price: 'ASC' },
    });
    if (!duck) {
      throw new NotFoundException(`No active duck found for color=${dto.color}, size=${dto.size}`);
    }

    const packaging = this.packagingResolver.resolve(dto.size);
    const context: OrderContext = {
      quantity: dto.quantity,
      destinationCountry: dto.destinationCountry,
      shippingMode: dto.shippingMode,
      packaging,
    };

    const { totalToPay, breakdown } = this.pricingService.price(new Decimal(duck.price), context);

    return {
      packageType: packaging.packageType,
      protectionTypes: packaging.protectionFor(dto.shippingMode),
      totalToPay,
      breakdown,
    };
  }
}
```

Create `backend/src/store/store.controller.ts`:
```ts
import { Body, Controller, Post } from '@nestjs/common';
import { StoreService } from './store.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('orders')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post('quote')
  quote(@Body() dto: CreateOrderDto) {
    return this.storeService.quoteOrder(dto);
  }
}
```

Replace `backend/src/store/store.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Duck } from '../shared/duck.entity';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { PackagingResolver } from './packaging/packaging.resolver';
import { WoodPackagingStrategy } from './packaging/wood-packaging.strategy';
import { CardboardPackagingStrategy } from './packaging/cardboard-packaging.strategy';
import { PlasticPackagingStrategy } from './packaging/plastic-packaging.strategy';
import { PricingService } from './pricing/pricing.service';
import { BulkDiscountRule } from './pricing/bulk-discount.rule';
import { PackagingSurchargeRule } from './pricing/packaging-surcharge.rule';
import { DestinationSurchargeRule } from './pricing/destination-surcharge.rule';
import { ShippingModeFeeRule } from './pricing/shipping-mode-fee.rule';

@Module({
  imports: [TypeOrmModule.forFeature([Duck])],
  controllers: [StoreController],
  providers: [
    StoreService,
    PackagingResolver,
    WoodPackagingStrategy,
    CardboardPackagingStrategy,
    PlasticPackagingStrategy,
    PricingService,
    BulkDiscountRule,
    PackagingSurchargeRule,
    DestinationSurchargeRule,
    ShippingModeFeeRule,
  ],
})
export class StoreModule {}
```

Register `StoreModule` in `backend/src/app.module.ts`'s `imports` array, alongside `WarehouseModule`.

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:e2e -- store-quote
```
Expected: PASS, all 3 tests green.

- [ ] **Step 6: Run the full backend test suite**

```bash
npm run test && npm run test:e2e
```
Expected: all unit and e2e/integration tests pass (Tasks 3–7 combined).

- [ ] **Step 7: Commit**

```bash
git add backend/src/store backend/src/app.module.ts backend/test/store-quote.e2e-spec.ts
git commit -m "$(cat <<'EOF'
feat(store): order-pricing endpoint with cheapest-price resolution

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Frontend scaffolding

**Files:**
- Create: `frontend/` (via Vite)
- Create: `frontend/src/types/duck.ts`
- Create: `frontend/src/api/ducks.ts`
- Create: `frontend/.env.example`
- Test: `frontend/src/api/ducks.test.ts`

**Interfaces:**
- Produces: `Duck`, `CreateDuckInput`, `UpdateDuckInput` types; `ducksApi.list/add/update/remove` — consumed by every later frontend task.

- [ ] **Step 1: Scaffold the Vite React+TS app**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
cd ..
```

- [ ] **Step 2: Configure Vitest**

Modify `frontend/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
});
```

Create `frontend/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

Add to `frontend/package.json` `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 3: Write types and env config**

Create `frontend/.env.example`:
```
VITE_API_BASE_URL=http://localhost:3000
```
```bash
cp frontend/.env.example frontend/.env
```

Create `frontend/src/types/duck.ts`:
```ts
export type DuckColor = 'Red' | 'Green' | 'Yellow' | 'Black';
export type DuckSize = 'XLarge' | 'Large' | 'Medium' | 'Small' | 'XSmall';

export interface Duck {
  id: number;
  color: DuckColor;
  size: DuckSize;
  price: number;
  quantity: number;
}

export interface CreateDuckInput {
  color: DuckColor;
  size: DuckSize;
  price: number;
  quantity: number;
}

export interface UpdateDuckInput {
  price?: number;
  quantity?: number;
}
```

- [ ] **Step 4: Write the failing test**

Create `frontend/src/api/ducks.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ducksApi } from './ducks';

describe('ducksApi', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('lists ducks from GET /ducks', async () => {
    const ducks = [{ id: 1, color: 'Red', size: 'XLarge', price: 200, quantity: 10 }];
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ducks } as Response);

    const result = await ducksApi.list();

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/ducks'));
    expect(result).toEqual(ducks);
  });

  it('throws the server message when a request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: 'conflict' }),
    } as Response);

    await expect(ducksApi.update(1, { price: 5 })).rejects.toThrow('conflict');
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

```bash
cd frontend && npm run test -- ducks.test
```
Expected: FAIL — `./ducks` module doesn't exist.

- [ ] **Step 6: Implement the API client**

Create `frontend/src/api/ducks.ts`:
```ts
import { CreateDuckInput, Duck, UpdateDuckInput } from '../types/duck';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed with status ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export const ducksApi = {
  list: (): Promise<Duck[]> => fetch(`${BASE_URL}/ducks`).then((r) => handleResponse<Duck[]>(r)),

  add: (input: CreateDuckInput): Promise<Duck> =>
    fetch(`${BASE_URL}/ducks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then((r) => handleResponse<Duck>(r)),

  update: (id: number, input: UpdateDuckInput): Promise<Duck> =>
    fetch(`${BASE_URL}/ducks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then((r) => handleResponse<Duck>(r)),

  remove: (id: number): Promise<void> =>
    fetch(`${BASE_URL}/ducks/${id}`, { method: 'DELETE' }).then((r) => handleResponse<void>(r)),
};
```

- [ ] **Step 7: Run test to verify it passes**

```bash
npm run test -- ducks.test
```
Expected: PASS, both tests green.

- [ ] **Step 8: Commit**

```bash
git add frontend
git commit -m "$(cat <<'EOF'
chore: scaffold Vite React frontend with API client

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `DuckTable` component

**Files:**
- Create: `frontend/src/components/DuckTable.tsx`
- Test: `frontend/src/components/DuckTable.test.tsx`

**Interfaces:**
- Consumes: `Duck` from `../types/duck`.
- Produces: `DuckTable({ ducks, onEdit, onDelete })` — consumed by Task 12 (`App`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/DuckTable.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DuckTable } from './DuckTable';
import { Duck } from '../types/duck';

const ducks: Duck[] = [
  { id: 1, color: 'Red', size: 'XLarge', price: 200, quantity: 10000 },
  { id: 2, color: 'Green', size: 'Medium', price: 50, quantity: 5 },
];

describe('DuckTable', () => {
  it('renders a row per duck with its fields', () => {
    render(<DuckTable ducks={ducks} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('200 USD')).toBeInTheDocument();
    expect(screen.getByText('10000')).toBeInTheDocument();
  });

  it('calls onEdit / onDelete with the row duck when clicked', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<DuckTable ducks={ducks} onEdit={onEdit} onDelete={onDelete} />);
    const user = userEvent.setup();

    await user.click(screen.getAllByText('edit')[0]);
    expect(onEdit).toHaveBeenCalledWith(ducks[0]);

    await user.click(screen.getAllByText('delete')[1]);
    expect(onDelete).toHaveBeenCalledWith(ducks[1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm run test -- DuckTable
```
Expected: FAIL — `./DuckTable` doesn't exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/DuckTable.tsx`:
```tsx
import { Duck } from '../types/duck';

interface DuckTableProps {
  ducks: Duck[];
  onEdit: (duck: Duck) => void;
  onDelete: (duck: Duck) => void;
}

export function DuckTable({ ducks, onEdit, onDelete }: DuckTableProps) {
  return (
    <table>
      <thead>
        <tr>
          <th>Id</th>
          <th>Color</th>
          <th>Size</th>
          <th>Price</th>
          <th>Quantity</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {ducks.map((duck) => (
          <tr key={duck.id}>
            <td>{duck.id}</td>
            <td>{duck.color}</td>
            <td>{duck.size}</td>
            <td>{duck.price} USD</td>
            <td>{duck.quantity}</td>
            <td>
              <button onClick={() => onEdit(duck)}>edit</button>
              <button onClick={() => onDelete(duck)}>delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- DuckTable
```
Expected: PASS, both tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DuckTable.tsx frontend/src/components/DuckTable.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): DuckTable component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `DuckForm` component (shared add/edit)

**Files:**
- Create: `frontend/src/components/DuckForm.tsx`
- Test: `frontend/src/components/DuckForm.test.tsx`

**Interfaces:**
- Consumes: `Duck`, `DuckColor`, `DuckSize` from `../types/duck`.
- Produces: `DuckForm({ mode: 'add' | 'edit', initialDuck?, onSubmit, onCancel })`, submit callback shape `{ color, size, price, quantity }` — consumed by Task 12 (`App`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/DuckForm.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DuckForm } from './DuckForm';

describe('DuckForm', () => {
  it('edit mode disables color and size, and submits price/quantity changes', async () => {
    const onSubmit = vi.fn();
    render(
      <DuckForm
        mode="edit"
        initialDuck={{ id: 1, color: 'Red', size: 'XLarge', price: 200, quantity: 10000 }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Color')).toBeDisabled();
    expect(screen.getByLabelText('Size')).toBeDisabled();

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Price'));
    await user.type(screen.getByLabelText('Price'), '250');
    await user.click(screen.getByText('Save'));

    expect(onSubmit).toHaveBeenCalledWith({ color: 'Red', size: 'XLarge', price: 250, quantity: 10000 });
  });

  it('rejects a non-positive price and does not submit', async () => {
    const onSubmit = vi.fn();
    render(<DuckForm mode="add" onSubmit={onSubmit} onCancel={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Price'), '-5');
    await user.type(screen.getByLabelText('Quantity'), '10');
    await user.click(screen.getByText('Save'));

    expect(screen.getByRole('alert')).toHaveTextContent('Price must be a positive number');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm run test -- DuckForm
```
Expected: FAIL — `./DuckForm` doesn't exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/DuckForm.tsx`:
```tsx
import { FormEvent, useId, useState } from 'react';
import { Duck, DuckColor, DuckSize } from '../types/duck';

const COLORS: DuckColor[] = ['Red', 'Green', 'Yellow', 'Black'];
const SIZES: DuckSize[] = ['XLarge', 'Large', 'Medium', 'Small', 'XSmall'];

interface DuckFormValues {
  color: DuckColor;
  size: DuckSize;
  price: number;
  quantity: number;
}

interface DuckFormProps {
  mode: 'add' | 'edit';
  initialDuck?: Duck;
  onSubmit: (values: DuckFormValues) => void;
  onCancel: () => void;
}

export function DuckForm({ mode, initialDuck, onSubmit, onCancel }: DuckFormProps) {
  const [color, setColor] = useState<DuckColor>(initialDuck?.color ?? COLORS[0]);
  const [size, setSize] = useState<DuckSize>(initialDuck?.size ?? SIZES[0]);
  const [price, setPrice] = useState(String(initialDuck?.price ?? ''));
  const [quantity, setQuantity] = useState(String(initialDuck?.quantity ?? ''));
  const [error, setError] = useState<string | null>(null);
  const colorId = useId();
  const sizeId = useId();
  const priceId = useId();
  const quantityId = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const priceValue = Number(price);
    const quantityValue = Number(quantity);

    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setError('Price must be a positive number');
      return;
    }
    if (!Number.isInteger(quantityValue) || quantityValue <= 0) {
      setError('Quantity must be a positive whole number');
      return;
    }

    setError(null);
    onSubmit({ color, size, price: priceValue, quantity: quantityValue });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor={colorId}>Color</label>
      <select
        id={colorId}
        value={color}
        onChange={(e) => setColor(e.target.value as DuckColor)}
        disabled={mode === 'edit'}
      >
        {COLORS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <label htmlFor={sizeId}>Size</label>
      <select id={sizeId} value={size} onChange={(e) => setSize(e.target.value as DuckSize)} disabled={mode === 'edit'}>
        {SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <label htmlFor={priceId}>Price</label>
      <input id={priceId} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />

      <label htmlFor={quantityId}>Quantity</label>
      <input id={quantityId} value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" />

      {error && <p role="alert">{error}</p>}

      <button type="submit">Save</button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- DuckForm
```
Expected: PASS, both tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DuckForm.tsx frontend/src/components/DuckForm.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): shared add/edit DuckForm with validation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `ConfirmDialog` component

**Files:**
- Create: `frontend/src/components/ConfirmDialog.tsx`
- Test: `frontend/src/components/ConfirmDialog.test.tsx`

**Interfaces:**
- Produces: `ConfirmDialog({ message, onConfirm, onCancel })` — consumed by Task 12 (`App`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ConfirmDialog.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('shows the message and invokes onConfirm / onCancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog message="Delete duck #1?" onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByText('Delete duck #1?')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalled();

    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm run test -- ConfirmDialog
```
Expected: FAIL — `./ConfirmDialog` doesn't exist.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/ConfirmDialog.tsx`:
```tsx
interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div role="alertdialog">
      <p>{message}</p>
      <button onClick={onConfirm}>Confirm</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- ConfirmDialog
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ConfirmDialog.tsx frontend/src/components/ConfirmDialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): ConfirmDialog component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: `useDucks` hook + `App` wiring

**Files:**
- Create: `frontend/src/hooks/useDucks.ts`
- Test: `frontend/src/hooks/useDucks.test.ts`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `ducksApi` (Task 8), `DuckTable` (Task 9), `DuckForm` (Task 10), `ConfirmDialog` (Task 11).
- Produces: `useDucks(): { ducks, loading, error, addDuck, editDuck, deleteDuck }`; the wired `App` page.

- [ ] **Step 1: Write the failing hook test**

Create `frontend/src/hooks/useDucks.test.ts`:
```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDucks } from './useDucks';
import { ducksApi } from '../api/ducks';

vi.mock('../api/ducks');

describe('useDucks', () => {
  it('loads ducks on mount and refreshes after addDuck', async () => {
    const listed = [{ id: 1, color: 'Red' as const, size: 'XLarge' as const, price: 200, quantity: 10 }];
    vi.mocked(ducksApi.list).mockResolvedValue(listed);
    vi.mocked(ducksApi.add).mockResolvedValue(listed[0]);

    const { result } = renderHook(() => useDucks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ducks).toEqual(listed);

    await act(async () => {
      await result.current.addDuck({ color: 'Red', size: 'XLarge', price: 200, quantity: 5 });
    });

    expect(ducksApi.add).toHaveBeenCalledWith({ color: 'Red', size: 'XLarge', price: 200, quantity: 5 });
    expect(ducksApi.list).toHaveBeenCalledTimes(2);
  });

  it('surfaces a load error without throwing', async () => {
    vi.mocked(ducksApi.list).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useDucks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('network down');
    expect(result.current.ducks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm run test -- useDucks
```
Expected: FAIL — `./useDucks` doesn't exist.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/useDucks.ts`:
```ts
import { useCallback, useEffect, useState } from 'react';
import { ducksApi } from '../api/ducks';
import { CreateDuckInput, Duck, UpdateDuckInput } from '../types/duck';

export function useDucks() {
  const [ducks, setDucks] = useState<Duck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDucks(await ducksApi.list());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addDuck = useCallback(
    async (input: CreateDuckInput) => {
      await ducksApi.add(input);
      await refresh();
    },
    [refresh],
  );

  const editDuck = useCallback(
    async (id: number, input: UpdateDuckInput) => {
      await ducksApi.update(id, input);
      await refresh();
    },
    [refresh],
  );

  const deleteDuck = useCallback(
    async (id: number) => {
      await ducksApi.remove(id);
      await refresh();
    },
    [refresh],
  );

  return { ducks, loading, error, addDuck, editDuck, deleteDuck };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- useDucks
```
Expected: PASS, both tests green.

- [ ] **Step 5: Write the failing App integration test**

Create `frontend/src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { ducksApi } from './api/ducks';

vi.mock('./api/ducks');

describe('App', () => {
  it('adds a duck through the form and refreshes the table', async () => {
    vi.mocked(ducksApi.list)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1, color: 'Red', size: 'XLarge', price: 200, quantity: 10 }]);
    vi.mocked(ducksApi.add).mockResolvedValue({ id: 1, color: 'Red', size: 'XLarge', price: 200, quantity: 10 });

    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Add duck'));
    await user.type(screen.getByLabelText('Price'), '200');
    await user.type(screen.getByLabelText('Quantity'), '10');
    await user.click(screen.getByText('Save'));

    expect(await screen.findByText('Red')).toBeInTheDocument();
    expect(ducksApi.add).toHaveBeenCalledWith({ color: 'Red', size: 'XLarge', price: 200, quantity: 10 });
  });

  it('deletes a duck after confirming the dialog', async () => {
    vi.mocked(ducksApi.list)
      .mockResolvedValueOnce([{ id: 1, color: 'Red', size: 'XLarge', price: 200, quantity: 10 }])
      .mockResolvedValueOnce([]);
    vi.mocked(ducksApi.remove).mockResolvedValue(undefined);

    render(<App />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('delete'));
    await user.click(screen.getByText('Confirm'));

    expect(ducksApi.remove).toHaveBeenCalledWith(1);
    await screen.findByText(/no ducks/i);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npm run test -- App.test
```
Expected: FAIL — `App` doesn't yet render "Add duck", the form, or the table.

- [ ] **Step 7: Implement `App.tsx`**

Replace `frontend/src/App.tsx`:
```tsx
import { useState } from 'react';
import { useDucks } from './hooks/useDucks';
import { DuckTable } from './components/DuckTable';
import { DuckForm } from './components/DuckForm';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Duck } from './types/duck';

type DialogState = { kind: 'add' } | { kind: 'edit'; duck: Duck } | { kind: 'delete'; duck: Duck } | null;

export default function App() {
  const { ducks, loading, error, addDuck, editDuck, deleteDuck } = useDucks();
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <main>
      <h1>Duck Warehouse</h1>
      <button onClick={() => setDialog({ kind: 'add' })}>Add duck</button>

      {loading && <p>Loading…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && ducks.length === 0 && <p>No ducks in the warehouse yet.</p>}

      <DuckTable
        ducks={ducks}
        onEdit={(duck) => setDialog({ kind: 'edit', duck })}
        onDelete={(duck) => setDialog({ kind: 'delete', duck })}
      />

      {dialog?.kind === 'add' && (
        <DuckForm
          mode="add"
          onSubmit={(values) => {
            addDuck(values);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'edit' && (
        <DuckForm
          mode="edit"
          initialDuck={dialog.duck}
          onSubmit={(values) => {
            editDuck(dialog.duck.id, { price: values.price, quantity: values.quantity });
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          message={`Delete duck #${dialog.duck.id}?`}
          onConfirm={() => {
            deleteDuck(dialog.duck.id);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npm run test -- App.test
npm run test
```
Expected: PASS — the two `App` tests, and the full frontend suite (Tasks 8–12).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/hooks frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): wire useDucks hook into App (add/edit/delete flow)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Manual smoke test, README, final polish

**Files:**
- Create: `README.md` (repo root)

**Interfaces:** none (documentation + manual verification only).

- [ ] **Step 1: Manually verify the full stack together**

```bash
docker compose up -d
cd backend && npm run start:dev &
cd ../frontend && npm run dev &
```
Open the frontend URL (Vite default `http://localhost:5173`). Add a duck (Red, XLarge, 200, 10), confirm it appears sorted correctly, edit its quantity, delete it with the confirmation dialog, confirm it disappears from the list. Then:
```bash
curl -X POST http://localhost:3000/orders/quote \
  -H 'Content-Type: application/json' \
  -d '{"color":"Red","size":"XLarge","quantity":150,"destinationCountry":"USA","shippingMode":"Air"}'
```
Expected: a 404 (no active duck matches, since it was deleted) or, if re-added first, a JSON response with `packageType`, `protectionTypes`, `totalToPay`, `breakdown`.

Stop the dev servers (`kill %1 %2` or Ctrl+C each).

- [ ] **Step 2: Write the README**

Create `README.md` at the repo root:
```markdown
# Duck Store

Implementation of the Digital Harbor "Duck Store Coding Exercise" (v2, August 2026):
a warehouse CRUD module (NestJS + MySQL + React) and a stateless order-pricing/packaging
API (NestJS only, no UI, per the spec).

Full design rationale: [docs/superpowers/specs/2026-09-16-duck-store-design.md](docs/superpowers/specs/2026-09-16-duck-store-design.md).

## Stack

- Backend: NestJS + TypeORM + MySQL 8
- Frontend: React + Vite
- Tests: Jest + Supertest (backend), Vitest + React Testing Library (frontend)

## Setup (clean machine)

Prerequisites: Docker, Node.js 20+.

```bash
# 1. Start MySQL (also creates the duck_store_test schema used by integration tests)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env
npm install
npm run start:dev   # runs pending migrations automatically on boot, then listens on :3000

# 3. Frontend (separate terminal)
cd frontend
cp .env.example .env
npm install
npm run dev          # listens on :5173 by default
```

Open the frontend URL printed by Vite. The backend API is at `http://localhost:3000`.

## Running tests

```bash
# Backend unit + integration tests (needs docker compose up -d for the MySQL-backed ones)
cd backend
npm run test        # unit tests: packaging strategies, pricing rules
npm run test:e2e    # integration tests: warehouse CRUD, the concurrent merge invariant, order pricing

# Frontend
cd frontend
npm run test
```

## API

### Warehouse

| Method | Path         | Body                                | Notes |
|--------|--------------|--------------------------------------|-------|
| GET    | `/ducks`     | —                                    | Non-deleted ducks, sorted by quantity ascending |
| POST   | `/ducks`     | `{ color, size, price, quantity }`  | Merges into an existing duck with the same color+size+price |
| PATCH  | `/ducks/:id` | `{ price?, quantity? }`             | Color/size are immutable |
| DELETE | `/ducks/:id` | —                                    | Logical delete |

### Store

| Method | Path            | Body                                                              |
|--------|-----------------|--------------------------------------------------------------------|
| POST   | `/orders/quote` | `{ color, size, quantity, destinationCountry, shippingMode }`     |

Response: `{ packageType, protectionTypes, totalToPay, breakdown }`.

## Decisions made where the spec was ambiguous

- **List sort direction** — the spec says "sort by quantity" without a direction. Ascending, so
  low-stock ducks surface first, which is what a warehouse operator would act on.
- **Add-duck merge under concurrency** — implemented as a single atomic MySQL
  `INSERT ... ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`, backed by a
  unique `(color, size, price)` index, instead of a read-then-write cycle or application-level
  locking. Verified with a test that fires concurrent adds and asserts a single merged row.
- **Re-adding a previously deleted duck** — the same key collision un-deletes and merges
  quantity into the old row, rather than failing or creating a second row, to stay consistent
  with the "merge, don't duplicate" spirit of the stated rule.
- **Editing price into a collision** — since `price` is part of the uniqueness key, an edit that
  would collide with another *active* duck's color+size+price is rejected with `409 Conflict`
  rather than silently merged; the response tells the caller to use "add duck" instead, which
  already has well-defined merge semantics.
- **Order price resolution** — the order carries no price, and because the uniqueness key
  includes price, more than one active duck can match a given color+size. Resolved to the
  **cheapest** active match. The store endpoint does not reserve or decrement warehouse stock —
  it's a stateless pricing/packaging calculator per the spec ("no UI required"), and nothing in
  the spec asks an order to affect inventory.
- **Money math** — all pricing arithmetic uses `decimal.js` rather than native floating-point,
  so percentage discounts/surcharges and flat fees stay accurate to the cent regardless of
  application order.

## Design patterns

- **Strategy** (`backend/src/store/packaging/`) — one `PackagingStrategy` implementation per
  package type (wood/cardboard/plastic); a resolver picks one from duck size, and each strategy
  derives its own protection filler from shipping mode.
- **Chain of Responsibility** (`backend/src/store/pricing/`) — an ordered list of `PricingRule`
  objects, each contributing one labeled line item to a running `PriceBreakdown`. This is what
  produces the itemized discount/surcharge breakdown the spec requires as output.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: add README with setup steps and documented decisions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push everything**

```bash
git push -u origin main
```
