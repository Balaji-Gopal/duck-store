import { DataSource } from 'typeorm';

export async function truncateDucks(dataSource: DataSource): Promise<void> {
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  await dataSource.query('TRUNCATE TABLE duck');
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
}
