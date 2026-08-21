# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Zyton Platform** — Hub centralizado de gestión empresarial para ZytonAI. Incluye gestión de leads, clientes, chat integrado con WhatsApp, tablero To Do del equipo, y agentes de IA.

**Equipo (4 personas)**: Samuel, Camilo, Santiago y Daniel. Es un workspace **compartido**: los cuatro ven y editan los mismos leads, clientes, facturas, calendario, wiki y chat. `owner_id` sigue existiendo en las tablas como autoría (quién creó el registro), pero no restringe visibilidad. Lo único personal es el historial de Diana (`diana_messages`, `diana_tasks`, `diana_action_log`).

La lista del equipo vive en `src/lib/team.ts` (fuente única). Al cambiarla, actualizar también el `CHECK (assignee IN ...)` de `supabase/migrations/014_tasks.sql` y la lista `TEAM` de `scripts/create-users.mjs`.

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
      todo/               # Tablero de tareas por persona
      leads/
      clients/
      chat/
      agents/
    api/
      auth/callback/      # Callback de Supabase Auth
      tasks/              # CRUD del To Do
      leads/              # CRUD (Stage 2)
      clients/            # CRUD (Stage 2)
      attachments/        # Upload a Supabase Storage (Stage 2)
      whatsapp/           # Proxy al WA service (Stage 3)
  components/
    layout/Sidebar.tsx    # Navegación principal
    layout/TopBar.tsx     # Header con usuario
    ui/                   # Componentes shadcn/ui
  lib/
    team.ts               # Los 4 miembros del equipo (slug, nombre, email, color)
    supabase/client.ts    # Browser client (anon key)
    supabase/server.ts    # Server client (cookies)
  middleware.ts           # Redirige no-autenticados a /login

whatsapp-service/         # Servicio Node.js separado (Stage 3)
scripts/create-users.mjs  # Alta de las cuentas del equipo en Supabase Auth
supabase/migrations/      # SQL con schema y políticas RLS
```

## Supabase — Setup manual

1. Crear proyecto en supabase.com
2. Copiar URL y anon key a `.env.local`
3. Ir a SQL Editor y ejecutar las migraciones de `supabase/migrations/` en orden numérico
4. Crear bucket privado llamado `attachments` en Storage
5. Agregar políticas de storage (ver comentarios al final del SQL)

## Etapas de desarrollo

| Stage | Contenido | Estado |
|---|---|---|
| 1 | Fundación, Auth, Sidebar | Completado |
| 2 | CRM: Leads y Clientes | Pendiente |
| 3 | Chat / WhatsApp integrado | Pendiente |
| 4 | Agentes IA + Polish | Pendiente |

## Usuarios del equipo

Las cuentas de login se crean con el service role, nunca desde el navegador:

```bash
node scripts/create-users.mjs           # crea las que falten
node scripts/create-users.mjs --reset   # además resetea contraseñas existentes
```

Imprime las contraseñas temporales una sola vez — hay que compartirlas y pedir que las cambien.
