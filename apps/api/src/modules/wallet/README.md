# Módulo Billetera DEMO/SANDBOX — El Reto (MVP)

Créditos **exclusivamente virtuales** (demo, sin valor real, sin dinero
real, sin pagos reales). Moneda `CREDITO`, entero sin decimales. Toda
respuesta lleva `demo: true`.

Contrato: `~/workspace/el-reto/CONTRACTS.md` §3.2, §4.3, §4.6 y §9.2.

## Archivos

| Archivo | Contenido |
|---|---|
| `wallet.module.ts` | `WalletModule` (exporta `WalletService`, `JwtAuthGuard`, `AdminGuard`) |
| `wallet.controller.ts` | `GET /wallet`, `GET /wallet/balance`, `GET /wallet/movements`, `POST /wallet/deposit`, `POST /wallet/withdraw`, `POST /wallet/promo` |
| `wallet.service.ts` | Toda la lógica contable (ver abajo) |
| `wallet.types.ts` | Tipos, convención de signos y reglas contables |
| `dto/wallet.dto.ts` | DTOs con `class-validator` (usuario + admin) |
| `guards/jwt-auth.guard.ts` | `JwtAuthGuard` y `AdminGuard` (provisionales, ver § Integración) |
| `decorators/current-user.decorator.ts` | `@CurrentUser()` |
| `../admin/admin.module.ts` | `AdminModule` (solo billetera en esta entrega) |
| `../admin/admin-wallet.controller.ts` | `GET /admin/transactions`, `GET /admin/wallet/reconcile`, `POST /admin/promo-codes`, `POST /admin/transactions/:id/reverse` |

## Reglas contables (resumen)

- Una transacción PostgreSQL por operación, con `SELECT ... FOR UPDATE`
  sobre las cuentas afectadas y control de `version` optimista
  (`CONCURRENT_MODIFICATION` si otra transacción ganó la carrera).
- `idempotency_key` único: repetir la misma clave devuelve la
  transacción original; misma clave con distinto usuario/tipo/importe
  → 409 `IDEMPOTENCY_KEY_CONFLICT`.
- Saldo insuficiente → `INSUFFICIENT_CREDITS` (400), sin asientos.
- Reverso: transacción `REVERSAL` con asientos compensatorios; el
  original queda intacto y su `status` pasa a `REVERSED` (eso es un
  cambio en `wallet_transactions`, no en `ledger_entries`: el trigger
  de inmutabilidad del ledger no se toca).
- Convención de signos: usuario DEBIT suma / CREDIT resta; sistema
  CREDIT suma / DEBIT resta. `balance_after` = total de la cuenta tras
  TODA la transacción. Cada transacción guarda sus líneas en
  `metadata.legs` (sub-saldo `user-available` | `user-reserved` |
  `system`); sin ellas no se puede revertir con seguridad.
- `BET_HOLD` / `BET_RELEASE` son internos (available ↔ reserved).
  `ESCROW` y `HOUSE` quedan en 0 en el MVP (ver `wallet.types.ts`).
- Retiro simulado: la contrapartida se reparte entre `MINT` y `PROMO`
  según disponibilidad, para no dejar nunca un saldo de sistema en
  negativo (los créditos son fungibles). Invariante global que verifica
  la conciliación: Σ usuarios = `MINT` + `PROMO`.
- Límites por entorno: `DEMO_WELCOME_CREDITS` (1000),
  `DEMO_DAILY_DEPOSIT_LIMIT` (10000). La apuesta máxima
  (`DEMO_MAX_STAKE`, 1000) la aplica el juego al crear el reto;
  `holdStake` la revalida como defensa en profundidad.
- Invitados (`GUEST`): sin billetera; todo método lanza 403
  `GUEST_WALLET_NOT_ALLOWED` (además del guard).

## Integración

### Auth → `grantWelcomeBonus(userId)`

```ts
// Al registrar (POST /auth/register) y al convertir invitado
// (POST /auth/convert-guest), tras crear el usuario:
await walletService.grantWelcomeBonus(user.id);
```

- Idempotente por clave `welcome:<userId>`; crea la billetera si no
  existe; devuelve `null` si el bono configurado es 0.
- No importa nada de Auth: no hay importaciones circulares.
- PENDIENTE: el módulo Auth debe llamarlo. OJO: `V001` aún define
  `users.email` / `password_hash` como NOT NULL y el rol sin `GUEST`
  (ver Contradicciones): la conversión de invitado exige ese cambio de
  esquema, que corresponde al módulo Auth / coordinador.

### Juego → `holdStake` / `releaseStake` / `payout`

```ts
await walletService.holdStake(userId, matchId, stake);          // al crear/aceptar
await walletService.releaseStake(userId, matchId, stake);       // al cancelar
await walletService.payout(matchId, winnerId, loserId, stake);  // al terminar
```

- Claves de idempotencia por defecto: `hold:<matchId>:<userId>`,
  `release:<matchId>:<userId>`, `payout:<matchId>`.
- `payout` hace en UNA transacción: `BET_RELEASE` de la propia apuesta
  del ganador + `WIN_PAYOUT` (apuesta del perdedor → ganador). No crea
  ni destruye saldo.
- El módulo de juego aún no existe: los métodos quedan listos y
  probados con mocks.

### Guards provisionales

