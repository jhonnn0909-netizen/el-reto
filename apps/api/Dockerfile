FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci --workspace=apps/api --include=dev || npm install --workspace=apps/api
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npm run build

FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY apps/api/package.json ./package.json
RUN npm install --omit=dev
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/src/database/migrations ./dist/database/migrations
EXPOSE 4000
CMD ["sh", "-c", "node dist/database/migrate.js && node dist/main"]
