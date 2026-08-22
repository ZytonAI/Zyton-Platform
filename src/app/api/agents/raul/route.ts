import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { notifyDiana } from "@/lib/diana-notify";
import { TEAM_MEMBERS } from "@/lib/team";
import { withColumnFallbackRows } from "@/lib/pg-compat";
import { notifyAssignment } from "@/lib/notify-member";
import { memberByEmail } from "@/lib/team";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ApifyPlace {
  title?: string;
  name?: string;
  phone?: string;
  website?: string;
  url?: string;
  categoryName?: string;
}

function emit(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(request: Request) {
  // Wrap setup in try/catch so errors return readable JSON instead of 500
  let supabase: Awaited<ReturnType<typeof createClient>>;
  let userId: string;
  let tipo: string;
  let ciudad: string;
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
      tipo?: string; ciudad?: string; diana_task_id?: string; assign_to?: string;
    };
    tipo = body.tipo ?? "";
    ciudad = body.ciudad ?? "";
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
          send({ type: "error", message: "APIFY_TOKEN no está configurado en Vercel Environment Variables" });
          controller.close();
          return;
        }

        send({ type: "status", message: `Buscando "${tipo}" en "${ciudad}" vía Google Places...` });

        const runResp = await fetch(
          `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              searchStringsArray: [`${tipo} en ${ciudad}`],
              maxCrawledPlaces: 25,
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
        for (let attempt = 1; attempt <= 18; attempt++) {
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
          send({ type: "error", message: "Tiempo agotado (3 min). Intenta con menos resultados." });
          controller.close();
          return;
        }

        const places: ApifyPlace[] = await fetch(
          `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=50`
        ).then((r) => r.json());

        send({ type: "status", message: `${places.length} lugares encontrados. Filtrando y guardando...` });

        const conContacto = places.filter((p) => p.phone?.trim());
        const sinContacto = places.length - conContacto.length;

        if (!conContacto.length) {
          send({ type: "error", message: "Ningún resultado tiene número de contacto." });
          controller.close();
          return;
        }

        const rows = conContacto.map((p) => ({
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
            `🎯 *Leads nuevos de Raúl*\n\n${(saved ?? []).length} ${tipo} en ${ciudad} quedaron a tu nombre para contactar.`
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
        });

        if (dianaTaskId) {
          await notifyDiana(
            baseUrl,
            dianaTaskId,
            userId,
            "done",
            `Raúl terminó: encontré ${saved?.length ?? 0} leads de "${tipo}" en ${ciudad}. ${conWeb} con web, ${sinWeb} sin web.`
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
