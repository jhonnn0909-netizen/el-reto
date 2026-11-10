# CONTRACTS.md — Contrato compartido del MVP de El Reto

Documento de trabajo interno del equipo. Todo módulo DEBE respetar este
contrato. Si un módulo necesita cambiarlo, debe proponer el cambio al
coordinador, no cambiarlo por su cuenta.

## 1. Principios

- TypeScript estricto en ambos proyectos (`strict: true`).
- SQL puro con `pg` (sin ORM). Migraciones versionadas en
  `apps/api/src/database/migrations/V###__nombre.sql`.
- Toda la validación de negocio y de resultados ocurre en el backend.
  El frontend nunca decide un ganador ni mueve créditos.
- Los créditos son **virtuales (demo, sin valor real)**. La moneda se
  llama `CREDITO`, es un entero (sin decimales) y en toda la interfaz
  aparece como "créditos virtuales (demo)".
- Errores de API con forma única: `{ "statusCode", "message", "error" }`
  (formato estándar de NestJS) y códigos de error propios en `message`
  cuando aplique (p. ej. `INSUFFICIENT_CREDITS`).
- Fechas en ISO 8601 UTC. IDs UUID v4 (excepto `ledger_entries`, que usa
  `BIGSERIAL` como número de asiento secuencial).

## 2. Variables de entorno

Ver `.env.example`. El backend valida las obligatorias al arrancar y
falla con mensaje claro si faltan: `DATABASE_URL`, `REDIS_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.

## 3. Esquema de base de datos (PostgreSQL 16)

> Las migraciones son la fuente de verdad. Este resumen es orientativo.

### 3.1 Usuarios y autenticación (`V001`)

```sql
users (
  id UUID PK DEFAULT gen_random_uuid(),
  username VARCHAR(30) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  role VARCHAR(10) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','ADMIN')),
  status VARCHAR(25) NOT NULL DEFAULT 'PENDING_VERIFICATION'
    CHECK (status IN ('PENDING_VERIFICATION','ACTIVE','SUSPENDED')),
  email_verified_at TIMESTAMPTZ,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email),
  UNIQUE (lower(username))            -- nombre de usuario único, sin distinción de mayúsculas
);
-- Índices: users(email), users(lower(username))

