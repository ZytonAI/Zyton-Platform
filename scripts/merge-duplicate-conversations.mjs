/**
 * Une las conversaciones de WhatsApp que quedaron partidas en dos.
 *
 *   node scripts/merge-duplicate-conversations.mjs         → solo muestra qué haría (dry run)
 *   node scripts/merge-duplicate-conversations.mjs --yes   → une de verdad
 *
 * Por qué existe:
 *   El webhook buscaba la conversación filtrando por `owner_id`, que en un
 *   mensaje entrante es el de la SESIÓN de WhatsApp (una sola, la de Samuel).
 *   El chat que Daniel o Santiago abrían desde un lead quedaba invisible, así
 *   que al responder el lead se creaba una segunda fila: una con
 *   `<telefono>@c.us` y otra con el `<id>@lid`, la misma persona en dos hilos.
 *
 *   El webhook ya no filtra por `owner_id` y además busca por `wa_lid`, así que
 *   esto no se repite. Este script limpia las que quedaron de antes.
 *
 * Qué hace con cada par:
 *   - sobrevive la fila de `<telefono>@c.us` — es la que la ficha del lead
 *     espera encontrar. Si no hay ninguna, sobrevive la más antigua.
 *   - los mensajes de la otra se mueven a la que sobrevive
 *   - se completan los huecos: lead_id, client_id, nombre, wa_lid, el último
 *     mensaje y la suma de los no leídos
 *   - la fila sobrante se borra
 *
 * No toca el `wa_chat_id` de la que sobrevive: para escribirle se usa `wa_lid`,
 * que queda guardado. Usa el SERVICE_ROLE_KEY, así que solo se corre local.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path = ".env.local") {
  const env = {};
  let raw;
  try { raw = readFileSync(path, "utf8"); } catch { return env; }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const aplicar = process.argv.includes("--yes");
const db = createClient(url, serviceKey);

/** Últimos 10 dígitos: compara números guardados con y sin indicativo. */
function normalizar(tel) {
  return (tel ?? "").replace(/\D/g, "").slice(-10);
}

/** La más reciente de dos fechas ISO, tolerando nulos. */
function masReciente(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

const { data: conversaciones, error } = await db
  .from("conversations")
  .select("*")
  .order("created_at", { ascending: true });

if (error) {
  console.error("No pude leer las conversaciones:", error.message);
  process.exit(1);
}

// Agrupar por teléfono; si no tiene, por @lid — son las dos formas en que la
// misma persona quedó guardada dos veces.
const grupos = new Map();
for (const c of conversaciones) {
  const clave = normalizar(c.contact_phone) || c.wa_lid || c.wa_chat_id;
  if (!grupos.has(clave)) grupos.set(clave, []);
  grupos.get(clave).push(c);
}

const duplicados = [...grupos.values()].filter((g) => g.length > 1);

if (duplicados.length === 0) {
  console.log("No hay conversaciones duplicadas. Nada que hacer.");
  process.exit(0);
}

console.log(
  `${duplicados.length} contacto(s) con la conversación partida en dos.` +
    (aplicar ? " Uniendo:\n" : " Dry run — no se cambia nada:\n")
);

let mensajesMovidos = 0;
let filasBorradas = 0;

for (const grupo of duplicados) {
  // Sobrevive la del teléfono: es el id que la ficha del lead espera.
  const superviviente =
    grupo.find((c) => c.wa_chat_id.endsWith("@c.us")) ?? grupo[0];
  const sobrantes = grupo.filter((c) => c.id !== superviviente.id);

  const nombre = superviviente.contact_name ?? sobrantes.find((c) => c.contact_name)?.contact_name;
  console.log(`· ${nombre ?? superviviente.contact_phone ?? superviviente.wa_chat_id}`);
  console.log(`    se queda:  ${superviviente.wa_chat_id}`);

  // Los huecos de la que sobrevive se llenan con lo que traiga la otra
  const patch = { updated_at: new Date().toISOString() };
  let noLeidos = superviviente.unread_count ?? 0;
  let ultimo = superviviente.last_message;
  let ultimoAt = superviviente.last_message_at;

  for (const sobrante of sobrantes) {
    const { count, error: errMsg } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", sobrante.id);

    if (errMsg) {
      console.error(`    ✗ no pude contar los mensajes de ${sobrante.wa_chat_id}: ${errMsg.message}`);
      continue;
    }

    console.log(`    se funde:  ${sobrante.wa_chat_id}  (${count ?? 0} mensaje(s))`);

    if (!superviviente.lead_id && sobrante.lead_id) patch.lead_id = sobrante.lead_id;
    if (!superviviente.client_id && sobrante.client_id) patch.client_id = sobrante.client_id;
    if (!superviviente.contact_name && sobrante.contact_name) patch.contact_name = sobrante.contact_name;
    if (!superviviente.wa_lid && sobrante.wa_lid) patch.wa_lid = sobrante.wa_lid;

    noLeidos += sobrante.unread_count ?? 0;
    if (masReciente(ultimoAt, sobrante.last_message_at) === sobrante.last_message_at) {
      ultimo = sobrante.last_message;
      ultimoAt = sobrante.last_message_at;
    }

    if (aplicar) {
      const { error: errMover } = await db
        .from("messages")
        .update({ conversation_id: superviviente.id })
        .eq("conversation_id", sobrante.id);

      if (errMover) {
        console.error(`    ✗ no pude mover los mensajes: ${errMover.message} — no borro nada de este par`);
        continue;
      }
      mensajesMovidos += count ?? 0;

      const { error: errBorrar } = await db.from("conversations").delete().eq("id", sobrante.id);
      if (errBorrar) {
        console.error(`    ✗ moví los mensajes pero no pude borrar la fila: ${errBorrar.message}`);
        continue;
      }
      filasBorradas++;
    } else {
      mensajesMovidos += count ?? 0;
      filasBorradas++;
    }
  }

  patch.unread_count = noLeidos;
  patch.last_message = ultimo;
  patch.last_message_at = ultimoAt;

  if (aplicar) {
    const { error: errPatch } = await db
      .from("conversations")
      .update(patch)
      .eq("id", superviviente.id);
    if (errPatch) console.error(`    ✗ no pude actualizar la que sobrevive: ${errPatch.message}`);
  }
  console.log("");
}

console.log(
  aplicar
    ? `Listo: ${mensajesMovidos} mensaje(s) movidos, ${filasBorradas} conversación(es) sobrantes borradas.`
    : `Dry run: movería ${mensajesMovidos} mensaje(s) y borraría ${filasBorradas} conversación(es).\n\nPara hacerlo de verdad:\n   node scripts/merge-duplicate-conversations.mjs --yes`
);
