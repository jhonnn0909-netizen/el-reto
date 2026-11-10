/**
 * Tokens de inyección de la capa de datos.
 *
 * Viven en un archivo propio (sin importar nada) para romper la
 * importación circular `database.module <-> database.service`:
 * `database.module.ts` definía estos tokens y `database.service.ts`
 * los importaba de él, así que según el orden de carga el decorador
 * `@Inject(PG_POOL)` podía evaluar `PG_POOL` como `undefined` y Nest
 * fallaba al arrancar con `UndefinedDependencyException` en
 * `DatabaseService`. Los módulos siguen pudiendo importarlos desde
 * `database.module` (los re-exporta), pero los servicios deben
 * importarlos desde aquí.
 */
export const PG_POOL = 'PG_POOL';
export const REDIS_CLIENT = 'REDIS_CLIENT';
