# syntax=docker/dockerfile:1
# Imagen de producción del CRM (Next.js) — usada por EasyPanel

# La base NO se baja de Docker Hub: los pulls anónimos están limitados por IP
# y el deploy corre con --no-cache, así que cada build se re-descargaba la
# imagen y terminaba en "429 Too Many Requests". public.ecr.aws es el espejo
# oficial de las mismas imágenes, sin ese límite.
# Alternativa equivalente: mirror.gcr.io/library/node:22-alpine
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-alpine

# ── Dependencias ─────────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Build ────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Las NEXT_PUBLIC_* se incrustan en el bundle del cliente durante el build,
# por eso llegan como build-args y no como variables de runtime.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Runtime ──────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
