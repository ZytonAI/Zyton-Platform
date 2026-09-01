# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Zyton Platform** — Hub centralizado de gestión empresarial para ZytonAI. Incluye gestión de leads, clientes, chat integrado con WhatsApp, y agentes de IA (futuro).

**Equipo (4 personas)**: Samuel, Camilo, Santiago y Daniel. Es un workspace **compartido**: los cuatro ven y editan los mismos leads, clientes, calendario, wiki, chat y tareas. `owner_id` sigue en las tablas como autoría (quién creó el registro), pero ya no restringe visibilidad. Lo único personal es el historial de Diana (`diana_messages`, `diana_tasks`, `diana_action_log`).

**Etiquetas de equipo**: leads y clientes llevan el slug de quién los trabaja — `leads.contacted_by / closed_by / scheduled_by` y `clients.closed_by / scheduled_by` (migración 018). De ahí sale el filtro del chat: una conversación es de quien contactó su lead (o cerró su cliente); las que no tienen dueño las ven los cuatro. Abrir el chat de un lead sin etiqueta lo marca automáticamente como contactado por quien lo abrió.

El chat además tiene su propia etiqueta, `conversations.assigned_to` (migración 021), que manda sobre la del lead: un número que todavía no es lead también se puede repartir. Asignar desde el hilo escribe las dos cuando hay lead.

**KPI de la quincena**: la meta es **30 contactos por persona cada quincena** — 25 en frío y 5 con investigación previa del negocio. Se mide con dos columnas de `leads` (migración 022): `contact_type` (`frio` | `investigado`, la etiqueta que se pone al contactar) y `contacted_at` (la fecha, que decide en qué quincena cae). La quincena va del 1 al 15 y del 16 a fin de mes, hora de Colombia; las cuentas y las metas viven en `src/lib/kpi.ts` y el bloque lo ven los cuatro en el Dashboard.

Lo que cuenta para la meta es la **etiqueta**, no la fecha: un contacto sin `contact_type` no suma ni en el total ni en ninguna de las dos sub-metas, solo aparece como "sin etiquetar · no cuentan". Así, quitarle la etiqueta a un lead lo descuenta de las dos cuentas a la vez.

`contacted_at` la pone sola la base con un trigger. La etiqueta manda sobre ella: ponerla la sella, quitarla la borra (migración 023), de forma que volver a etiquetar más adelante cae en la quincena en la que se etiquetó y no en la vieja. Asignarle un `contacted_by` o moverlo a un estado de contactado también la sellan cuando está vacía — son los que hacen que el lead salga como "sin etiquetar". Solo en UPDATE: Raúl inserta sus leads ya con `contacted_by` (quién los *va* a contactar), y eso no cuenta. La etiqueta se pone desde la ficha del lead, el menú de la tarjeta en la lista y el encabezado del chat de WhatsApp. Borrar un chat borra la etiqueta y la fecha del lead vinculado: sin conversación no hay contacto que contar (`contacted_by` se queda, que es otra cosa).

**Tablero To Do**: una tarea completada se borra sola el día siguiente a su fecha — el día de la fecha sigue a la vista aunque ya esté hecha. La limpieza (`src/lib/task-cleanup.ts`) corre al abrir el tablero y en `GET /api/tasks`, no en un cron: solo importa que no estén cuando alguien mira. Las que no se completaron se quedan y se pintan con fondo rojo claro. Las tareas sin fecha nunca se borran solas.

**Calendario y Wiki**: cada evento y cada página es `team` (lo ve el equipo, default) o `personal` (solo quien lo creó, garantizado por RLS). Migraciones 018 y 019.

**Quién hizo qué**: `owner_id` (creador) se traduce a persona con `src/lib/directory.ts` y se pinta en el historial, los adjuntos, los mensajes de WhatsApp salientes, la Wiki y las fichas. El contexto de sesión (`SessionContext`) lleva rol, slug propio y ese directorio.

**Avisos**: asignar una tarea o etiquetar un lead a alguien le manda un Telegram (`src/lib/notify-member.ts`); nunca a uno mismo. Raúl manda un solo aviso por lote.

**Ediciones simultáneas**: los formularios de lead y cliente mandan el `updated_at` con el que abrieron la ficha; si en la base hay uno más nuevo, la API responde 409 en vez de pisar el cambio ajeno (`src/lib/concurrency.ts`).

**Solo el Dueño** puede cerrar la sesión de WhatsApp: el número lo comparten los cuatro.

**Roles**: hay dos, definidos en `src/lib/permissions.ts`.

| Rol | Quién | Qué ve |
|---|---|---|
| `owner` — Dueño | Samuel | Todo |
| `partner` — Socio Estratégico | Camilo, Santiago, Daniel | Todo menos los cobros |

