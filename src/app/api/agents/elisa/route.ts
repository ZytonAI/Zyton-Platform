import { createClient } from "@/lib/supabase/server";
import { getOpenAI } from "@/lib/openai-client";
import { generateReportHtml } from "@/lib/report-template";
import { NextResponse } from "next/server";
import type { WebAnalysis } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function send(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

async function scrapeWithJina(url: string): Promise<string> {
  const resp = await fetch(`https://r.jina.ai/${url}`, {
    headers: { Accept: "text/plain", "X-Return-Format": "markdown" },
  });
  if (!resp.ok) throw new Error(`Jina Reader error (${resp.status})`);
  return resp.text();
}

async function analyzeWithOpenAI(url: string, content: string, nombre: string): Promise<WebAnalysis> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Eres un experto en marketing digital y UX. Responde ÚNICAMENTE con JSON válido, sin explicaciones adicionales.",
      },
      {
        role: "user",
        content: `Analiza el sitio web del negocio "${nombre}" (${url}) y genera un diagnóstico de presencia web.

Contenido extraído:
${content.slice(0, 6000)}

Devuelve este JSON exacto:
{
  "nombre": "${nombre}",
  "descripcion": "descripción del negocio en 1 oración",
  "telefono": "número o null",
  "email": "email o null",
  "servicios": ["servicio1", "servicio2"],
  "resumen": "2-3 oraciones específicas sobre el estado de su presencia web, mencionando fortalezas y debilidades concretas observadas en el sitio",
  "puntaje_web": 45,
  "velocidad": "4.2s",
  "metricas": [
    {"label": "Velocidad", "actual": 45, "benchmark": 85},
    {"label": "SEO", "actual": 30, "benchmark": 80},
    {"label": "Móvil", "actual": 40, "benchmark": 90},
    {"label": "Diseño", "actual": 50, "benchmark": 75}
  ],
  "oportunidades": [
    "Oportunidad concreta 1 basada en el contenido del sitio",
    "Oportunidad concreta 2",
    "Oportunidad concreta 3"
  ]
}`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "";
  return JSON.parse(text) as WebAnalysis;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => send(controller, encoder, data);

      try {
        // Cargar leads pendientes: de Raúl, con web, no analizados
        emit({ type: "status", message: "Buscando leads pendientes de análisis..." });

        const { data: leads, error: leadsErr } = await supabase
          .from("leads")
          .select("id, name, website, phone, notes")
          .eq("owner_id", user.id)
          .eq("source", "raul")
          .eq("analyzed", false)
          .not("website", "is", null)
          .neq("website", "Sin página web")
          .order("created_at", { ascending: true });

        if (leadsErr) {
          emit({ type: "error", message: `Error consultando leads: ${leadsErr.message}` });
          controller.close();
          return;
        }

        if (!leads || leads.length === 0) {
          emit({ type: "status", message: "Todos los leads ya están analizados." });
          emit({ type: "result", analyzed: 0, skipped: 0, allDone: true });
          controller.close();
          return;
        }

        emit({ type: "status", message: `${leads.length} leads pendientes. Iniciando análisis...` });

        let analyzedCount = 0;
        let skippedCount = 0;
        const results = [];

        for (let i = 0; i < leads.length; i++) {
          const lead = leads[i];
          emit({
            type: "progress",
            message: `[${i + 1}/${leads.length}] Analizando: ${lead.name}`,
            current: i + 1,
            total: leads.length,
          });

          try {
            // Scrape
            const content = await scrapeWithJina(lead.website);

            // AI analysis
            const analysis = await analyzeWithOpenAI(lead.website, content, lead.name);

            // Generate HTML report
            const ciudad = lead.notes ?? "Colombia";
            const html = generateReportHtml(analysis, ciudad);

            // Save HTML content directly in DB (no Storage bucket needed)
            const slug = lead.website
              .replace(/https?:\/\//, "")
              .replace(/[^a-z0-9]/gi, "-")
              .slice(0, 40);
            const fileName = `informe-${slug}.html`;

            await supabase.from("file_attachments").insert({
              owner_id: user.id,
              entity_type: "lead",
              entity_id: lead.id,
              file_name: fileName,
              storage_path: "",          // no storage path needed
              content_type: "text/html",
              size_bytes: new TextEncoder().encode(html).byteLength,
              content: html,             // HTML stored directly in DB
            });

            // Mark lead as analyzed
            await supabase
              .from("leads")
              .update({ analyzed: true })
              .eq("id", lead.id);

            analyzedCount++;
            results.push({
              id: lead.id,
              name: lead.name,
              puntaje: analysis.puntaje_web,
              report_url: null,
              html,
            });

            emit({
              type: "progress",
              message: `✓ ${lead.name} — puntaje ${analysis.puntaje_web}/100`,
              current: i + 1,
              total: leads.length,
            });
          } catch (err) {
            skippedCount++;
            emit({
              type: "progress",
              message: `✗ ${lead.name} — error: ${err instanceof Error ? err.message : String(err)}`,
              current: i + 1,
              total: leads.length,
            });
          }
        }

        emit({
          type: "result",
          analyzed: analyzedCount,
          skipped: skippedCount,
          results,
          allDone: false,
        });
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
