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
