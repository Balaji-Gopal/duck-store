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
