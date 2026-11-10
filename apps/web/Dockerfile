FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace=apps/web || npm install --workspace=apps/web

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./apps/web
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
RUN npm run build

FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/.next/static ./.next/static
COPY --from=build /app/apps/web/public ./public
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "server.js"]
