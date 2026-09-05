import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { notifyDiana } from "@/lib/diana-notify";
import { TEAM_MEMBERS } from "@/lib/team";
import { withColumnFallbackRows } from "@/lib/pg-compat";
import { notifyAssignment } from "@/lib/notify-member";
import { memberByEmail } from "@/lib/team";
import {
  filtrarCandidatos,
  prioridadDesdeScore,
  sondearTodas,
  UMBRAL_DEFECTO,
  type Candidato,
} from "@/lib/lead-filter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lo que devuelve el actor `compass~crawler-google-places` de Apify. Se piden
 * más campos de los que se guardan: reseñas, fotos y estado del negocio no van
 * al CRM, pero son lo que el filtro usa para saber si es una tienda de barrio
 * o una cadena.
 */
interface ApifyPlace {
  title?: string;
  name?: string;
  phone?: string;
  website?: string;
  url?: string;
  categoryName?: string;
  address?: string;
  neighborhood?: string;
  totalScore?: number;
  reviewsCount?: number;
  imagesCount?: number;
  price?: string;
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  claimThisBusiness?: boolean;
}

/** Cuántos lugares le pedimos a Apify. Se cobra por lugar, así que se acota. */
const CANTIDAD_MIN = 10;
const CANTIDAD_MAX = 100;
const CANTIDAD_DEFECTO = 40;

