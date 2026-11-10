import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Pool, types } from 'pg';
import { DatabaseService } from './database.service';
import { PG_POOL, REDIS_CLIENT } from './database.tokens';

// node-postgres devuelve BIGINT (int8, tipo 20) como string; sin esto
// toda la aritmética de créditos concatenaba texto ("1000" + 500 =
// "1000500") y las apuestas leídas de BD llegaban como string
// (`AMOUNT_MUST_BE_POSITIVE_INTEGER` al aceptar un reto). Los importes
// de El Reto son enteros pequeños (créditos DEMO), así que se parsean
// a number de forma global, una sola vez, para toda la aplicación.
types.setTypeParser(20, (value: string) => parseInt(value, 10));

// Re-exportados para compatibilidad: los servicios deben importar los
// tokens desde './database.tokens' (ver ese archivo).
export { PG_POOL, REDIS_CLIENT } from './database.tokens';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const pool = new Pool({
          connectionString: config.get<string>('databaseUrl'),
          max: 20,
        });
        pool.on('error', (err) => {
          // eslint-disable-next-line no-console
          console.error('Error inesperado del pool de PostgreSQL:', err);
        });
        return pool;
      },
    },
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = new Redis(config.get<string>('redisUrl') as string, {
          maxRetriesPerRequest: 3,
        });
        redis.on('error', (err) => {
          // eslint-disable-next-line no-console
          console.error('Error de Redis:', err);
        });
        return redis;
      },
    },
    DatabaseService,
  ],
  exports: [PG_POOL, REDIS_CLIENT, DatabaseService],
})
export class DatabaseModule {}
