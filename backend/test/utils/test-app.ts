import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Duck } from '../../src/shared/duck.entity';
import { WarehouseModule } from '../../src/warehouse/warehouse.module';
import { StoreModule } from '../../src/store/store.module';
import { CreateDuckTable1758000000000 } from '../../src/migrations/1758000000000-CreateDuckTable';

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
        migrations: [CreateDuckTable1758000000000],
        synchronize: false,
        migrationsRun: true,
        dropSchema: true,
      }),
      WarehouseModule,
      StoreModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  // Bind to a real (ephemeral) port up front rather than relying on supertest's lazy
  // listen-on-first-request. Without this, many requests fired truly concurrently (e.g. the
  // 50-way add-duck concurrency test) race supertest's internal `server.listen(0)` call and get
  // ECONNRESET instead of a response.
  await app.listen(0);

  const dataSource = moduleRef.get<DataSource>(getDataSourceToken());
  return { app, dataSource };
}
