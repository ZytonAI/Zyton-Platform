/**
 * Borra el historial de WhatsApp para empezar de cero.
 *
 *   node scripts/wipe-whatsapp.mjs         → solo cuenta lo que borraría (dry run)
 *   node scripts/wipe-whatsapp.mjs --yes   → borra de verdad
 *
 * Qué borra:
 *   - todos los mensajes (tabla messages)
 *   - todas las conversaciones (tabla conversations)
 *   - todos los archivos del bucket privado wa-media (media entrante de WhatsApp)
 *
 * Qué NO toca:
 *   - el bucket `attachments` (documentos de leads y clientes; los archivos que
 *     se mandan por WhatsApp salen de ahí y se siguen necesitando en el CRM)
 *   - leads, clientes, facturas, calendario, wiki ni tareas
 *   - la sesión de WhatsApp: el número sigue conectado, los chats vuelven a
 *     aparecer solos en cuanto alguien escriba
 *
 * Es irreversible. Usa el SERVICE_ROLE_KEY, así que solo se corre local.
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

const apply = process.argv.includes("--yes");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

// ── Inventario ─────────────────────────────────────────────
const [{ count: messages }, { count: conversations }] = await Promise.all([
  db.from("messages").select("id", { count: "exact", head: true }),
  db.from("conversations").select("id", { count: "exact", head: true }),
]);

/** Recorre wa-media (owner_id/conversation_id/archivo) y junta todas las rutas */
async function listMedia() {
  const paths = [];
  const { data: owners } = await db.storage.from("wa-media").list("", { limit: 1000 });
  for (const owner of owners ?? []) {
    const { data: convs } = await db.storage.from("wa-media").list(owner.name, { limit: 1000 });
    for (const conv of convs ?? []) {
      const dir = `${owner.name}/${conv.name}`;
      const { data: files } = await db.storage.from("wa-media").list(dir, { limit: 1000 });
      for (const f of files ?? []) paths.push(`${dir}/${f.name}`);
    }
  }
  return paths;
}

const media = await listMedia();

console.log("─────────────────────────────────────────────");
console.log(` Mensajes:       ${messages ?? 0}`);
console.log(` Conversaciones: ${conversations ?? 0}`);
console.log(` Archivos wa-media: ${media.length}`);
console.log("─────────────────────────────────────────────");

if (!apply) {
  console.log("\nDry run — no se borró nada. Corre con --yes para ejecutar.");
  process.exit(0);
}

// ── Borrado ────────────────────────────────────────────────
// El filtro `not id is null` es para que PostgREST acepte un DELETE sin WHERE.
const delMessages = await db.from("messages").delete().not("id", "is", null);
if (delMessages.error) { console.error("Error borrando mensajes:", delMessages.error.message); process.exit(1); }

const delConvs = await db.from("conversations").delete().not("id", "is", null);
if (delConvs.error) { console.error("Error borrando conversaciones:", delConvs.error.message); process.exit(1); }

if (media.length) {
  // remove() acepta hasta 1000 rutas por llamada
  for (let i = 0; i < media.length; i += 1000) {
    const { error } = await db.storage.from("wa-media").remove(media.slice(i, i + 1000));
    if (error) { console.error("Error borrando media:", error.message); process.exit(1); }
  }
}

// ── Verificación ───────────────────────────────────────────
const [{ count: msgLeft }, { count: convLeft }] = await Promise.all([
  db.from("messages").select("id", { count: "exact", head: true }),
  db.from("conversations").select("id", { count: "exact", head: true }),
]);
const mediaLeft = await listMedia();

console.log("\nListo. Quedan:");
console.log(` Mensajes:          ${msgLeft ?? 0}`);
console.log(` Conversaciones:    ${convLeft ?? 0}`);
console.log(` Archivos wa-media: ${mediaLeft.length}`);
