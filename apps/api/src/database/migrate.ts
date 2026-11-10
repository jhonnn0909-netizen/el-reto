import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

/**
 * Ejecutor de migraciones SQL versionadas.
 * Uso: npm run migrate
 * - Lee apps/api/src/database/migrations/V###__nombre.sql en orden.
 * - Crea la tabla schema_migrations si no existe.
 * - Aplica solo las pendientes, cada una en su propia transacción.
 * - Nunca edites una migración ya aplicada: crea una nueva V###.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Falta DATABASE_URL. Ver .env.example.');
  }
  const migrationsDir = join(__dirname, 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => /^V\d+__.*\.sql$/.test(f))
    .sort();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    const applied = new Set(
      (await client.query('SELECT version FROM schema_migrations')).rows.map(
        (r: { version: string }) => r.version,
      ),
    );

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (applied.has(version)) {
        // eslint-disable-next-line no-console
        console.log(`- ${version} (ya aplicada)`);
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      // eslint-disable-next-line no-console
      console.log(`Aplicando ${version}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      // eslint-disable-next-line no-console
      console.log(`OK ${version}`);
    }
    // eslint-disable-next-line no-console
    console.log('Migraciones al día.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Error en migraciones:', err);
  process.exit(1);
});