Para un Socio Estratégico se oculta: el ítem **Facturas** del sidebar y la ruta `/invoices` (redirige a `/dashboard`), la API `/api/invoices/*` (403), las tarjetas y gráficos de dinero del Dashboard, el bloque "Cobro al cliente" y las facturas en la ficha de cliente, y la tool `get_invoices` de Diana.

Se aplica en tres capas: UI (`RoleProvider` / `useIsOwner`), servidor (`src/lib/auth/session.ts` → `getSession`, `denyIfNotOwner`) y base (`profiles.role` + `is_owner()` + RLS de `invoices`, migración `017_roles.sql`). El rol de la app se deriva del email con `src/lib/team.ts`; quien no esté en esa lista entra como `partner`.

Excepción conocida: `clients.billing_type` / `billing_amount` viven en la tabla compartida `clients` y RLS filtra filas, no columnas. La app las anula antes de mandarlas al navegador (`hideBilling` en `src/lib/client-billing.ts`), pero un Socio Estratégico que consultara Supabase directo con la anon key aún las vería. Cerrarlo del todo pide una vista sin esas columnas.

**Ver como**: el Dueño puede mirar la plataforma con los ojos de un Socio Estratégico sin pedirle la contraseña a nadie — desplegable "Ver como" en el pie del menú lateral. Pone una cookie `zyton_view_as` (`src/lib/view-as.ts`) que `getSession` traduce a un `role` y un `member` prestados; `realRole` / `realMember` siguen siendo los suyos y son los que autorizan entrar y salir, así que una cookie puesta a mano por un Socio Estratégico no hace nada. Mientras dura hay una franja amarilla en todas las páginas.

Es una vista de la **interfaz**: la sesión de Supabase sigue siendo la del Dueño, así que RLS y `owner_id` no cambian. Lo personal del otro (sus eventos privados del calendario, su historial de Diana) no se ve, y lo que se cree mientras tanto queda etiquetado a nombre de la persona prestada.

**Login por usuario, no por email**: se entra con `SamuelZY`, `CamiloZY`, `SantiagoZY`, `DanielZY`. Supabase Auth guarda un email por debajo; `POST /api/auth/login` traduce usuario → email (vía `profiles.username`, con service role) y firma en el servidor.

La lista del equipo vive en `src/lib/team.ts` (fuente única: usuario, email, color y **rol**). Al cambiarla, actualizar también el `CHECK (assignee IN ...)` de `014_tasks.sql`, los usuarios de `015_usernames.sql`, los roles de `017_roles.sql` y la lista `TEAM` de `scripts/create-users.mjs`.

## Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Estilos**: Tailwind CSS v4 + shadcn/ui
- **Base de datos + Auth**: Supabase (PostgreSQL + RLS + Storage)
- **WhatsApp**: whatsapp-web.js en servicio Node.js separado (`whatsapp-service/`)
- **Hosting**: EasyPanel con Docker — el `Dockerfile` de la raíz para el CRM y otro app para el WA service

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

**Deploy**: EasyPanel construye el `Dockerfile` de la raíz (multi-stage, `output: "standalone"` en `next.config.ts`). Las `NEXT_PUBLIC_*` se incrustan en el bundle durante el build → van como **build args**, no como variables de runtime. Detalle en el [README](README.md).

**Cron**: `/api/diana/invoice-reminder` lo dispara la propia app. `src/instrumentation.ts` corre una vez al arrancar el servidor y programa la tarea diaria en `src/lib/cron.ts` (default 14:00 UTC = 9:00 a.m. Colombia). Necesita `CRON_SECRET`; se ajusta con `INVOICE_REMINDER_AT` y se apaga con `DISABLE_CRON=1`. Ver README.

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
      todo/               # Tablero de tareas por persona (limpia las cumplidas al abrirse)
      leads/
      clients/
      chat/
      agents/
    api/
      auth/callback/      # Callback de Supabase Auth
      tasks/              # CRUD del To Do
      auth/login/         # Login por usuario → email + sesión
      invoices/           # CRUD de facturas — solo el Dueño (403 al resto)
      leads/              # CRUD
      clients/            # CRUD
      attachments/        # Upload a Supabase Storage
      diana/              # Chat de Diana, Telegram y cron de facturas
      agents/             # Raúl (busca leads en Google Places)
      whatsapp/           # Proxy al WA service
      view-as/            # El Dueño entra/sale de la vista de un Socio
  components/
    layout/Sidebar.tsx    # Navegación principal (filtrada por rol)
    layout/SessionContext.tsx # useRole / useIsOwner / useMySlug / useMemberById
    shared/MemberTag.tsx  # Desplegable y badges de los miembros del equipo
    layout/TopBar.tsx     # Header con usuario
    ui/                   # Componentes shadcn/ui
  lib/
    team.ts               # Los 4 miembros (usuario, nombre, email, color, rol)
    kpi.ts                # Meta de la quincena: 30 contactos (25 en frío, 5 investigados)
    view-as.ts            # Cookie de la vista prestada del Dueño
    permissions.ts        # Roles owner/partner y qué puede ver cada uno
    auth/session.ts       # getSession / denyIfNotOwner para páginas y API
    cron.ts               # Tarea diaria de facturas (reemplaza al cron de Vercel)
    conversation-scope.ts # Qué chats de WhatsApp le tocan a cada persona
    directory.ts          # owner_id → miembro del equipo
    task-cleanup.ts       # Borra las tareas completadas al día siguiente de su fecha
    concurrency.ts        # 409 si dos personas editan el mismo registro
    notify-member.ts      # Avisos de "te asignaron esto" por Telegram
    pg-compat.ts          # Reintenta sin la columna si falta la migración
    wa-session.ts         # Sesión de WhatsApp del workspace (una sola)
    supabase/client.ts    # Browser client (anon key)
    supabase/server.ts    # Server client (cookies)
  proxy.ts                # Middleware de Next 16 — redirige no-autenticados a /login
  instrumentation.ts      # Arranca el cron interno al levantar el servidor

