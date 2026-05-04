# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Zyton Platform** — Hub centralizado de gestión empresarial para ZytonAI. Incluye gestión de leads, clientes, chat integrado con WhatsApp, y agentes de IA (futuro).

## Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Estilos**: Tailwind CSS v4 + shadcn/ui
- **Base de datos + Auth**: Supabase (PostgreSQL + RLS + Storage)
- **WhatsApp**: whatsapp-web.js en servicio Node.js separado (Stage 3)
- **Hosting**: Vercel (frontend) + Railway/VPS (WA service)

## Setup

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con las claves de Supabase

# Correr servidor de desarrollo
npm run dev
```

## Build y Deploy

```bash
npm run build    # Build de producción
npm run start    # Servidor de producción local
npm run lint     # ESLint
```

## Variables de entorno requeridas

Ver `.env.example` para la lista completa. Las reglas de seguridad críticas:
- `NEXT_PUBLIC_*` — solo valores seguros para el browser (Supabase URL y anon key)
- `SUPABASE_SERVICE_ROLE_KEY` — NUNCA con prefijo `NEXT_PUBLIC_`, solo en API Routes
- `WA_BRIDGE_TOKEN` — NUNCA en el cliente, solo en servidor

## Arquitectura

```
src/
  app/
    (auth)/login/         # Página de login (no usa sidebar)
    (platform)/           # Rutas con sidebar — require auth
      layout.tsx          # Valida sesión server-side, muestra Sidebar
      dashboard/
      leads/
      clients/
      chat/
      agents/
    api/
      auth/callback/      # Callback de Supabase Auth
      leads/              # CRUD (Stage 2)
      clients/            # CRUD (Stage 2)
      attachments/        # Upload a Supabase Storage (Stage 2)
      whatsapp/           # Proxy al WA service (Stage 3)
  components/
    layout/Sidebar.tsx    # Navegación principal
    layout/TopBar.tsx     # Header con usuario
    ui/                   # Componentes shadcn/ui
  lib/
    supabase/client.ts    # Browser client (anon key)
    supabase/server.ts    # Server client (cookies)
  middleware.ts           # Redirige no-autenticados a /login

whatsapp-service/         # Servicio Node.js separado (Stage 3)
supabase/migrations/      # SQL con schema y políticas RLS
```

## Supabase — Setup manual

1. Crear proyecto en supabase.com
2. Copiar URL y anon key a `.env.local`
3. Ir a SQL Editor y ejecutar `supabase/migrations/001_initial_schema.sql`
4. Crear bucket privado llamado `attachments` en Storage
5. Agregar políticas de storage (ver comentarios al final del SQL)

## Etapas de desarrollo

| Stage | Contenido | Estado |
|---|---|---|
| 1 | Fundación, Auth, Sidebar | Completado |
| 2 | CRM: Leads y Clientes | Pendiente |
| 3 | Chat / WhatsApp integrado | Pendiente |
| 4 | Agentes IA + Polish | Pendiente |
