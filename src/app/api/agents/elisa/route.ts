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
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Eres un consultor senior de marketing digital y UX con 10 años de experiencia ayudando a negocios locales en Latinoamérica a mejorar su presencia online.
Tu especialidad es encontrar oportunidades específicas y accionables que otros pasan por alto.
Responde ÚNICAMENTE con JSON válido. Nunca uses frases genéricas — cada observación debe ser específica para ESTE negocio.`,
      },
      {
        role: "user",
        content: `Analiza en profundidad el sitio web de "${nombre}" (${url}).

CONTENIDO EXTRAÍDO DEL SITIO:
${content.slice(0, 9000)}

---
INSTRUCCIONES DE ANÁLISIS:

Estudia el contenido y responde estas preguntas en tu análisis:
• ¿Qué servicios/productos específicos ofrece este negocio? ¿Cómo los presenta?
• ¿Tiene botón de WhatsApp, formulario de contacto, reservas o citas online?
• ¿Hay testimonios, reseñas de clientes, casos de éxito o certificaciones visibles?
• ¿La página de inicio comunica claramente el valor diferencial del negocio?
• ¿Tiene blog, contenido educativo o recursos que generen tráfico orgánico?
• ¿Los precios o tarifas son visibles? ¿Hay promociones activas?
• ¿Las imágenes del sitio parecen profesionales o genéricas/de stock?
• ¿Qué tan fácil es para un usuario nuevo contactarlos o agendar una cita?
• ¿Detectas señales de optimización móvil en la estructura del contenido?
• ¿El sitio tiene presencia en redes sociales vinculada (Instagram, Facebook, etc.)?

CALIFICACIÓN DE MÉTRICAS (0-100, siendo realista):
- SEO Local: ¿aparecen palabras clave de su sector y ciudad? ¿título y descripciones optimizados?
- Captación de Clientes: ¿qué tan fácil es para un visitante convertirse en cliente? (CTAs, formularios, WhatsApp)
- Contenido y Confianza: ¿hay testimonios, fotos reales, información del equipo, trayectoria?
- Experiencia de Usuario: ¿la navegación es clara? ¿la información está bien organizada?

Benchmark sector para negocios locales: SEO Local=72, Captación=68, Contenido=65, UX=70

PUNTAJE WEB GENERAL: Promedio ponderado de las 4 métricas anteriores.

VELOCIDAD: Estima basándote en la complejidad del sitio (muchas imágenes/scripts = más lento):
- Sitio simple, poco contenido: "1.8s - 2.5s"
- Sitio medio: "3.0s - 4.5s"
- Sitio pesado con muchos elementos: "5.0s - 8.0s"

OPORTUNIDADES: Deben ser 4-5 oportunidades MUY ESPECÍFICAS para este negocio.
Formato: "[Problema concreto observado] → [Solución específica] → [Impacto esperado para este tipo de negocio]"
Ejemplo bueno: "No hay botón de WhatsApp visible en la página principal → Agregar un botón flotante de WhatsApp con mensaje predefinido 'Hola, quiero información sobre sus servicios' → Puede aumentar los contactos directos un 40% ya que el 78% de usuarios prefiere WhatsApp para consultas iniciales"
Ejemplo malo: "Mejorar el SEO" (demasiado genérico)

Devuelve EXACTAMENTE este JSON:
{
  "nombre": "nombre real del negocio tal como aparece en el sitio",
  "descripcion": "1 oración específica de qué hace este negocio y para quién",
  "telefono": "número si aparece en el sitio o null",
  "email": "email si aparece o null",
  "servicios": ["servicio específico 1", "servicio específico 2", "servicio específico 3"],
  "resumen": "3-4 oraciones detalladas y específicas. Menciona elementos REALES encontrados: ej. 'El sitio de [nombre] presenta [X servicios] con [descripción de cómo los muestra], sin embargo carece de [elementos específicos que faltan]. [Observación sobre la experiencia del usuario]. [Conclusión sobre el potencial de mejora].'",
  "puntaje_web": 52,
  "velocidad": "3.8s",
  "metricas": [
    {"label": "SEO Local", "actual": 45, "benchmark": 72},
    {"label": "Captación Clientes", "actual": 38, "benchmark": 68},
    {"label": "Contenido y Confianza", "actual": 55, "benchmark": 65},
    {"label": "Experiencia Usuario", "actual": 60, "benchmark": 70}
  ],
  "oportunidades": [
    "Oportunidad específica 1 con problema → solución → impacto",
    "Oportunidad específica 2",
    "Oportunidad específica 3",
    "Oportunidad específica 4"
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
            const safeName = lead.name
              .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9 ]/g, "")
              .trim()
              .slice(0, 50);
            const fileName = `Informe Web ${safeName}.html`;

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
            // Marcar como sin página para que Elisa no vuelva a intentarlo
            await supabase
              .from("leads")
              .update({ website: "Sin página web" })
              .eq("id", lead.id);
            emit({
              type: "progress",
              message: `✗ ${lead.name} — sin acceso, marcado como sin página: ${err instanceof Error ? err.message : String(err)}`,
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
