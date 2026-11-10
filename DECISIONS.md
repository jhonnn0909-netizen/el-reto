# DECISIONS.md — Dudas abiertas de El Reto (MVP)

Lo que Jhon NO ha decidido aparece aquí como duda, **no como requisito**.
Nada de esta lista debe implementarse como comportamiento definitivo sin
su aprobación. Cada duda incluye la recomendación del equipo y su estado.

## Dudas abiertas

### D1. Edad mínima y cuentas de menores
- **Duda:** ¿La plataforma admite menores de edad? ¿Con qué controles?
  (El público del juego incluye jóvenes; Jhon no ha fijado edad mínima.)
- **Recomendación:** MVP solo para mayores de 13 años con consentimiento
  del responsable; sin chat libre entre jugadores (solo mensajes rápidos
  predefinidos). Pendiente de revisión legal.
- **Estado:** ABIERTA.

### D2. Operación con dinero real en el futuro
- **Duda:** ¿Se operará alguna vez con dinero real, apuestas o premios
  con valor económico? ¿En qué países?
- **Recomendación:** El MVP es 100% DEMO/SANDBOX. Cualquier paso a dinero
  real exige licencias, abogado especializado y una fase separada.
- **Estado:** ABIERTA (fuera del MVP por decisión expresa).

### D3. Proveedor de correo transaccional
- **Duda:** ¿Qué proveedor SMTP se usará en producción para verificación
  y recuperación de contraseña?
- **Recomendación:** Empezar con el SMTP que Jhon ya use (o un proveedor
  transaccional con dominio propio); en desarrollo los enlaces se
  registran en el log y no se envían.
- **Estado:** ABIERTA.

### D4. MFA obligatorio o opcional
- **Duda:** ¿La autenticación multifactor (TOTP) será obligatoria para
  todos, solo para administradores, u opcional?
- **Recomendación:** Opcional para usuarios, obligatoria para ADMIN en
  producción. El esquema y los endpoints ya están preparados.
- **Estado:** ABIERTA (implementado como opcional).

### D5. Límites de la billetera demo
- **Duda:** ¿Cuántos créditos de bienvenida y cuál es el tope de depósito
  diario y de apuesta por partida?
- **Recomendación provisional (configurable por variables de entorno):**
  bienvenida 1000 créditos, depósito diario máximo 10000, apuesta
  máxima 1000 (doc 04 D4: mínimo 10 con premio, máximo 1000 por
  reto; 0 = reto sin premio). Ajustable sin cambiar código.
- **Estado:** ABIERTA (valores provisionales, no aprobados).

### D6. Tiempo por jugada
- **Duda:** ¿Cuántos segundos tiene cada jugador para elegir su jugada?
- **Recomendación provisional:** 30 segundos por ronda, configurable
  (`MOVE_TIMEOUT_SECONDS`). Si expira, la ronda se resuelve a favor
  del rival.
- **Estado:** ABIERTA (valor provisional).

### D7. Moderación y reporte de usuarios
- **Duda:** ¿Qué herramientas de reporte/bloqueo entre jugadores se
  incluyen en el MVP?
- **Recomendación:** Reporte simple (motivo + partida) y bloqueo de
  usuario; la revisión queda en el panel ADMIN.
- **Estado:** ABIERTA (no implementado en el MVP salvo el modelo de datos).

### D8. Integración con Facebook / WhatsApp / Meta
- **Duda:** ¿Qué integración concreta se quiere (login con Facebook,
  compartir resultados, invitaciones, avisos)?
- **Recomendación:** En el MVP solo compartir por enlace (WhatsApp/
  Facebook) sin SDK ni login social. El login con Facebook y las
  notificaciones por WhatsApp quedan para una fase posterior.
- **Estado:** ABIERTA (análisis en curso en la documentación).

### D9. Integración con GitHub Codespaces
- **Duda:** ¿Cómo se usará Codespaces con el proyecto (desarrollo,
  pruebas, demos)?
- **Recomendación:** El repositorio `jhonnn0909-netizen/reto-rps`
  (prototipo) ya tiene `.devcontainer` y enlace de Codespaces. Para
  este MVP, añadir `.devcontainer` propio al subirlo a GitHub.
- **Estado:** ABIERTA.

