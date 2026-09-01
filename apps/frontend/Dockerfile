# syntax=docker/dockerfile:1

# Imagen de PRODUCCION del frontend (Next.js standalone). Multi-stage: se
# compila en `builder` y la imagen final solo lleva el servidor autocontenido
# (.next/standalone) + los assets estaticos, sin el codigo fuente ni el
# node_modules completo. Para desarrollo con hot-reload se usa el servicio
# `web` de docker-compose.yml (bind mount + `next dev`), no esta imagen.

# ----- builder -----
FROM node:24.3.0-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable

# El contexto es la raiz del workspace. Incluimos todos los manifests que
# participan en el lockfile antes de instalar para conservar la cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @citari/frontend...

COPY apps/frontend ./apps/frontend
WORKDIR /app/apps/frontend

# Los NEXT_PUBLIC_* se incrustan en el bundle al compilar, asi que deben estar
# presentes ANTES de `pnpm build` (definirlos en `docker run` no tiene efecto).
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ----- runner -----
FROM node:24.3.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuario sin privilegios.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# El output standalone trae su propio server.js + un node_modules minimo.
# `public` y `.next/static` no van dentro de standalone: se copian aparte.
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static ./apps/frontend/.next/static

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "apps/frontend/server.js"]