function emit(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Lo que se le escribe a Google Maps. El barrio va antes de la ciudad porque
 * así lo entiende el buscador: "dentistas en Modelia, Bogotá, Colombia".
 * Buscar por barrio devuelve negocios que la búsqueda por ciudad nunca
 * alcanza — Maps corta en ~120 resultados por consulta, y en una ciudad grande
 * eso es siempre el centro y las cadenas.
 */
function consultaMaps(tipo: string, barrio: string, ciudad: string): string {
  const lugar = barrio ? `${barrio}, ${ciudad}` : ciudad;
  return `${tipo} en ${lugar}`;
}

export async function POST(request: Request) {
  // Wrap setup in try/catch so errors return readable JSON instead of 500
  let supabase: Awaited<ReturnType<typeof createClient>>;
  let userId: string;
  let tipo: string;
  let ciudad: string;
  let barrio: string;
  let cantidad: number;
  let umbral: number;
  let admitirSinWeb: boolean;
  let dianaTaskId: string | null = null;
  let assignTo: string | null = null;
  let actorSlug: string | null = null;
  const baseUrl = new URL(request.url).origin;

  try {
    supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
    actorSlug = memberByEmail(user.email)?.slug ?? null;

    const body = await request.json().catch(() => ({})) as {
      tipo?: string; ciudad?: string; barrio?: string; cantidad?: number;
      umbral?: number; admitir_sin_web?: boolean;
      diana_task_id?: string; assign_to?: string;
    };
    tipo = (body.tipo ?? "").trim();
    ciudad = (body.ciudad ?? "").trim();
    barrio = (body.barrio ?? "").trim();
    cantidad = Math.min(CANTIDAD_MAX, Math.max(CANTIDAD_MIN, Number(body.cantidad) || CANTIDAD_DEFECTO));
    // Ojo: Number(undefined) es NaN, no null — `??` no lo atraparía
    const umbralPedido = Number(body.umbral);
    umbral = Number.isFinite(umbralPedido)
      ? Math.min(100, Math.max(0, umbralPedido))
      : UMBRAL_DEFECTO;
    admitirSinWeb = body.admitir_sin_web ?? true;
    dianaTaskId = body.diana_task_id ?? null;
    // A quién quedan los leads nuevos. Sin esto entran sin dueño y nadie los toma.
    assignTo = TEAM_MEMBERS.some((m) => m.slug === body.assign_to) ? body.assign_to! : null;

    if (!tipo || !ciudad) {
      return NextResponse.json({ error: "Faltan tipo y ciudad" }, { status: 400 });
    }
  } catch (err) {
    console.error("[raul] setup error:", err);
    return NextResponse.json({ error: `Error de configuración: ${String(err)}` }, { status: 500 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => emit(controller, encoder, data);

      try {
        const token = process.env.APIFY_TOKEN;
        if (!token) {
          send({ type: "error", message: "APIFY_TOKEN no está configurado en las variables de entorno" });
          controller.close();
          return;
        }

        const consulta = consultaMaps(tipo, barrio, ciudad);
        send({ type: "status", message: `Buscando "${consulta}" vía Google Places...` });

        const runResp = await fetch(
          `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              searchStringsArray: [consulta],
              maxCrawledPlaces: cantidad,
              language: "es",
            }),
          }
        );

        if (!runResp.ok) {
          send({ type: "error", message: `Error iniciando Apify: ${await runResp.text()}` });
          controller.close();
          return;
        }

        const runData = await runResp.json();
        const runId: string = runData.data.id;
        const datasetId: string = runData.data.defaultDatasetId;

        send({ type: "status", message: "Run iniciado. Esperando resultados de Google Maps..." });

        let done = false;
        // 27 × 10s = 4,5 min. Pedir 100 lugares tarda más que pedir 25.
        for (let attempt = 1; attempt <= 27; attempt++) {
          await sleep(10_000);

          const statusData = await fetch(
            `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
          ).then((r) => r.json());

          const status: string = statusData.data.status;
          send({ type: "status", message: `Procesando... (${attempt * 10}s) — ${status}` });

          if (status === "SUCCEEDED") { done = true; break; }
          if (status === "FAILED" || status === "ABORTED") {
            send({ type: "error", message: `La búsqueda falló: ${status}` });
            controller.close();
            return;
          }
        }

        if (!done) {
          send({ type: "error", message: "Tiempo agotado (4,5 min). Intenta con menos resultados." });
          controller.close();
          return;
        }

        const places: ApifyPlace[] = await fetch(
          `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=${CANTIDAD_MAX}`
        ).then((r) => r.json());

        send({ type: "status", message: `${places.length} lugares encontrados.` });

        const conContacto = places.filter((p) => p.phone?.trim());
        const sinContacto = places.length - conContacto.length;

        if (!conContacto.length) {
          send({ type: "error", message: "Ningún resultado tiene número de contacto." });
          controller.close();
          return;
        }

        // ── El filtro ────────────────────────────────────────
        // Antes todo lo que tuviera teléfono entraba al CRM. Ahora hay dos
        // pasos: mirar la web de cada uno y pasarle esas señales al modelo
        // para que decida a quién le podemos vender algo de verdad.
        const candidatos: Candidato[] = conContacto.map((p) => ({
          nombre: p.title ?? p.name ?? "Sin nombre",
          categoria: p.categoryName ?? null,
          direccion: p.address ?? p.neighborhood ?? null,
          web: p.website?.trim() || null,
          resenas: typeof p.reviewsCount === "number" ? p.reviewsCount : null,
          calificacion: typeof p.totalScore === "number" ? p.totalScore : null,
          fotos: typeof p.imagesCount === "number" ? p.imagesCount : null,
          precio: p.price ?? null,
          cerrado: !!p.permanentlyClosed,
          sinReclamar: p.claimThisBusiness ?? null,
        }));

        const conWebCount = candidatos.filter((c) => c.web).length;
        if (conWebCount) {
          send({ type: "status", message: `Revisando las ${conWebCount} páginas web...` });
        }

        const sondeos = await sondearTodas(candidatos, (hechos, total) => {
          if (hechos === total || hechos % 16 === 0) {
            send({ type: "status", message: `Webs revisadas: ${hechos}/${total}` });
          }
        });

        send({ type: "status", message: `Filtrando ${candidatos.length} negocios con IA...` });

        const { veredictos, aviso } = await filtrarCandidatos(candidatos, sondeos, {
          umbral,
          admitirSinWeb,
        });
        if (aviso) send({ type: "status", message: `⚠ ${aviso}` });

        const aptos = conContacto
          .map((p, i) => ({ place: p, veredicto: veredictos[i] }))
          .filter((x) => x.veredicto?.apto);

        const descartados = candidatos
          .map((c, i) => ({ nombre: c.nombre, ...veredictos[i] }))
          .filter((x) => !x.apto)
          .sort((a, b) => b.score - a.score);

        send({
          type: "status",
          message: `${aptos.length} pasaron el filtro, ${descartados.length} descartados.`,
        });

        if (!aptos.length) {
          send({
            type: "error",
            message:
              "Ningún negocio pasó el filtro. Prueba con otro barrio, otro tipo de negocio o baja la exigencia.",
          });
          controller.close();
          return;
        }

        const rows = aptos.map(({ place: p, veredicto }) => ({
          owner_id: userId,
          contacted_by: assignTo,
          name: p.title ?? p.name ?? "Sin nombre",
          phone: p.phone!,
          website: p.website?.trim() || "Sin página web",
          company: p.title ?? p.name ?? null,
          source: "raul",
          status: "new",
          notes: p.categoryName ?? null,
          maps_url: p.url ?? null,
          analyzed: false,
          // El puntaje del filtro se guarda para poder revisar el criterio
          // después, y de paso alimenta la prioridad que ya se ve en la ficha.
          fit_score: veredicto.score,
          fit_reason: veredicto.motivo,
          priority: prioridadDesdeScore(veredicto.score),
        }));

        const { data: saved, error: dbErr } = await withColumnFallbackRows(
          rows,
          (batch) => supabase.from("leads").insert(batch).select()
        );

        if (dbErr) {
          send({ type: "error", message: `Error guardando en BD: ${dbErr.message}` });
          controller.close();
          return;
        }

        // Un solo aviso por lote: si son 50 leads, no 50 mensajes
        if (assignTo) {
          await notifyAssignment(
            assignTo,
            actorSlug,
            `🎯 *Leads nuevos de Raúl*\n\n${(saved ?? []).length} ${tipo} en ${barrio || ciudad} quedaron a tu nombre para contactar (filtrados de ${candidatos.length} encontrados).`
          );
        }

        const savedLeads = (saved ?? []) as { website?: string }[];
        const conWeb = savedLeads.filter((l) => l.website !== "Sin página web").length;
        const sinWeb = savedLeads.length - conWeb;

        send({
          type: "result",
          leads: saved ?? [],
          saved: saved?.length ?? 0,
          sinContacto,
          sinWeb,
          conWeb,
          revisados: candidatos.length,
          descartados,
        });

        if (dianaTaskId) {
          await notifyDiana(
            baseUrl,
            dianaTaskId,
            userId,
            "done",
            `Raúl terminó: de ${candidatos.length} "${tipo}" en ${barrio || ciudad}, ${saved?.length ?? 0} pasaron el filtro y quedaron como leads. ${conWeb} con web, ${sinWeb} sin web.`
          );
        }
      } catch (err) {
        if (dianaTaskId) {
          await notifyDiana(baseUrl, dianaTaskId, userId, "error", `Raúl encontró un error: ${err instanceof Error ? err.message : String(err)}`);
        }
        emit(controller, encoder, { type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