### D10. Juegos siguientes y orden
- **Duda:** Tras piedra, papel o tijera, ¿qué juego sigue (damas, damas
  chinas, conecta cuatro, ajedrez)?
- **Recomendación:** El motor es modular; el siguiente se decide cuando
  el MVP funcione. Jhon mencionó damas y damas chinas como candidatos.
- **Estado:** ABIERTA (fuera del MVP).

### D11. Juego sin cuenta (sesión de invitado)
- **Decisión aplicada en el MVP:** cualquiera con el enlace puede
  crear un reto con solo un nombre, sin registrarse (doc 04 §12.1 y
  decisión aprobada de Jhon). El invitado juega retos sin premio
  (apuesta 0); la billetera, el ranking y los premios DEMO exigen
  cuenta registrada. La conversión de invitado a cuenta conserva el
  historial (CONTRACTS.md §9.2).
- **Estado:** APLICADA en el MVP (sesión de invitado).

### D12. Entorno visual definitivo (negro y oro)
- **Decisión de Jhon (2026-11-10):** el entorno visual de la
  aplicación es NEGRO Y ORO de lujo (negro profundo, dorado
  brillante #f5c542 / #ffe98a / #c9962e, plateado #c0c0c0, fotos
  reales: trofeo dorado y manos reales). Sustituye la identidad
  azul-violeta anterior. Muestra de referencia:
  `~/workspace/your_files/el-reto-entornos-visuales/el-reto-negro-oro.html`.
- **Confirmado por Jhon (2026-11-10):** (a) TODAS las animaciones al
  jugar son con MANOS REALES Y EN MOVIMIENTO, nunca con emojis ni
  manos ilustradas: la mano real se sacude antes de revelar la
  jugada; la cuenta atrás, el revelado y la celebración usan manos
  reales en movimiento (animación `sacudida` de la muestra, 1,1 s).
  (b) El fondo de la aplicación ya no es negro plano: es la imagen
  de juegos y azar `img/casino.png` (ruleta, ases, dados dorados,
  fichas de casino) con velo oscuro encima; en la web se usa la
  versión optimizada `apps/web/public/img/casino.jpg`.
  (c) Confeti DORADO al ganar y RAYOS DE ENERGÍA en la arena y en la
  celebración del ganador (además de los rayos que ya trae el logo).
- **¡EL LOGO NO SE CAMBIA! Orden de Jhon con prioridad (2026-11-10):**
  el logo oficial se queda exactamente como fue aprobado: VS cromado
  con rayos de neón, animado con pulso y brillo (opción 1). No va en
  dorado, no se rediseña, no se le cambia la forma ni los rayos. El
  negro y oro aplica solo al entorno. El componente `Logo.tsx` fue
  revertido a su versión original cromada con rayos de neón.
- **Panel lateral (2026-11-10):** lista de personas en línea ANGOSTA
  y compacta a un lado (unos 220 px, filas pequeñas), FIJA (no se va
  al mover la pantalla, siempre visible a un lado); TODO el resto del
  contenido en la parte central, muy bien distribuido y centralizado.
  En el teléfono se abre y se cierra, nunca escondida abajo.
- **Identidad APROBADA (2026-11-10):** la muestra v4 fue rechazada
  por Jhon ("Espera espera, ese diseño no me gusta": el cuadro de
  personas en línea era muy grande y la página estaba mal
  organizada). Corregido en la muestra v7 y APROBADO por Jhon
  ("Sí me gusta así"). **La muestra v7
  (`el-reto-negro-oro-v7.html`) es la referencia final de
  organización:** lista en línea pequeña, angosta (200 px) y FIJA a
  un lado (siempre visible al mover la pantalla), y todo el contenido
  centrado y bien distribuido (envoltura centrada, máx. 1.080 px).
  Filas de la lista: solo nombre y estado. En el teléfono la lista
  queda fija arriba (sticky), nunca se pierde al bajar.
- **Estado:** EN CONSTRUCCIÓN con este estilo aprobado; la
  organización sigue la muestra v7.

## Mejoras guardadas en memoria — estado en el MVP (pedido de Jhon 2026-11-10)

