import { createClient } from "@/lib/supabase/server";
import { getOpenAI } from "@/lib/openai-client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function generateDesignPrompt(
  lead: { name: string; website: string; notes: string | null },
  websiteContent: string,
  elisaReportText: string
): Promise<string> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4000,
    messages: [
      {
        role: "system",
        content: `Eres Davoo, un experto en diseño web estratégico y branding digital para negocios latinoamericanos.
Tu especialidad es crear briefings extremadamente detallados y personalizados que sirven como prompts perfectos para que Claude (la IA de Anthropic) diseñe o rediseñe sitios web completos.
Tu output es en español, en formato Markdown, y debe ser tan completo y específico para ESTE negocio que Claude pueda crear el sitio sin necesitar ninguna información adicional.
Nunca uses ejemplos genéricos — todo debe estar basado en lo que realmente hace y tiene este negocio.`,
      },
      {
        role: "user",
        content: `Crea un prompt de rediseño web ultra-detallado y 100% personalizado para "${lead.name}".

## DATOS DEL NEGOCIO
- **Nombre**: ${lead.name}
- **Sitio web actual**: ${lead.website}
- **Sector/Ubicación**: ${lead.notes ?? "No especificado"}

## CONTENIDO ACTUAL DEL SITIO (scrapeado en vivo — usa esto para entender qué existe hoy)
${websiteContent.slice(0, 8000)}

## INFORME DE ANÁLISIS DE ELISA (diagnóstico de métricas y oportunidades)
${elisaReportText.slice(0, 4000)}

---

Con toda esta información, escribe un prompt completo en Markdown que yo pueda pasarle directamente a Claude para que diseñe el nuevo sitio web de "${lead.name}".

El prompt DEBE incluir estas secciones, siendo extremadamente específico para este negocio:

1. **Contexto del negocio** — quiénes son, qué hacen exactamente, para quién trabajan, cuál es su propuesta de valor única
2. **Diagnóstico del sitio actual** — qué tiene hoy, qué funciona y qué falla específicamente (usa los datos de Elisa y el scraping)
3. **Personalidad de marca** — tono de comunicación, valores, estilo visual que le corresponde a este tipo de negocio y sector
4. **Audiencia objetivo** — perfil detallado del cliente ideal: edad, necesidades, cómo busca este servicio, qué le genera confianza
5. **Arquitectura del sitio** — páginas y secciones específicas con el contenido real que debe tener cada una
6. **Diseño visual** — paleta de colores concreta (con HEX si puedes), tipografías recomendadas, estilo de imágenes y gráficos
7. **Elementos de conversión** — CTAs específicos con el texto sugerido, formularios, botón flotante de WhatsApp con mensaje predefinido, trust signals
8. **Contenido a preservar y potenciar** — lo que ya tiene el sitio y que funciona o tiene valor
9. **Mejoras prioritarias** — basadas en las oportunidades de Elisa, ordenadas por impacto potencial
10. **Especificaciones técnicas** — responsive mobile-first, velocidad, SEO local, accesibilidad

El resultado debe comenzar exactamente con: "# Prompt de Diseño Web — ${lead.name}"
Sé EXTREMADAMENTE ESPECÍFICO. Menciona detalles reales del negocio, sus servicios concretos, su sector, su ciudad. Cero generalidades.`,
      },
    ],
  });

  return completion.choices[0]?.message?.content ?? "";
}

export async function POST() {
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
        emit({ type: "status", message: "Buscando leads con informes de Elisa..." });

        const { data: leads, error: leadsErr } = await supabase
          .from("leads")
          .select("id, name, website, notes")
          .eq("owner_id", user.id)
          .eq("analyzed", true)
          .not("website", "is", null)
          .neq("website", "Sin página web")
          .order("created_at", { ascending: true });

        if (leadsErr) {
          emit({ type: "error", message: `Error consultando leads: ${leadsErr.message}` });
          controller.close();
          return;
        }

        if (!leads || leads.length === 0) {
          emit({ type: "status", message: "No hay leads analizados por Elisa todavía. Ejecuta Elisa primero." });
          emit({ type: "result", generated: 0, skipped: 0, allDone: true });
          controller.close();
          return;
        }

        // Check which leads already have Davoo prompts (content_type = text/markdown)
        const { data: existingPrompts } = await supabase
          .from("file_attachments")
          .select("entity_id")
          .eq("owner_id", user.id)
          .eq("content_type", "text/markdown")
          .in(
            "entity_id",
            leads.map((l) => l.id)
          );

        const alreadyDone = new Set((existingPrompts ?? []).map((p) => p.entity_id));
        const pending = leads.filter((l) => !alreadyDone.has(l.id));

        if (pending.length === 0) {
          emit({ type: "status", message: "Todos los leads ya tienen su prompt de diseño generado." });
          emit({ type: "result", generated: 0, skipped: 0, allDone: true });
          controller.close();
          return;
        }

        emit({
          type: "status",
          message: `${pending.length} leads pendientes. Generando prompts de diseño personalizados...`,
        });

        let generatedCount = 0;
        let skippedCount = 0;
        const results: { id: string; name: string; prompt: string; fileName: string }[] = [];

        for (let i = 0; i < pending.length; i++) {
          const lead = pending[i];

          emit({
            type: "progress",
            message: `[${i + 1}/${pending.length}] Iniciando análisis de ${lead.name}...`,
            current: i + 1,
            total: pending.length,
          });

          try {
            // Fetch Elisa's HTML report from file_attachments
            const { data: attachments } = await supabase
              .from("file_attachments")
              .select("content")
              .eq("owner_id", user.id)
              .eq("entity_id", lead.id)
              .eq("content_type", "text/html")
              .limit(1);

            const elisaHtml = attachments?.[0]?.content ?? "";
            const elisaText = elisaHtml ? htmlToText(elisaHtml) : "Informe de Elisa no disponible";

            emit({
              type: "progress",
              message: `[${i + 1}/${pending.length}] Escaneando sitio web de ${lead.name}...`,
              current: i + 1,
              total: pending.length,
            });

            const websiteContent = await scrapeWithJina(lead.website);

            emit({
              type: "progress",
              message: `[${i + 1}/${pending.length}] Generando prompt de diseño para ${lead.name}...`,
              current: i + 1,
              total: pending.length,
            });

            const prompt = await generateDesignPrompt(lead, websiteContent, elisaText);

            const safeName = lead.name
              .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9 ]/g, "")
              .trim()
              .slice(0, 50);
            const fileName = `Prompt Diseño Web — ${safeName}.md`;

            await supabase.from("file_attachments").insert({
              owner_id: user.id,
              entity_type: "lead",
              entity_id: lead.id,
              file_name: fileName,
              storage_path: "",
              content_type: "text/markdown",
              size_bytes: new TextEncoder().encode(prompt).byteLength,
              content: prompt,
            });

            generatedCount++;
            results.push({ id: lead.id, name: lead.name, prompt, fileName });

            emit({
              type: "progress",
              message: `✓ ${lead.name} — prompt generado (${(new TextEncoder().encode(prompt).byteLength / 1024).toFixed(1)} KB)`,
              current: i + 1,
              total: pending.length,
            });
          } catch (err) {
            skippedCount++;
            emit({
              type: "progress",
              message: `✗ ${lead.name} — error: ${err instanceof Error ? err.message : String(err)}`,
              current: i + 1,
              total: pending.length,
            });
          }
        }

        emit({
          type: "result",
          generated: generatedCount,
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
