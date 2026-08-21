/**
 * Crea (o actualiza) las cuentas de login del equipo en Supabase Auth.
 *
 *   node scripts/create-users.mjs            → crea los que falten
 *   node scripts/create-users.mjs --reset    → además resetea la contraseña de los existentes
 *
 * Lee las claves de .env.local. Usa el SERVICE_ROLE_KEY, así que solo debe
 * correrse de forma local — nunca desde el navegador ni en un build.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ── Cargar .env.local ──────────────────────────────────────
function loadEnv(path = ".env.local") {
  const env = {};
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return env;
  }
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
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

// ── Equipo ─────────────────────────────────────────────────
// Debe coincidir con TEAM_MEMBERS en src/lib/team.ts
const TEAM = [
  { slug: "camilo",   name: "Camilo",   email: "camilo@zytonai.com" },
  { slug: "santiago", name: "Santiago", email: "santiago@zytonai.com" },
  { slug: "daniel",   name: "Daniel",   email: "daniel@zytonai.com" },
];

const reset = process.argv.includes("--reset");

function tempPassword() {
  // 16 caracteres url-safe + sufijo que garantiza mayúscula, dígito y símbolo
  return randomBytes(9).toString("base64url") + "Zy7!";
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (listErr) {
  console.error("Error listando usuarios:", listErr.message);
  process.exit(1);
}

const byEmail = new Map(existing.users.map((u) => [u.email?.toLowerCase(), u]));
const credentials = [];

for (const member of TEAM) {
  const found = byEmail.get(member.email.toLowerCase());
  const password = tempPassword();

  if (found) {
    if (reset) {
      const { error } = await supabase.auth.admin.updateUserById(found.id, {
        password,
        user_metadata: { full_name: member.name, slug: member.slug },
      });
      if (error) {
        console.error(`✗ ${member.email}: ${error.message}`);
        continue;
      }
      credentials.push({ ...member, password, action: "contraseña reseteada" });
    } else {
      console.log(`• ${member.email} ya existe — se omite (usa --reset para cambiar la contraseña)`);
    }
    await supabase.from("profiles").upsert({ id: found.id, full_name: member.name });
    continue;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: member.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: member.name, slug: member.slug },
  });

  if (error) {
    console.error(`✗ ${member.email}: ${error.message}`);
    continue;
  }

  await supabase.from("profiles").upsert({ id: data.user.id, full_name: member.name });
  credentials.push({ ...member, password, action: "creado" });
}

if (credentials.length === 0) {
  console.log("\nSin cambios.");
  process.exit(0);
}

console.log("\n─────────────────────────────────────────────");
console.log(" Credenciales — compártelas y pide que las cambien");
console.log("─────────────────────────────────────────────");
for (const c of credentials) {
  console.log(`${c.name.padEnd(9)} ${c.email.padEnd(26)} ${c.password}   (${c.action})`);
}
console.log("─────────────────────────────────────────────\n");