Orden fijado por Jhon: primero que el juego en vivo funcione; luego
las mejoras. Lo que es fase posterior por su tamaño queda con la
base/esquema listo y registrado aquí y en ROADMAP.md, sin descartar
nada.

| N.º | Mejora | Estado |
|---|---|---|
| 1 | Ranking de victorias con rachas, visible en la plataforma | MVP (rachas actual/mejor en `rankings`, visibles en /ranking y perfil) |
| 2 | Nombres de usuario únicos | MVP (unicidad sin distinción de mayúsculas) |
| 3 | Entrar con Gmail o Facebook (Gmail primero) | MVP código OAuth; PENDIENTE credenciales de cliente de Jhon (Google/Facebook) para activarlo |
| 4 | Más juegos rápidos: damas, damas chinas, conecta cuatro | Motor modular MVP (interfaz `GameEngine` + registro); RPS completo primero; los otros tres como `COMING_SOON` (SIGUIENTE FASE, sin lógica aún) |
| 5 | Torneos relámpago de 8 jugadores | SIGUIENTE FASE (esquema de torneos listo en V004, sin endpoints ni lógica) |
| 6 | Tarjeta del ganador para compartir por WhatsApp y Facebook | MVP (componente WinnerCard + enlaces wa.me y sharer de Facebook) |
| 7 | Sonidos y vibración | MVP (WebAudio + navigator.vibrate, desactivados por defecto) |
| 8 | Modo espectador | MVP (WS `match:watch`, vista de solo lectura) |
| 9 | Niveles con insignias | Nivel calculado MVP (desde puntos, visible en ranking/perfil); insignias SIGUIENTE FASE (esquema listo en V004) |
| 10 | Reto diario con mensajes rápidos | MVP (GET /challenges/daily + mensajes rápidos por WS) |
| 11 | Lista en línea REAL entre dispositivos | MVP (presencia real con Redis + WebSockets, no por sesión) |
| 12 | Invitación por Facebook y WhatsApp y compartir resultados | MVP por enlaces (wa.me y sharer, sin SDK ni login social) |

## Decisiones ya aprobadas por Jhon (no son dudas)

- Nombre de la plataforma: **El Reto**.
- Cualquiera con el enlace puede crear un reto; retos públicos y privados.
- Formatos: 1 ronda / mejor de 3 / mejor de 5 / libre (mejor de 3 por defecto).
- Al entrar se pide un nombre; nombres de usuario únicos (no se repiten).
- Lista de personas en línea con estados: LIBRE, JUGANDO, POR JUGAR,
  RETO PENDIENTE, RETO GENERADO, POR INVITAR.
- Ranking de victorias (con Supabase en el plan original; en el MVP la
  fuente es PostgreSQL).
- Registro con cuentas de Gmail u otros correos, para después del MVP.
- Identidad visual: NEGRO Y ORO de lujo (negro profundo, dorado
  #f5c542 / #ffe98a / #c9962e, plateado #c0c0c0, fondo de juegos y
  azar, fotos reales de trofeo y manos en movimiento, confeti dorado
  y rayos de energía en la arena y la celebración). El LOGO NO SE
  CAMBIA: VS cromado con rayos de neón (opción 1, sin cambios por
  orden de Jhon 2026-11-10). La identidad azul-violeta anterior
  queda sustituida; el estilo negro y oro está en construcción
  pendiente del veredicto definitivo de Jhon (D12).
  Sistema de diseño completo en `apps/web/DESIGN.md`; ante cualquier
  diferencia entre el doc 04 y la muestra negro y oro, manda la
  muestra.
- Stack de producción: Next.js + React + TypeScript, NestJS + Node.js,
  PostgreSQL, Redis, WebSockets, Docker, REST con OpenAPI.
- Billetera solo DEMO/SANDBOX; sin dinero real en la primera versión.

## Decisiones de integración (2026-11-10 — del equipo, NO de Jhon)