`JwtAuthGuard` / `AdminGuard` son mínimos y propios del módulo porque
el `AuthModule` aún no existía al escribir esto: verifican el JWT con
`jwt.accessSecret` y resuelven el rol **desde la BD** (no confían en el
claim `role` del token). Cuando el AuthModule aporte un guardia
compartido, este debe sustituirse por él y eliminarse de aquí.
El `AdminGuard` es el que protege `/admin/*`.

## Contradicciones encontradas (manda CONTRACTS.md)

1. **V001 vs CONTRACTS §9.2 (invitados):** la migración define
   `users.email` y `password_hash` NOT NULL y `role` solo
   `('USER','ADMIN')`. CONTRACTS §9.2 exige ambos anulables y rol
   `GUEST`. Sin ese cambio no se puede crear un invitado en BD. NO se
   tocó V001 (es del módulo Auth); lo debe resolver Auth/coordinador
   con una migración posterior.
2. **CONTRACTS interno §3.4 vs §9.3:** la semilla de `config` dice
   `demo_max_stake=5000` y `V003` también siembra 5000, pero §9.3 y
   `.env.example` fijan `DEMO_MAX_STAKE=1000`. Se aplica 1000 (decisión
   de Jhon, doc 04 D4). `configuration.ts` además usa 5000 como valor
   por defecto si falta la variable.
3. **Doc 03 (base de datos) vs CONTRACTS:** el doc 03 diseña otra
   billetera distinta: tablas `wallets` / `ledger_accounts` /
   `ledger_lines`, moneda `CRV` con decimales (céntimos), bienvenida
   de 100 créditos y `credits.welcome_amount=100`. CONTRACTS manda:
   `wallet_accounts` / `system_accounts` / `wallet_transactions` /
   `ledger_entries`, moneda `CREDITO` entera, bienvenida 1000.
4. **Doc 06 (billetera) vs CONTRACTS:** el doc 06 usa moneda `CRV`
   con dos decimales, cuentas `EMISION_VIRTUAL` / `RETIROS_SIMULADOS`
   / `FONDO_RETOS_VIRTUAL` / `PROMOCIONES_VIRTUALES` y tipos
   `DEPOSITO_VIRTUAL` / `RESERVA_RETO` / etc. CONTRACTS manda:
   `CREDITO` entero, cuentas `MINT` / `PROMO` / `ESCROW` / `HOUSE` y
   los 10 tipos de `wallet_transactions`. Además el doc 06 §5 deja los
   tipos de apuesta "inactivos hasta aprobación de Jhon", mientras
   CONTRACTS §4.4 los exige en el flujo de juego. Se implementó lo de
   CONTRACTS. El doc 06 §6.2 también deja los límites de depósito
   "pendientes de Jhon"; CONTRACTS/DECISIONS D5 ya fijan 10000/día
   (provisional).
5. **Doc 03 §19.2 vs CONTRACTS §4.1:** el doc 03 propone conceder la
   bienvenida en transacción aparte tras verificar el correo; CONTRACTS
   §4.1 dice que el registro crea usuario + billetera con bienvenida.
   Se implementó lo de CONTRACTS (`grantWelcomeBonus` en el registro).
6. **Endpoint añadido (no está en la tabla de CONTRACTS §4.6):**
   `POST /admin/transactions/:id/reverse` (reverso compensatorio,
   solo ADMIN). CONTRACTS §3.2 exige el reverso pero §4.6 no lista el
   endpoint; se añadió porque sin él el reverso no sería invocable.
   El coordinador confirma si se mantiene o se mueve a otro módulo.

## Verificación de V001 contra CONTRACTS §3.2

Las tablas de billetera/ledger en `V001__users_wallet.sql` **coinciden**
con CONTRACTS §3.2: `wallet_accounts`, `system_accounts` (con siembra
de `MINT`, `PROMO`, `ESCROW`, `HOUSE`), `wallet_transactions` (10
tipos, estados, `idempotency_key` único), `ledger_entries` (BIGSERIAL,
`DEBIT`/`CREDIT`, `amount > 0`, triggers anti-UPDATE/DELETE),
`promo_codes` y `promo_redemptions` (`UNIQUE(promo_code_id, user_id)`).
Única divergencia: la parte de usuarios (ver contradicción 1).

## Pendientes (no bloquean el MVP demo)

- Prueba de integración real con PostgreSQL (los specs usan mocks;
  la concurrencia real con `FOR UPDATE` debe verificarse contra BD).
- Rate limiting en los endpoints de billetera (doc 10 R-12; el
  throttling global lo pone el coordinador / módulo de seguridad).
- `ADJUSTMENT` (ajuste admin autorizado): el tipo existe en el CHECK
  pero no hay endpoint; queda para el panel admin.
- Bloqueos administrativos de saldo (doc 06 §9): no hay tabla ni
  endpoint en CONTRACTS; no implementado.
- Conciliación programada diaria/semanal (doc 06 §14.3): el endpoint
  existe; el cron lo pone el coordinador si lo pide Jhon.
- Sustituir los guards provisionales por el guardia compartido de Auth.
- Veredicto OWASP: el doc 10 es un marco previo con veredicto NO
  satisfactorio para producción por diseño; este módulo corrige lo que
  el MVP puede (idempotencia PRU-RT-01, doble gasto PRU-DG-01/02/03,
  marca DEMO PRU-DG-04, sin secretos en logs) y el resto sigue
  pendiente de revisión (TLS, rate limiting, MFA admin, responsable de
  seguridad). No se declara cumplimiento legal ni certificación alguna.
