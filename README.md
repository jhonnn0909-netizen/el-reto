# El Reto — Plataforma universal de juegos en vivo (MVP)

Plataforma web de juegos rápidos con ganador y perdedor. Empieza con
**piedra, papel o tijera** en vivo entre dos jugadores. Créditos
**exclusivamente virtuales (DEMO/SANDBOX, sin valor real, sin dinero real)**.

> Estado: MVP Fase 1 en construcción. El prototipo estático anterior
> (GitHub Pages) sigue funcionando por separado y NO forma parte de este
> repositorio. Este proyecto es la plataforma de producción.

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS |
| Backend | NestJS 11 + Node.js 20 + TypeScript |
| Base de datos | PostgreSQL 16 (migraciones SQL versionadas, SQL puro + `pg`) |
| Caché / presencia | Redis 7 (`ioredis`) |
| Tiempo real | WebSockets (`socket.io`) |
| API | REST `/api/v1` documentada con OpenAPI (Swagger en `/api/docs`) |
| Infraestructura | Docker + Docker Compose |

## Estructura

```
el-reto/
├── apps/
│   ├── web/        # Frontend Next.js
│   └── api/        # Backend NestJS
├── docker-compose.yml
├── .env.example
├── CONTRACTS.md    # Contrato compartido: esquema DB, API, WebSocket, convenciones
└── DECISIONS.md    # Dudas abiertas (lo no decidido por Jhon NO es requisito)
```

## Instalación y ejecución (Docker)

```bash
cp .env.example .env
# Editar .env con secretos propios (nunca subir .env al repositorio)
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1
- Documentación OpenAPI: http://localhost:4000/api/docs
- Las migraciones se aplican automáticamente al arrancar la API
  (`npm run migrate`).

## Desarrollo local (sin Docker)

```bash
npm install
# Levantar PostgreSQL 16 y Redis 7 locales y ajustar .env
npm run migrate
npm run dev:api    # terminal 1
npm run dev:web    # terminal 2
```

## Billetera DEMO

- La moneda es el **crédito virtual** (entero, sin decimales), etiquetada
  siempre como "créditos virtuales (demo, sin valor real)".
- No hay pagos, tarjetas, bancos ni dinero real. Los depósitos y retiros
  son simulaciones.
- Ledger de doble partida, inmutable, con idempotencia y auditoría.
  Ver `apps/api/src/modules/wallet/` y `CONTRACTS.md`.

## Pruebas

```bash
npm run test:api   # Jest: autenticación, billetera, motor de juego
npm run test       # todos los workspaces
```

## Despliegue

Ver la documentación de operaciones del proyecto (DevOps) en la carpeta
de documentación. La primera versión es **DEMO/SANDBOX** hasta obtener
las autorizaciones y revisiones necesarias. No habilitar operaciones
reales, pagos reales ni apuestas con dinero real.