- **Guards unificados:** el guardia canónico es el `JwtAuthGuard` de
  Auth (`apps/api/src/modules/auth/guards/jwt-auth.guard.ts`, resuelve
  el rol desde BD y verifica que la sesión no esté revocada); admin con
  `JwtAuthGuard + RolesGuard + @Roles('ADMIN')`. Se eliminaron los
  provisionales (`modules/wallet/guards/`, `modules/wallet/decorators/`,
  `common/auth/auth-common.module.ts`, `common/auth/jwt-auth.guard.ts`,
  `common/auth/current-user.decorator.ts` y sus specs). Se conserva
  `common/auth/auth-user.interface.ts` solo como tipo mínimo
  (`{id, username, displayName, role}`) que usan el motor de juego y el
  gateway; no es un guard ni un decorador.
- **Adaptador billetera↔juego:** `WalletPort` no cambia de firma (los
  tests del motor lo verifican exacto). Lo implementa
  `modules/game/wallet.adapter.ts` sobre núcleos transaccionales nuevos
  de `WalletService` (`holdStakeInTx`, `releaseStakeInTx`, `payoutInTx`,
  `grantDailyPrizeInTx`), que se ejecutan dentro de la transacción del
  motor de juego. `payoutWin` resuelve el perdedor consultando la
  partida (`match:<id>`). Los `referenceId` del juego no son UUID y
  `wallet_transactions.reference_id` sí lo es: el adaptador extrae el
  UUID de partida/reto o pasa `null`; la idempotencia la da la clave
  (`hold:`/`release:`/`payout:`/`daily-prize:` + `referenceId`).
- **Bono de bienvenida cableado:** `AuthService` llama a
  `WalletService.grantWelcomeBonus` al registrar, al convertir un
  invitado y al registrarse por OAuth (idempotente, clave
  `welcome:<userId>`). Si la billetera no está inyectada (tests
  unitarios) se omite; si falla, se registra el error y no se bloquea
  el registro (el bono se puede conceder después con la misma llamada).
- **Ciclo Auth↔Wallet:** resuelto con `forwardRef` en ambos módulos
  (Auth necesita `WalletService` para el bono; Wallet necesita
  `AuthModule` para los guards). `AuthModule` re-exporta `JwtModule`
  (lo usa el gateway WebSocket para verificar el token del handshake).
- **BIGINT de PostgreSQL (corrección de integración 2026-11-10):**
  node-postgres devuelve BIGINT como string; sin parseo, la aritmética
  de créditos concatenaba texto (`"1000" + 500 = "1000500"`) y la
  apuesta leída de BD llegaba como string al aceptar un reto
  (`AMOUNT_MUST_BE_POSITIVE_INTEGER`). Se parsea int8 a `number` de
  forma global en `database.module.ts`
  (`types.setTypeParser(20, v => parseInt(v, 10))`). Los importes son
  enteros pequeños (créditos DEMO), sin riesgo de precisión.
- **Tokens de BD en archivo propio (corrección 2026-11-10):** la app
  no arrancaba (`UndefinedDependencyException` en `DatabaseService`):
  `database.module.ts` definía `PG_POOL`/`REDIS_CLIENT` y
  `database.service.ts` los importaba de él, así que según el orden de
  carga el `@Inject(PG_POOL)` evaluaba `undefined`. Los tokens viven
  ahora en `database/database.tokens.ts` (sin importaciones);
  `database.module` los re-exporta por compatibilidad.
- **Carrera en el handshake WebSocket (corrección 2026-11-10):** la
  autenticación del gateway es asíncrona (consulta a BD) y socket.io
  entrega los mensajes del cliente en cuanto llega el `connect`: un
  `match:join` inmediato veía `client.data.user` sin definir y fallaba
  con UNAUTHORIZED aunque el token fuera válido (el segundo jugador no
  entraba a la sala en la prueba en vivo, 3 de 3 veces). Ahora
  `handleConnection` crea una promesa `authReady` antes de cualquier
  `await` y `getUser()` la espera; los 6 manejadores la usan con
  `await`. Sin este cambio la partida en vivo entre dos clientes no
  era fiable.
- **Migraciones V001/V005 (corrección de integración 2026-11-10):**
  V001 no aplicaba (`UNIQUE (lower(username))` no es válido en una
  restricción de tabla: la unicidad va como índice único) y V005 no
  aplicaba (`ON CONFLICT (username)` sin índice que lo respalde: el
  árbitro es `ON CONFLICT (lower(username))`). Ninguna de las dos se
  había aplicado nunca (la transacción revertía), así que la corrección
  es en los propios archivos.
