# syntax=docker/dockerfile:1.7
# One build, three images:
#   docker build --target api    -t qualify-api .
#   docker build --target worker -t qualify-worker .
#   docker build --target web    -t qualify-web .     (Caddy: website, static dashboard + /api proxy)
# The website (apps/site, D-101) takes its settings as build arguments, e.g.
#   --build-arg VITE_SITE_URL=https://qualify.appsdemo.in --build-arg VITE_SITE_WHATSAPP_NUMBER=91…
ARG NODE_IMAGE=node:26.13.1-alpine
ARG CADDY_IMAGE=caddy:2.10-alpine

FROM ${NODE_IMAGE} AS base
# Node 26 no longer bundles corepack (see docs/MILESTONES.md prerequisites).
RUN npm install -g pnpm@12.21.0
ENV CI=true
WORKDIR /repo

FROM base AS build
# Manifests first, so dependency layers are reused when only source changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY apps/site/package.json apps/site/
COPY packages/shared/package.json packages/shared/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/integrations/package.json packages/integrations/
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_SITE_URL=""
ARG VITE_SITE_WHATSAPP_NUMBER=""
ARG VITE_SITE_PRODUCT_NAME=""
ARG VITE_SITE_APP_URL=""
ENV VITE_SITE_URL=$VITE_SITE_URL \
  VITE_SITE_WHATSAPP_NUMBER=$VITE_SITE_WHATSAPP_NUMBER \
  VITE_SITE_PRODUCT_NAME=$VITE_SITE_PRODUCT_NAME \
  VITE_SITE_APP_URL=$VITE_SITE_APP_URL
RUN pnpm build
# Self-contained folders with production dependencies only (workspace packages copied in).
RUN pnpm --filter @qualify/api deploy --legacy --prod /out/api \
  && pnpm --filter @qualify/worker deploy --legacy --prod /out/worker

FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "dist/main.js"]

FROM ${NODE_IMAGE} AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/worker ./
USER node
CMD ["node", "dist/main.js"]

FROM ${CADDY_IMAGE} AS web
COPY deploy/prod/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
COPY --from=build /repo/apps/site/dist /srv/site
