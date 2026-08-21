# syntax=docker/dockerfile:1

# Imagen de PRODUCCION del frontend (Next.js standalone). Multi-stage: se
# compila en `builder` y la imagen final solo lleva el servidor autocontenido
# (.next/standalone) + los assets estaticos, sin el codigo fuente ni el
# node_modules completo. Para desarrollo con hot-reload se usa el servicio
# `web` de docker-compose.yml (bind mount + `next dev`), no esta imagen.

# ----- builder -----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable

# Dependencias primero (mejor cache): solo se reinstalan si cambian
# package.json / lockfile.
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

# Los NEXT_PUBLIC_* se incrustan en el bundle al compilar, asi que deben estar
# presentes ANTES de `pnpm build` (definirlos en `docker run` no tiene efecto).
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ARG NEXT_PUBLIC_API_MODE=api
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_API_MODE=${NEXT_PUBLIC_API_MODE}
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ----- runner -----
FROM node:22-bookworm-slim AS runner
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
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
