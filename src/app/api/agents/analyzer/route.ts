import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anthropic } from "@/lib/anthropic";
import { generateReportHtml } from "@/lib/report-template";
import { NextResponse } from "next/server";
import type { WebAnalysis } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function send(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

async function scrapeWithJina(url: string): Promise<string> {
  const resp = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      Accept: "text/plain",
      "X-Return-Format": "markdown",
    },
  });
  if (!resp.ok) throw new Error(`Jina Reader falló (${resp.status})`);
  return resp.text();
}

async function analyzeWithClaude(url: string, content: string): Promise<WebAnalysis> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Eres un experto en marketing digital y UX. Analiza el siguiente contenido extraído del sitio web de un negocio y genera un diagnóstico profesional.

URL: ${url}

Contenido del sitio:
${content.slice(0, 8000)}

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin explicaciones), con esta estructura exacta:
{
  "nombre": "Nombre del negocio (extraído del sitio)",
  "descripcion": "Descripción breve del negocio (1 oración)",
  "telefono": "número de teléfono o null",
  "email": "email de contacto o null",
  "servicios": ["servicio1", "servicio2"],
  "resumen": "2-3 oraciones específicas describiendo el estado actual de su presencia web, mencionando fortalezas y debilidades observadas",
  "puntaje_web": 45,
  "velocidad": "4.2s",
  "metricas": [
    {"label": "Velocidad", "actual": 45, "benchmark": 85},
    {"label": "SEO", "actual": 30, "benchmark": 80},
    {"label": "Móvil", "actual": 40, "benchmark": 90},
    {"label": "Diseño", "actual": 50, "benchmark": 75}
  ],
  "oportunidades": [
    "Oportunidad de mejora específica 1 basada en el contenido del sitio",
    "Oportunidad de mejora específica 2",
    "Oportunidad de mejora específica 3"
  ]
}`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude no devolvió un JSON válido");

  return JSON.parse(jsonMatch[0]) as WebAnalysis;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url, ciudad, lead_id } = await request.json();
  if (!url) return NextResponse.json({ error: "Falta la URL del sitio" }, { status: 400 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => send(controller, encoder, data);

      try {
        // Step 1: Scrape
        emit({ type: "status", message: `Analizando sitio: ${url}` });
        const content = await scrapeWithJina(url);

        emit({ type: "status", message: "Contenido extraído. Generando análisis con IA..." });

        // Step 2: Claude analysis
        const analysis = await analyzeWithClaude(url, content);

        emit({ type: "status", message: "Análisis completado. Generando informe HTML..." });

        // Step 3: Generate HTML
        const ciudadFinal = ciudad ?? "Colombia";
        const html = generateReportHtml(analysis, ciudadFinal);

        // Step 4: Upload HTML to Supabase Storage
        const admin = createAdminClient();
        const timestamp = Date.now();
        const slug = url.replace(/https?:\/\//, "").replace(/[^a-z0-9]/gi, "-").slice(0, 40);
        const storagePath = `${user.id}/leads/${slug}_${timestamp}.html`;

        emit({ type: "status", message: "Subiendo informe a almacenamiento..." });

        const htmlBytes = new TextEncoder().encode(html);
        const { error: uploadErr } = await admin.storage
          .from("attachments")
          .upload(storagePath, htmlBytes, {
            contentType: "text/html",
            upsert: false,
          });

        if (uploadErr) {
          emit({ type: "status", message: `Aviso: No se pudo guardar el informe en storage: ${uploadErr.message}` });
        }

        // Step 5: Create or update lead in Supabase
        let finalLeadId = lead_id ?? null;

        if (!finalLeadId) {
          emit({ type: "status", message: "Creando lead en el CRM..." });
          const { data: newLead, error: leadErr } = await supabase
            .from("leads")
            .insert({
              owner_id: user.id,
              name: analysis.nombre,
              phone: analysis.telefono,
              website: url,
              company: analysis.nombre,
              source: "analizador",
              status: "new",
              notes: analysis.descripcion,
            })
            .select("id")
            .single();

          if (leadErr) {
            emit({ type: "status", message: `Aviso: No se pudo crear el lead: ${leadErr.message}` });
          } else {
            finalLeadId = newLead.id;
          }
        }

        // Step 6: Create attachment record
        if (finalLeadId && !uploadErr) {
          const fileName = `informe-${slug}.html`;
          await supabase.from("file_attachments").insert({
            owner_id: user.id,
            entity_type: "lead",
            entity_id: finalLeadId,
            file_name: fileName,
            storage_path: storagePath,
            content_type: "text/html",
            size_bytes: htmlBytes.byteLength,
          });

          emit({ type: "status", message: "Informe adjuntado al lead." });
        }

        // Step 7: Get signed URL for viewing
        let reportUrl: string | null = null;
        if (!uploadErr) {
          const { data: signed } = await admin.storage
            .from("attachments")
            .createSignedUrl(storagePath, 3600);
          reportUrl = signed?.signedUrl ?? null;
        }

        emit({
          type: "result",
          analysis,
          html,
          lead_id: finalLeadId,
          report_url: reportUrl,
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