user_profiles (
  user_id UUID PK REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT,
  country CHAR(2),
  birth_date DATE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

sessions (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);
-- Índice: sessions(user_id), sessions(refresh_token_hash)

email_verification_tokens (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

password_reset_tokens (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

login_attempts (
  id BIGSERIAL PK,
  email VARCHAR(255) NOT NULL,
  ip_address INET,
  success BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Índice: login_attempts(email, attempted_at), login_attempts(ip_address, attempted_at)

security_events (
  id BIGSERIAL PK,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(60) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 Billetera y ledger (`V001`)

Cuentas de usuario y cuentas de sistema (contrapartidas de doble partida).
Códigos de cuenta de sistema: `MINT` (emisión), `PROMO` (promociones),
`ESCROW` (retos en curso), `HOUSE` (comisiones, si las hubiera; en el MVP
siempre 0).

```sql
wallet_accounts (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  currency VARCHAR(10) NOT NULL DEFAULT 'CREDITO',
  available_balance BIGINT NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  reserved_balance BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance >= 0),
  version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

system_accounts (
  id UUID PK DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  currency VARCHAR(10) NOT NULL DEFAULT 'CREDITO',
  available_balance BIGINT NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  reserved_balance BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance >= 0),
  version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

wallet_transactions (
  id UUID PK DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(40) NOT NULL CHECK (type IN (
    'WELCOME_BONUS','DEPOSIT','WITHDRAWAL','PROMO_CREDIT',
    'BET_HOLD','BET_RELEASE','WIN_PAYOUT','REFUND','REVERSAL','ADJUSTMENT')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','COMPLETED','FAILED','REVERSED')),
  user_id UUID NOT NULL REFERENCES users(id),
  reference_type VARCHAR(50),
  reference_id UUID,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
-- Índices: wallet_transactions(user_id, created_at), wallet_transactions(reference_type, reference_id)

ledger_entries (
  id BIGSERIAL PK,                    -- número de asiento secuencial
  transaction_id UUID NOT NULL REFERENCES wallet_transactions(id),
  account_type VARCHAR(10) NOT NULL CHECK (account_type IN ('USER','SYSTEM')),
  account_id UUID NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  balance_after BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Índices: ledger_entries(transaction_id), ledger_entries(account_type, account_id, created_at)
-- INMUTABLE: prohibido UPDATE/DELETE (trigger en la migración + REVOKE).
-- Regla de doble partida: cada transacción tiene al menos 2 asientos y la
-- suma de DEBIT = suma de CREDIT en cada transacción.

promo_codes (
  id UUID PK DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  credits BIGINT NOT NULL CHECK (credits > 0),
  max_uses INT NOT NULL DEFAULT 1 CHECK (max_uses >= 0),
  used_count INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

promo_redemptions (
  id UUID PK DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id),
  user_id UUID NOT NULL REFERENCES users(id),
  transaction_id UUID REFERENCES wallet_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (promo_code_id, user_id)
);
```

Reglas de la billetera (obligatorias):
- Toda operación es una transacción atómica en PostgreSQL (una sola
  transacción de base de datos) con bloqueo de fila
  (`SELECT ... FOR UPDATE`) sobre las cuentas afectadas y control de
  `version` optimista.
- `idempotency_key` único: repetir la misma operación con la misma clave
  devuelve la transacción original sin duplicar asientos.
- Saldo insuficiente → error `INSUFFICIENT_CREDITS`, sin asientos.
- Doble gasto: imposible por transacción atómica + CHECK de saldo >= 0.
- Reverso: nunca se borra ni edita un asiento; se crea una transacción
  `REVERSAL` con asientos compensatorios que referencian la original.
- Conciliación: `available + reserved` de una cuenta debe coincidir con
  la suma firmada de sus asientos (DEBIT +, CREDIT − según la cuenta);
  el módulo expone un endpoint admin de conciliación.

### 3.3 Juego (`V002`)

```sql
challenges (
  id UUID PK DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(120),
  visibility VARCHAR(10) NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC','PRIVATE')),
  invite_code VARCHAR(16) UNIQUE,       -- solo retos privados
  format VARCHAR(12) NOT NULL DEFAULT 'BEST_OF_3'
    CHECK (format IN ('BEST_OF_1','BEST_OF_3','BEST_OF_5','FREE')),
  stake_credits BIGINT NOT NULL DEFAULT 0 CHECK (stake_credits >= 0),
  status VARCHAR(12) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','ACCEPTED','CANCELLED','EXPIRED','COMPLETED')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Índices: challenges(status, visibility, created_at), challenges(creator_id)

matches (
  id UUID PK DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id),
  player1_id UUID NOT NULL REFERENCES users(id),
  player2_id UUID NOT NULL REFERENCES users(id),
  format VARCHAR(12) NOT NULL CHECK (format IN ('BEST_OF_1','BEST_OF_3','BEST_OF_5','FREE')),
  stake_credits BIGINT NOT NULL DEFAULT 0 CHECK (stake_credits >= 0),
  status VARCHAR(12) NOT NULL DEFAULT 'WAITING'
    CHECK (status IN ('WAITING','IN_PROGRESS','FINISHED','CANCELLED')),
  current_round INT NOT NULL DEFAULT 1,
  score1 INT NOT NULL DEFAULT 0,
  score2 INT NOT NULL DEFAULT 0,
  winner_id UUID REFERENCES users(id),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Índices: matches(player1_id, created_at), matches(player2_id, created_at), matches(status)

rounds (
  id UUID PK DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  player1_move VARCHAR(10) CHECK (player1_move IN ('ROCK','PAPER','SCISSORS')),
  player2_move VARCHAR(10) CHECK (player2_move IN ('ROCK','PAPER','SCISSORS')),
  player1_commit TEXT,
  player2_commit TEXT,
  result VARCHAR(10) CHECK (result IN ('PLAYER1','PLAYER2','TIE')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (match_id, round_number)
);

match_moves (
  id BIGSERIAL PK,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  player_id UUID NOT NULL REFERENCES users(id),
  move VARCHAR(10) NOT NULL CHECK (move IN ('ROCK','PAPER','SCISSORS')),
  commit_hash TEXT NOT NULL,
  revealed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, round_number, player_id)
);

match_events (
  id BIGSERIAL PK,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  player_id UUID REFERENCES users(id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

rankings (
  user_id UUID PK REFERENCES users(id) ON DELETE CASCADE,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  ties INT NOT NULL DEFAULT 0,
  matches_played INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Se actualiza en la misma transacción que cierra cada partida.

notifications (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Índice: notifications(user_id, created_at)
```

### 3.4 Auditoría y configuración (`V003`)

```sql
audit_logs (
  id BIGSERIAL PK,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Índice: audit_logs(actor_id, created_at), audit_logs(entity_type, entity_id)

config (
  key VARCHAR(100) PK,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Claves iniciales: move_timeout_seconds=30, challenge_ttl_hours=24,
-- demo_welcome_credits=1000, demo_daily_deposit_limit=10000, demo_max_stake=5000
```

Presencia en línea: **solo Redis** (sin tabla). Clave `presence:online`
(sorted set `userId -> lastHeartbeat`), TTL 60 s; el estado se deriva:
- `JUGANDO`: en partida `IN_PROGRESS`.
- `RETO PENDIENTE`: tiene reto aceptado sin iniciar o reto creado con
  invitado esperando.
- `RETO GENERADO`: tiene un reto `OPEN` creado por él.
- `POR JUGAR`: en sala de partida esperando jugada.
- `LIBRE`: en línea sin lo anterior.
- `POR INVITAR`: persona invitada por enlace que aún no ha entrado
  (no es un estado de presencia real; lo gestiona el frontend).

## 4. API REST (`/api/v1`)

Base: `/api/v1`. Auth: `Authorization: Bearer <accessToken>` salvo los
endpoints públicos marcados. Documentación OpenAPI en `/api/docs`.

### 4.1 Auth — `AuthModule`
| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| POST | `/auth/register` | — | `{username, email, password, displayName}`. Crea usuario + billetera demo con bienvenida. 201. |
| POST | `/auth/login` | — | `{email, password}`. Rate limit 5 intentos/15 min por IP+email. Devuelve `{accessToken, refreshToken, user}`. |
| POST | `/auth/logout` | JWT | Revoca la sesión (refresh token) actual. |
| POST | `/auth/refresh` | refresh | `{refreshToken}` → nuevo par de tokens (rotación). |
| POST | `/auth/verify-email` | — | `{token}`. Activa la cuenta. |
| POST | `/auth/forgot-password` | — | `{email}`. Siempre responde 200 (no revela si existe). |
| POST | `/auth/reset-password` | — | `{token, newPassword}`. |
| GET | `/auth/me` | JWT | Perfil del usuario actual. |
| POST | `/auth/mfa/setup` | JWT | Genera secreto TOTP + URL otpauth. |
| POST | `/auth/mfa/verify` | JWT | `{code}`. Activa MFA si el código es válido. |
| GET | `/auth/sessions` | JWT | Sesiones activas del usuario. |
| DELETE | `/auth/sessions/:id` | JWT | Revoca una sesión. |

Reglas: contraseña mínimo 8 caracteres, con letra y número. Hash
`bcrypt` con `BCRYPT_ROUNDS`. Nombres de usuario: 3–30 caracteres,
letras, números, `_` y `.`, únicos sin distinción de mayúsculas
(comprobación previa `GET /users/check-username/:username`).

### 4.2 Usuarios — `UsersModule`
| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| GET | `/users/me` | JWT | Perfil + billetera (resumen). |
| PATCH | `/users/me` | JWT | `{displayName?, bio?, country?, avatarUrl?}`. |
| GET | `/users/check-username/:username` | — | `{available: boolean}`. |
| GET | `/users/:username` | — | Perfil público + ranking. |

### 4.3 Billetera — `WalletModule` (DEMO)
| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| GET | `/wallet` | JWT | `{available, reserved, currency: "CREDITO", demo: true}`. |
| GET | `/wallet/movements` | JWT | Paginado `?page&limit`. Asientos con descripción. |
| POST | `/wallet/deposit` | JWT | `{amount, idempotencyKey}`. Depósito virtual simulado. |
| POST | `/wallet/withdraw` | JWT | `{amount, idempotencyKey}`. Retiro simulado. |
| POST | `/wallet/promo` | JWT | `{code}`. Canjea código promocional. |
| GET | `/wallet/balance` | JWT | Alias resumido del saldo. |

### 4.4 Juego — `GameModule`
| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| POST | `/challenges` | JWT | `{title?, visibility, format, stakeCredits}`. Reserva la apuesta (BET_HOLD) si `stakeCredits > 0`. |
| GET | `/challenges` | JWT | Retos públicos abiertos `?format&mine&page&limit`. |
| GET | `/challenges/:id` | JWT | Detalle. |
| GET | `/challenges/invite/:code` | JWT | Reto privado por código de invitación. |
| POST | `/challenges/:id/accept` | JWT | Acepta el reto, crea la partida, reserva la apuesta del retado. |
| POST | `/challenges/:id/cancel` | JWT | Solo el creador; libera la reserva (BET_RELEASE). |
| POST | `/matches/:id/commit` | JWT | `{round, commitHash}`. Registra el compromiso SHA-256 de la jugada. |
| POST | `/matches/:id/reveal` | JWT | `{round, move}`. Revela la jugada; el backend verifica el hash y resuelve la ronda. |
| GET | `/matches/:id` | JWT | Estado de la partida (sin revelar jugadas pendientes del rival). |
| GET | `/matches` | JWT | Historial propio `?page&limit&status`. |
| POST | `/matches/:id/cancel` | JWT | Cancela antes de empezar; libera reservas. |
| GET | `/ranking` | — | Ranking de victorias `?limit`. |
| GET | `/ranking/:username` | — | Posición y estadísticas de un usuario. |
| GET | `/presence/online` | JWT | Personas en línea con estado. |

Flujo de jugada (revelación simultánea, commit-reveal):
1. Cada jugador envía `commitHash = SHA256(move + ":" + secret)`.
2. Cuando ambos han hecho commit de la ronda, cada uno revela
   `{move, secret}` (el endpoint `reveal` recibe `move` y el backend
   verifica `SHA256(move + ":" + secret) == commitHash`).
3. El backend resuelve la ronda, actualiza el marcador y, al terminar
   la partida, liquida la apuesta (WIN_PAYOUT) y actualiza el ranking,
   todo en una transacción.
4. Jugadas: `ROCK | PAPER | SCISSORS`. Ganador por reglas clásicas.
   Empate: se repite la ronda (no suma punto). Mejor de 3: gana quien
   llegue a 2 rondas; mejor de 5: a 3; 1 ronda: 1; libre: sin límite
   (la partida termina cuando un jugador abandona o el creador la cierra).
5. Temporizador: si un jugador no revela en `MOVE_TIMEOUT_SECONDS`,
   pierde la ronda. El backend lo resuelve con un trabajo programado
   (o al consultar el estado).

### 4.5 Notificaciones — `NotificationsModule`
| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| GET | `/notifications` | JWT | `?page&limit&unread`. |
| PATCH | `/notifications/:id/read` | JWT | Marca una como leída. |
| PATCH | `/notifications/read-all` | JWT | Marca todas como leídas. |

### 4.6 Admin — `AdminModule` (rol `ADMIN`, verificación en servidor)
| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| GET | `/admin/users` | ADMIN | Lista paginada con filtros. |
| PATCH | `/admin/users/:id/status` | ADMIN | `{status: ACTIVE | SUSPENDED}`. |
| GET | `/admin/stats` | ADMIN | Usuarios, partidas, retos, créditos en circulación. |
| GET | `/admin/audit` | ADMIN | Registros de auditoría paginados. |
| GET | `/admin/matches` | ADMIN | Supervisión de partidas. |
| GET | `/admin/transactions` | ADMIN | Movimientos virtuales (solo lectura). |
| POST | `/admin/promo-codes` | ADMIN | Crea código promocional. |
| GET | `/admin/wallet/reconcile` | ADMIN | Conciliación de saldos vs ledger. |

Ningún endpoint admin puede modificar ni borrar asientos del ledger.

## 5. WebSockets (namespace `/game`, `socket.io`)

Autenticación por token en el handshake (`auth: { token }`).
Eventos del cliente → servidor:
- `match:join { matchId }`, `match:leave { matchId }`
- `match:commit { matchId, round, commitHash }`
- `match:reveal { matchId, round, move, secret }`
- `presence:heartbeat {}` (cada 20 s; mantiene la presencia en Redis)

Eventos del servidor → cliente:
- `match:state` (estado completo de la partida, sin jugadas ocultas)
- `match:committed { round, playerId }`
- `round:result { round, moves, result, score }`
- `match:finished { winnerId, score, payout }`
- `match:cancelled { reason }`
- `challenge:created` (difusión a la lista pública)
- `presence:update` (lista de personas en línea con estado)
- `notification:new` (notificación en tiempo real)
- `error { code, message }`

Las mismas reglas de validación se aplican por REST y por WebSocket;
el motor de juego es único y vive en el backend.

## 6. Frontend (Next.js App Router)

Rutas (todas en español, adaptables a móvil/tablet/escritorio):
`/` (inicio), `/registro`, `/login`, `/recuperar`, `/panel`,
`/perfil`, `/billetera`, `/billetera/historial`, `/juegos`,
`/retos/crear`, `/retos`, `/retos/:id`, `/partidas`, `/partidas/:id`,
`/notificaciones`, `/ayuda`, `/configuracion/seguridad`, `/admin`.

Cliente API en `src/lib/api.ts` (fetch con token Bearer y refresco
automático), cliente WS en `src/lib/ws.ts` (`socket.io-client`).
Identidad visual: oscuro futurista, fondo azul marino profundo,
degradado azul-violeta, acentos neón, logo VS (SVG propio en
`src/components/Logo.tsx`). Tipografía del sistema / Inter.
Componentes reutilizables en `src/components/`: `Header`, `Footer`,
`ChallengeCard`, `OnlineList`, `WalletCard`, `RankingTable`,
`GameArena`, `Countdown`, `Confetti`, `Modal`, `Toast`, `EmptyState`,
`Spinner`.

## 7. Pruebas (Jest en la API; Vitest en la web)

La API debe incluir tests de los caminos críticos:
- Auth: registro, login, refresh, revocación de sesión, nombre de
  usuario duplicado, rate limiting de login, verificación de correo.
- Billetera: depósito idempotente (misma clave = una sola operación),
  saldo insuficiente, doble gasto concurrente, reverso compensatorio,
  conciliación.
- Juego: crear/aceptar reto, apuesta reservada, commit-reveal con
  hash inválido rechazado, ganador automático, empate, cancelación
  con liberación de reserva, doble jugada rechazada.
- Admin: un usuario normal no puede acceder a endpoints admin (403).

## 8. Convenciones de código

- Módulos NestJS en `apps/api/src/modules/<nombre>/` con
  `<nombre>.module.ts`, `<nombre>.controller.ts`,
  `<nombre>.service.ts`, `dto/*.dto.ts` y `*.spec.ts`.
- DTOs con `class-validator`. Errores con excepciones de NestJS
  (`BadRequestException`, `ForbiddenException`, etc.) y códigos de
  error propios en el mensaje cuando aplique.
- Nunca registrar secretos ni tokens en logs. Nunca devolver
  `password_hash`, `mfa_secret` ni hashes de tokens en respuestas.
- Migraciones: archivos `V###__descripcion.sql` aplicados en orden por
  `npm run migrate`; la tabla `schema_migrations` registra las
  aplicadas.

## 9. Adenda 2026-11-10 — dirección de diseño y juego sin cuenta

### 9.1 Sistema de diseño (fuente de verdad)

El frontend aplica el sistema de diseño de `apps/web/DESIGN.md`
(entorno **NEGRO Y ORO de lujo**, muestra
`~/workspace/your_files/el-reto-entornos-visuales/el-reto-negro-oro.html`).
Prioridad ante diferencias: **la muestra negro y oro manda** sobre el
documento 04. Negro profundo `#050505`, dorado `#f5c542` / `#ffe98a` /
`#c9962e`, plateado `#c0c0c0`, logo VS cromado con rayos de neón
(opción 1 aprobada, SIN CAMBIOS por orden de Jhon 2026-11-10), FOTOS
REALES de manos (nunca emojis ni dibujos como gestos de juego),
trofeo dorado y fondo de juegos y azar. Fotos en
`apps/web/public/img/`: `casino.jpg` (fondo fijo, versión web
optimizada de `casino.png`), `trofeo.jpg`
(portada y tarjeta del ganador), `manos.png` (foto del duelo),
`mano-piedra.jpg`, `mano-papel.jpg`, `mano-tijera.jpg` (botones de
jugada). Solo modo oscuro en el MVP. Toda cifra de créditos lleva
siempre la etiqueta «DEMO» y el color propio (violeta, distinto del
dorado para no confundirse con el premio).

### 9.2 Juego sin cuenta (sesión de invitado)

Decisión aprobada por Jhon: **cualquiera con el enlace puede crear
un reto**. El registro es una mejora posterior, nunca una barrera
para la primera partida (doc 04 §2.3, §12.1). Por tanto el MVP
incluye sesiones de invitado:

- `POST /auth/guest` (público): `{displayName}` (3–30 caracteres).
  Crea un usuario con `role='GUEST'`, `status='ACTIVE'`, sin correo
  ni contraseña, y devuelve `{accessToken, refreshToken, user}` con
  el mismo formato que el login. El `username` es un identificador
  interno único generado por el servidor (p. ej. `invitado-<corto>`),
  distinto del nombre visible; el nombre visible es `displayName`.
- Los invitados **pueden**: crear retos con `stakeCredits = 0`,
  aceptar retos con apuesta 0, jugar partidas, ver retos públicos y
  ranking, aparecer en la lista de personas en línea con su nombre.
- Los invitados **no pueden**: crear/aceptar retos con apuesta > 0
  (error `GUEST_STAKE_NOT_ALLOWED`, 403), depositar, retirar ni
  canjear promociones (403), aparecer en el ranking (sus partidas no
  actualizan `rankings`), ni acceder a `/wallet` ni a `/admin`.
- Los invitados **no tienen billetera** (no se crea fila en
  `wallet_accounts` ni se les dan créditos de bienvenida).
- `POST /auth/convert-guest` (JWT de invitado):
  `{username, email, password}`. Convierte la fila de invitado en
  `USER` (`status='PENDING_VERIFICATION'`, se envía verificación de
  correo), crea la billetera con los créditos de bienvenida y
  conserva el historial de partidas (mismo `id`). El nombre temporal
  pasa a ser el nombre de usuario si está libre (doc 04 §12.3).
- Cambios de esquema en `V001`: `users.email` y
  `users.password_hash` pasan a ser **anulables** (NULL para
  invitados); `role` admite `'GUEST'`:
  `CHECK (role IN ('USER','ADMIN','GUEST'))`. La unicidad de
  `lower(username)` se mantiene para todos los roles.
- WebSocket: el handshake acepta el token de invitado igual que el
  de usuario; los eventos de juego aplican las mismas reglas.

### 9.3 Alineación con el documento 04 (divergencias resueltas)

- **Apuesta máxima por reto: 1000 créditos DEMO** (doc 04 D4,
  recomendación provisional; antes 5000). `DEMO_MAX_STAKE=1000` en
  `.env.example` y en la semilla de `config`. Mínimo de apuesta con
  premio: 10; 0 = reto sin premio.
- **Temporizador de jugada: se mantiene (30 s, configurable).**
  El doc 04 D7 recomienda no tenerlo en la primera versión, pero el
  encargo de Jhon incluye explícitamente «temporizador»; manda el
  encargo (DECISIONS.md D6).
- **Ranking:** el doc 04 lo prevé con Supabase; en el MVP la fuente
  es PostgreSQL (tabla `rankings`), por el stack de producción
  fijado por Jhon. La presentación es la tabla de posiciones del
  doc 04 D8 (victorias, rachas, mejor racha).
- **Enlace de invitación:** ruta frontend `/retos/invitar/:code`
  (además de `/retos/:id`); el enlace lleva directo a la pantalla de
  aceptación/partida, sin pasar por la página de inicio.
- **Registro:** solo nombre de usuario + correo + contraseña en el
  MVP (doc 04 D1); el login con Gmail/Facebook es posterior.
- Los estados de presencia incluyen además `EN LÍNEA` (genérico,
  doc 04 §5.4) junto a los seis aprobados y `POR INVITAR`.
