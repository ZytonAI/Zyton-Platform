import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ApifyPlace {
  title?: string;
  name?: string;
  phone?: string;
  website?: string;
  url?: string;
  categoryName?: string;
  address?: string;
  city?: string;
}

function send(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tipo, ciudad } = await request.json();
  if (!tipo || !ciudad) {
    return NextResponse.json({ error: "Faltan tipo y ciudad" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => send(controller, encoder, data);

      try {
        const token = process.env.APIFY_TOKEN;
        if (!token) {
          emit({ type: "error", message: "APIFY_TOKEN no configurado en el servidor" });
          controller.close();
          return;
        }

        emit({ type: "status", message: `Buscando "${tipo}" en "${ciudad}" via Google Places...` });

        // Start Apify run
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
          const err = await runResp.text();
          emit({ type: "error", message: `Error iniciando Apify: ${err}` });
          controller.close();
          return;
        }

        const runData = await runResp.json();
        const runId: string = runData.data.id;
        const datasetId: string = runData.data.defaultDatasetId;

        emit({ type: "status", message: `Run iniciado. Procesando resultados...` });

        // Poll until done (max 5 min, every 10s)
        let done = false;
        for (let attempt = 1; attempt <= 30; attempt++) {
          await sleep(10_000);

          const statusResp = await fetch(
            `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
          );
          const statusData = await statusResp.json();
          const status: string = statusData.data.status;

          emit({ type: "status", message: `Buscando... (${attempt * 10}s) — ${status}` });

          if (status === "SUCCEEDED") { done = true; break; }
          if (status === "FAILED" || status === "ABORTED") {
            emit({ type: "error", message: `La búsqueda falló en Apify: ${status}` });
            controller.close();
            return;
          }
        }

        if (!done) {
          emit({ type: "error", message: "Tiempo de espera agotado (5 min). Intenta de nuevo." });
          controller.close();
          return;
        }

        // Fetch results
        emit({ type: "status", message: "Descargando resultados..." });
        const resultsResp = await fetch(
          `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=50`
        );
        const places: ApifyPlace[] = await resultsResp.json();

        if (!places.length) {
          emit({ type: "error", message: "No se encontraron resultados para esa búsqueda." });
          controller.close();
          return;
        }

        emit({ type: "status", message: `Guardando ${places.length} leads en Supabase...` });

        const rows = places.map((p) => ({
          owner_id: user.id,
          name: p.title ?? p.name ?? "Sin nombre",
          phone: p.phone ?? null,
          website: p.website ?? null,
          company: p.title ?? p.name ?? null,
          source: "raul",
          status: "new",
          notes: p.categoryName ?? null,
          maps_url: p.url ?? null,
        }));

        const { data: saved, error: dbErr } = await supabase
          .from("leads")
          .insert(rows)
          .select();

        if (dbErr) {
          emit({ type: "error", message: `Error guardando leads: ${dbErr.message}` });
          controller.close();
          return;
        }

        emit({ type: "result", leads: saved ?? [], saved: saved?.length ?? 0 });
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
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
