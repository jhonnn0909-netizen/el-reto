# ROADMAP.md — El Reto (MVP y fases siguientes)

Nada de esta lista se descarta. Cada ítem indica su estado y dónde está
la base ya construida. Créditos siempre virtuales (DEMO, sin valor real);
ninguna fase introduce dinero real (DECISIONS.md D2, abierta y fuera del MVP).

## Fase 1 — MVP (integrado 2026-11-10)

Piedra, papel o tijera en vivo entre dos jugadores, con retos públicos y
privados, invitados sin cuenta, billetera DEMO, ranking con rachas y
niveles, reto diario, mensajes rápidos, espectador y presencia real.

- **Estado:** integrado y verificado en vivo en local (API + web + PostgreSQL + Redis).
  Verificación: `tsc --noEmit` limpio en API y web; Jest API 13 suites / 119 tests;
  Vitest web 7 archivos / 63 tests; partida en vivo por WebSocket entre dos
  clientes con commit-reveal, liquidación de apuesta y ranking actualizado.
- **Archivos:** `apps/api/src/app.module.ts` (cableado), `apps/api/src/modules/{auth,users,wallet,game,notifications,admin}/`,
  `apps/web/src/`, `apps/api/src/database/migrations/V001–V005`.
- **Integración final:** guards unificados en el `JwtAuthGuard` canónico de
  Auth (`apps/api/src/modules/auth/guards/jwt-auth.guard.ts`; admin con
  `JwtAuthGuard + RolesGuard + @Roles('ADMIN')`); adaptador billetera↔juego
  `apps/api/src/modules/game/wallet.adapter.ts` sobre los núcleos
  transaccionales `holdStakeInTx` / `releaseStakeInTx` / `payoutInTx` /
  `grantDailyPrizeInTx` de `WalletService` (la reserva, la liquidación y el
  premio diario ocurren dentro de la transacción del motor de juego);
  bono de bienvenida cableado en `AuthService` (registro, conversión de
  invitado y registro por OAuth).

## Fase 2 — Juegos, torneos e insignias

| Ítem | Estado | Base lista (archivo) |
|---|---|---|
| Torneos relámpago de 8 jugadores | Pendiente (sin endpoints ni lógica) | Esquema en `apps/api/src/database/migrations/V005__future.sql` (`tournaments`, `tournament_players`, `tournament_matches`, `max_players` 8 por defecto) |
| Insignias | Pendiente (concesión; sin endpoints ni lógica) | Esquema en `V005__future.sql` (`badges`, `user_badges`); niveles calculados ya en MVP (`levels`, `apps/api/src/modules/game/game.service.ts` `loadLevels`/`levelForPoints`) |
| Damas | Pendiente (sin lógica) | Motor modular: `apps/api/src/modules/game/game-engine.interface.ts` + `game-engine.registry.ts` (añadir un `GameEngine` y registrarlo, sin tocar `GameService`); catálogo `GET /games` lo lista como `COMING_SOON` (`apps/api/src/modules/game/ranking.controller.ts`, `game.types.ts`) |
| Damas chinas | Pendiente (sin lógica) | Igual que damas |
| Conecta cuatro | Pendiente (sin lógica) | Igual que damas |

## Fase 2 — Cuentas, seguridad y correo

| Ítem | Estado | Base lista (archivo) |
|---|---|---|
| Activación de OAuth con credenciales de Jhon (Google primero, luego Facebook) | Pendiente de las credenciales de Jhon | Código completo en `apps/api/src/modules/auth/auth.service.ts` (`buildGoogleAuthUrl`, `buildFacebookAuthUrl`, `handleOAuthCallback`) y rutas `GET /auth/google`, `GET /auth/google/callback`, `GET /auth/facebook`, `GET /auth/facebook/callback` en `apps/api/src/modules/auth/auth.controller.ts`; sin credenciales responden 503 `OAUTH_NOT_CONFIGURED` y la app arranca igual. Variables en `.env.example`: `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `FACEBOOK_APP_ID/SECRET/REDIRECT_URI` |
| SMTP real (verificación y recuperación por correo) | Pendiente de proveedor (DECISIONS.md D3, abierta) | `AuthService` ya genera los enlaces y los registra en el log solo en desarrollo sin SMTP (`config.smtp` en `apps/api/src/config/configuration.ts`); en producción el enlace se envía por correo y no se registra |
| CAPTCHA (registro/login) | Pendiente (sin base: no hay código ni dependencia) | Nada aún; decidir proveedor antes de implementar |
| Cifrado del secreto TOTP (MFA) | Pendiente | MFA TOTP funciona (`apps/api/src/modules/auth/totp.service.ts`, endpoints `/auth/mfa/setup` y `/auth/mfa/verify`); el secreto se guarda en claro en `users.mfa_secret` (DECISIONS.md D4: MFA opcional) |
| Códigos de respaldo MFA | Pendiente (sin base) | Nada aún; depende del MFA actual |
| MFA obligatoria para ADMIN en producción | Pendiente de decisión (DECISIONS.md D4, abierta) | Base: `RolesGuard` + `mfa_enabled` en `users` |

## Fase 2 — Integración con Meta / Facebook / WhatsApp

| Ítem | Estado | Base lista (archivo) |
|---|---|---|
| Invitación y compartir resultados por WhatsApp y Facebook | MVP por enlaces (sin SDK ni login social) | `apps/web/src/components/ShareButtons.tsx` y `WinnerCard.tsx` (enlaces `wa.me` y sharer de Facebook) |
| Entrar con cuenta de Facebook | Pendiente de credenciales (ver OAuth arriba) | Mismo código OAuth que Google |
| Avisos por WhatsApp / jugar desde WhatsApp o Facebook | Pendiente (sin base; DECISIONS.md D8, abierta) | Nada aún; requiere decisión de Jhon sobre qué integración concreta quiere |

## Fase 2 — Verificación con personas reales

| Ítem | Estado |
|---|---|
| Prueba en vivo con dos teléfonos reales con Alcon (redes distintas) | Pendiente. La prueba decisiva es la de Jhon con Alcon (rival de la prueba en vivo). En local se verificó la partida entre dos clientes WebSocket; falta confirmar el juego entre dos teléfonos reales y, si hace falta, el despliegue (Docker) en la máquina de Jhon |
| Docker (despliegue) | No verificado en esta VM (Docker no instalado). `docker-compose.yml` define postgres:16-alpine, redis:7-alpine, api y web; es la vía de despliegue en la máquina de Jhon. En local se usaron PostgreSQL y Redis instalados con `apt-get` |

## Decisiones abiertas que condicionan fases (DECISIONS.md)

D1 edad mínima y menores · D2 dinero real (fuera del MVP) · D3 proveedor
SMTP · D4 MFA obligatoria u opcional · D5 límites de la billetera demo
(valores provisionales: bienvenida 1000, depósito diario 10000, apuesta
máxima 1000) · D6 tiempo por jugada (30 s provisional) · D7 moderación y
reporte · D8 integración Meta · D9 GitHub Codespaces · D10 orden de los
juegos siguientes. D11 (invitado sin cuenta) y D12 (negro y oro, logo VS
sin cambios) ya aplicadas en el MVP.
