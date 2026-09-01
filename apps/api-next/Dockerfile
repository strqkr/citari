FROM node:24.3.0-bookworm-slim AS build

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

ARG DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
ENV DATABASE_URL=$DATABASE_URL
ENV CI=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-next/package.json ./apps/api-next/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN pnpm install --frozen-lockfile --filter @citari/api-next...

COPY apps/api-next ./apps/api-next
WORKDIR /app/apps/api-next
RUN pnpm db:generate && pnpm build && pnpm prune --prod

FROM node:24.3.0-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app/apps/api-next

COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/apps/api-next/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api-next/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/api-next/dist ./dist
COPY --from=build --chown=node:node /app/apps/api-next/prisma ./prisma

USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8000/api/v1/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