whatsapp-service/         # Servicio Node.js separado (tiene su propio repo, ver abajo)
scripts/create-users.mjs  # Alta de las cuentas del equipo en Supabase Auth
supabase/migrations/      # SQL con schema y políticas RLS
```

## Supabase — Setup manual

1. Crear proyecto en supabase.com
2. Copiar URL y anon key a `.env.local`
3. Ir a SQL Editor y ejecutar las migraciones de `supabase/migrations/` en orden numérico (hay números repetidos — 008, 009, 010, 013, 014, 015 — porque salieron de ramas paralelas; dentro del mismo número el orden da igual)

   La migración va **antes** del deploy. Si se despliega primero, `src/lib/pg-compat.ts` evita que reviente: guarda el registro sin las columnas nuevas y deja un aviso `[pg-compat]` en los logs — pero el dato nuevo de ese guardado se pierde.
4. Crear bucket privado llamado `attachments` en Storage
5. Agregar políticas de storage (ver comentarios al final del SQL)

## Estado

Todo lo planeado está en producción: auth y roles, CRM de leads y clientes, facturas, calendario, wiki, tablero To Do, chat de WhatsApp, el agente Raúl y Diana.

## WhatsApp — cosas que muerden

**El id del mensaje.** WhatsApp Web no siempre trae `msg.id._serialized`; en los chats `@lid` viene vacío. El bridge lo reconstruye (`messageId`) y se lo devuelve al objeto antes de bajar adjuntos (`ensureSerializedId`), porque `downloadMedia()` lo usa como llave — sin eso todo adjunto quedaba como "[Archivo no disponible]".

**El eco de lo que uno manda.** `client.sendMessage` puede devolver `undefined` aunque el mensaje salga, así que la fila se guarda sin `wa_message_id` y el evento `message_create` llega como si lo hubieran escrito desde el celular. Las rutas `/send` y `/send-file` y el webhook lo reconcilian (mismo chat, mismo texto o archivo por archivo, menos de 2 minutos) para no pintar la burbuja dos veces. Ante la duda se inserta: repetir una burbuja es mejor que tragarse un mensaje.

**`@lid` no es un teléfono.** Los chats nuevos llegan identificados como `269152866533531@lid`. El bridge lo traduce con `getContactLidAndPhone` y el webhook cura las conversaciones viejas (teléfono real + vínculo al lead) cuando entra el siguiente mensaje.

## whatsapp-service — de dónde se despliega

EasyPanel despliega el WA service desde **este** repo, carpeta `whatsapp-service/`: subir a `main` es todo lo que hace falta, el despliegue sale solo.

Existe además un repo aparte (`ZytonAI/whatsapp-service-`) con una copia vieja y divergida de la misma carpeta. No es el que corre en producción — no hay que portarle nada ni tomarlo como referencia.

## Usuarios del equipo

| Persona | Usuario | Rol | Email (interno, no se escribe al entrar) |
|---|---|---|---|
| Samuel | `SamuelZY` | Dueño | zyton.automation@gmail.com |
| Camilo | `CamiloZY` | Socio Estratégico | camilo@zytonai.com |
| Santiago | `SantiagoZY` | Socio Estratégico | santiago@zytonai.com |
| Daniel | `DanielZY` | Socio Estratégico | daniel@zytonai.com |

Las cuentas se crean con el service role, nunca desde el navegador:

```bash
node scripts/create-users.mjs                        # crea las que falten
node scripts/create-users.mjs --reset                # resetea todas las contraseñas
node scripts/create-users.mjs --reset --only=samuel  # solo una persona
```

Borrar el historial de WhatsApp (mensajes, conversaciones y media del bucket
`wa-media`; no toca el bucket `attachments` ni el resto del CRM):

```bash
node scripts/wipe-whatsapp.mjs         # dry run: solo cuenta
node scripts/wipe-whatsapp.mjs --yes   # borra de verdad
```

Imprime las contraseñas una sola vez — hay que compartirlas y pedir que las cambien.
