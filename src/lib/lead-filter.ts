/**
 * Filtro de calidad de los leads que trae Raúl.
 *
 * Google Maps devuelve todo lo que hay en la zona: la panadería de la esquina
 * y el hospital universitario, la peluquería sin web y la cadena con equipo de
 * marketing propio. Meter todo eso al CRM llena la lista de gente a la que no
 * le podemos vender nada y esconde a la que sí.
 *
 * Aquí se decide, antes de guardar, a quién vale la pena escribirle. Son dos
 * pasos:
 *
 *   1. `sondearWeb` — abre la página del negocio y saca señales duras (qué
 *      plataforma es, si es responsive, qué tan pesada, de qué año es el pie).
 *      El modelo solo, con la URL, no puede saber si la web está bien hecha.
 *   2. `filtrarCandidatos` — le pasa esas señales más los datos de Maps a
 *      OpenAI, que puntúa el encaje de 0 a 100 y explica por qué.
 *
 * Falla abierto a propósito: si no hay API key, si OpenAI se cae o si el
 * modelo se salta un candidato, el lead PASA con una nota. Perder un lead
 * bueno por un fallo de infraestructura es peor que revisar uno malo a mano.
 */

import { getOpenAI } from "@/lib/openai-client";

const MODEL = "gpt-4o-mini-2024-07-18";

/** Candidatos por llamada al modelo. Más grande = más barato pero menos preciso. */
const LOTE = 20;

/** De 0 a 100. Por debajo de esto el lead no entra al CRM. */
export const UMBRAL_DEFECTO = 50;

const SONDEO_TIMEOUT_MS = 6_000;
const SONDEO_PARALELO = 8;
const SONDEO_MAX_BYTES = 60_000;

// ─── Tipos ────────────────────────────────────────────────────

export interface Candidato {
  nombre: string;
  categoria: string | null;
  direccion: string | null;
  web: string | null;
  resenas: number | null;
  calificacion: number | null;
  fotos: number | null;
  precio: string | null;
  cerrado: boolean;
  sinReclamar: boolean | null;
}

/** Lo que se ve al abrir la página del negocio. */
export interface SondeoWeb {
  ok: boolean;
  /** Por qué no se pudo mirar: timeout, 404, dominio caído... */
  motivo?: string;
  plataforma?: string | null;
  titulo?: string | null;
  descripcion?: string | null;
  https?: boolean;
  responsive?: boolean;
  pesoKb?: number;
  scripts?: number;
  anioPie?: number | null;
  tienda?: boolean;
  /** La "web" es en realidad un perfil de Facebook/Instagram/Linktree */
  redSocial?: boolean;
}

export interface Veredicto {
  apto: boolean;
  /** 0–100: qué tanto encaja con el cliente ideal de ZytonAI */
  score: number;
  motivo: string;
  tamano: "micro" | "pequeno" | "mediano" | "grande" | null;
}

export interface OpcionesFiltro {
  /** Por debajo de este puntaje el lead se descarta. */
  umbral?: number;
  /**
   * Si un negocio sin página web entra o no. Por defecto sí: es el prospecto
   * clásico de una agencia. Apagarlo deja solo a los que ya tienen algo que
   * rehacer.
   */
  admitirSinWeb?: boolean;
}

export interface ResultadoFiltro {
  veredictos: Veredicto[];
  /** Aviso para el usuario cuando el filtro no pudo hacer su trabajo completo. */
  aviso: string | null;
}

// ─── 1. Sondeo de la web ──────────────────────────────────────

const PLATAFORMAS: [RegExp, string][] = [
  [/wix\.com|wixstatic|_wixCssImports/i, "Wix"],
  [/cdn\.shopify\.com|Shopify\.theme/i, "Shopify"],
  [/squarespace/i, "Squarespace"],
  [/webflow/i, "Webflow"],
  [/sites\.google\.com/i, "Google Sites"],
  [/godaddy|websitebuilder/i, "GoDaddy Builder"],
  [/weebly/i, "Weebly"],
  [/jimdo/i, "Jimdo"],
  [/blogspot|blogger\.com/i, "Blogspot"],
  [/tilda\.cc/i, "Tilda"],
  [/strikingly/i, "Strikingly"],
  [/elementor/i, "WordPress + Elementor"],
  [/wp-content|wp-includes/i, "WordPress"],
  [/joomla/i, "Joomla"],
];

const REDES = /facebook\.com|instagram\.com|linktr\.ee|linkedin\.com|wa\.me|beacons\.ai/i;

function extraer(html: string, url: string): SondeoWeb {
  const plataforma = PLATAFORMAS.find(([re]) => re.test(html))?.[1] ?? null;
  const anio = /(?:©|&copy;|copyright)[^<]{0,40}?(20\d{2})/i.exec(html)?.[1];

  return {
    ok: true,
    plataforma,
    titulo: /<title[^>]*>([^<]{0,160})/i.exec(html)?.[1]?.trim() || null,
    descripcion:
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,240})/i.exec(html)?.[1]?.trim() ||
      null,
    https: url.startsWith("https://"),
    responsive: /<meta[^>]+name=["']viewport["']/i.test(html),
    pesoKb: Math.round(html.length / 1024),
    scripts: (html.match(/<script/gi) ?? []).length,
    anioPie: anio ? Number(anio) : null,
    tienda: /add[-_ ]?to[-_ ]?cart|añadir al carrito|agregar al carrito|woocommerce|checkout/i.test(html),
    redSocial: REDES.test(url),
  };
}

/**
 * Abre la página y saca señales. Nunca lanza: un fallo devuelve `ok: false`
 * con el motivo, y el modelo juzga con lo que haya.
 */
export async function sondearWeb(url: string): Promise<SondeoWeb> {
  if (REDES.test(url)) return { ok: true, redSocial: true, plataforma: "Perfil de red social" };

  try {
    const resp = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(SONDEO_TIMEOUT_MS),
      headers: {
        // Sin User-Agent de navegador muchos hosts responden 403 y la web
        // buena pasaría por "caída".
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!resp.ok) return { ok: false, motivo: `HTTP ${resp.status}` };

    // Solo el principio: para saber cómo está hecha no hace falta bajarla entera
    const buffer = await resp.arrayBuffer();
    const html = new TextDecoder("utf-8", { fatal: false })
      .decode(buffer.slice(0, SONDEO_MAX_BYTES));

    return extraer(html, resp.url || url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, motivo: /timeout|abort/i.test(msg) ? "no respondió a tiempo" : msg };
  }
}

/** Sondea varias webs a la vez, de a `SONDEO_PARALELO`, avisando el avance. */
export async function sondearTodas(
  candidatos: Candidato[],
  onAvance?: (hechos: number, total: number) => void
): Promise<(SondeoWeb | null)[]> {
  const sondeos: (SondeoWeb | null)[] = new Array(candidatos.length).fill(null);
  const conWeb = candidatos
    .map((c, i) => ({ i, web: c.web }))
    .filter((x): x is { i: number; web: string } => !!x.web);

  let hechos = 0;
  for (let inicio = 0; inicio < conWeb.length; inicio += SONDEO_PARALELO) {
    const tanda = conWeb.slice(inicio, inicio + SONDEO_PARALELO);
    await Promise.all(
      tanda.map(async ({ i, web }) => {
        sondeos[i] = await sondearWeb(web);
      })
    );
    hechos += tanda.length;
    onAvance?.(hechos, conWeb.length);
  }

  return sondeos;
}

// ─── 2. El juicio ─────────────────────────────────────────────

function promptSistema(admitirSinWeb: boolean): string {
  return `Eres el filtro de prospección de ZytonAI, una agencia digital que le vende sitios web, presencia digital y automatización con IA a negocios pequeños y medianos de Latinoamérica.

Decides, para cada negocio de la lista, si vale la pena que un comercial le escriba. El cliente ideal es el negocio local al que SÍ le podemos mover la aguja.

## SUBE EL PUNTAJE
- Negocio independiente, de barrio, dueño-operador. Una sede o muy pocas.
- Presencia digital floja pero existente en algún grado: web de plantilla (Wix, GoDaddy, Google Sites, Blogspot, WordPress genérico), sitio viejo, sin responsive, sin HTTPS, con año viejo en el pie, o una página de Facebook/Instagram usada como web.
- Es un negocio VIVO: tiene reseñas, calificación decente, fotos, está abierto.

## BAJA EL PUNTAJE
- Cadena, franquicia, multinacional, hospital o clínica grande, universidad, banco, aseguradora, entidad pública, centro comercial, marca nacional o internacional. Cientos o miles de reseñas suele ser señal de esto.
- Web claramente profesional y actual: diseño a medida, ecommerce serio, agencia detrás, muchos scripts de marketing, contenido cuidado. Ya invirtieron en digital y no nos necesitan.
- Negocio apagado: cerrado permanentemente, sin reseñas, sin fotos, sin señales de actividad. Ni hay con quién hablar ni con qué pagar.

## LA WEB
El punto dulce es la web mediocre-pero-viva: algo hay, está mal hecho, y se nota que al dueño le importa el negocio. Una web excelente descarta; un negocio muerto también.
${
  admitirSinWeb
    ? "Un negocio SIN web no se descarta por eso: es el prospecto clásico. Júzgalo por el resto (que sea pequeño, local y activo)."
    : "Un negocio SIN web se descarta: en esta corrida solo interesan los que ya tienen algo que rehacer."
}

## SALIDA
Devuelve SOLO un JSON con esta forma exacta, un elemento por candidato, con el mismo "i" que recibiste:

{"veredictos":[{"i":0,"score":72,"tamano":"pequeno","motivo":"clínica de barrio con web en Wix sin responsive"}]}

- "score": entero 0–100, qué tanto encaja con el cliente ideal.
- "tamano": "micro" | "pequeno" | "mediano" | "grande".
- "motivo": máximo 12 palabras, en español, concreto. Di POR QUÉ, no repitas el nombre.
No omitas ningún candidato. No agregues texto fuera del JSON.`;
}

function describir(c: Candidato, sondeo: SondeoWeb | null, i: number): string {
  const partes: string[] = [
    `#${i} ${c.nombre}`,
    c.categoria ? `categoría: ${c.categoria}` : null,
    c.direccion ? `dirección: ${c.direccion}` : null,
    c.calificacion != null ? `calificación: ${c.calificacion}` : null,
    c.resenas != null ? `reseñas: ${c.resenas}` : "reseñas: sin dato",
    c.fotos != null ? `fotos: ${c.fotos}` : null,
    c.precio ? `nivel de precio: ${c.precio}` : null,
    c.cerrado ? "CERRADO PERMANENTEMENTE" : null,
    c.sinReclamar ? "el dueño no ha reclamado la ficha de Maps" : null,
  ].filter((x): x is string => !!x);

  if (!c.web) {
    partes.push("web: NO TIENE");
  } else if (!sondeo) {
    partes.push(`web: ${c.web} (no revisada)`);
  } else if (sondeo.redSocial) {
    partes.push(`web: ${c.web} — es un perfil de red social, no un sitio propio`);
  } else if (!sondeo.ok) {
    partes.push(`web: ${c.web} — no se pudo abrir (${sondeo.motivo})`);
  } else {
    partes.push(
      `web: ${c.web} — ` +
        [
          `plataforma: ${sondeo.plataforma ?? "a medida o desconocida"}`,
          `responsive: ${sondeo.responsive ? "sí" : "no"}`,
          `https: ${sondeo.https ? "sí" : "no"}`,
          `scripts: ${sondeo.scripts}`,
          `html: ${sondeo.pesoKb} KB`,
          sondeo.anioPie ? `año en el pie: ${sondeo.anioPie}` : null,
          sondeo.tienda ? "tiene tienda en línea" : null,
          sondeo.titulo ? `title: "${sondeo.titulo}"` : null,
          sondeo.descripcion ? `descripción: "${sondeo.descripcion}"` : null,
        ]
          .filter(Boolean)
          .join(", ")
    );
  }

  return partes.join(" | ");
}

/** Lo que devuelve el modelo por candidato, antes de validarlo. */
interface VeredictoCrudo {
  i?: number;
  score?: number;
  tamano?: string;
  motivo?: string;
}

/** Lo que pasa cuando el filtro no pudo opinar: el lead entra igual. */
function porDefecto(motivo: string): Veredicto {
  return { apto: true, score: UMBRAL_DEFECTO, motivo, tamano: null };
}

async function juzgarLote(
  candidatos: Candidato[],
  sondeos: (SondeoWeb | null)[],
  desde: number,
  opciones: Required<OpcionesFiltro>
): Promise<Veredicto[]> {
  const lista = candidatos.map((c, k) => describir(c, sondeos[k], desde + k)).join("\n");

  const resp = await getOpenAI().chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: promptSistema(opciones.admitirSinWeb) },
      { role: "user", content: `Evalúa estos ${candidatos.length} negocios:\n\n${lista}` },
    ],
  });

  const crudo = JSON.parse(resp.choices[0]?.message?.content ?? "{}") as {
    veredictos?: VeredictoCrudo[];
  };

  const porIndice = new Map<number, VeredictoCrudo>();
  for (const v of crudo.veredictos ?? []) {
    if (typeof v?.i === "number") porIndice.set(v.i, v);
  }

  return candidatos.map((c, k) => {
    const v = porIndice.get(desde + k);
    if (!v || typeof v.score !== "number") {
      return porDefecto("el filtro no lo evaluó — pasa por defecto");
    }

    const score = Math.max(0, Math.min(100, Math.round(v.score)));
    // La regla de "sin web" se aplica aquí también, no solo en el prompt: es
    // una decisión del usuario y no puede depender de que el modelo obedezca.
    const sinWebProhibida = !opciones.admitirSinWeb && !c.web;

    return {
      apto: score >= opciones.umbral && !sinWebProhibida && !c.cerrado,
      score,
      motivo: sinWebProhibida
        ? "sin página web y esta corrida pide que la tengan"
        : c.cerrado
          ? "cerrado permanentemente"
          : (v.motivo ?? "").slice(0, 120) || "sin motivo",
      tamano: (["micro", "pequeno", "mediano", "grande"] as const).find((t) => t === v.tamano) ?? null,
    };
  });
}

/**
 * Puntúa todos los candidatos. Devuelve un veredicto por candidato, en el
 * mismo orden, más un aviso si el filtro no pudo trabajar bien.
 */
export async function filtrarCandidatos(
  candidatos: Candidato[],
  sondeos: (SondeoWeb | null)[],
  opciones: OpcionesFiltro = {}
): Promise<ResultadoFiltro> {
  const config: Required<OpcionesFiltro> = {
    umbral: opciones.umbral ?? UMBRAL_DEFECTO,
    admitirSinWeb: opciones.admitirSinWeb ?? true,
  };

  if (!process.env.OPENAI_API_KEY) {
    return {
      veredictos: candidatos.map(() => porDefecto("filtro apagado: falta OPENAI_API_KEY")),
      aviso: "El filtro de IA no corrió (falta OPENAI_API_KEY): entraron todos los leads.",
    };
  }

  const veredictos: Veredicto[] = [];
  let fallos = 0;

  for (let desde = 0; desde < candidatos.length; desde += LOTE) {
    const lote = candidatos.slice(desde, desde + LOTE);
    try {
      veredictos.push(...(await juzgarLote(lote, sondeos.slice(desde, desde + LOTE), desde, config)));
    } catch (err) {
      console.error("[raul/filtro] lote falló:", err);
      fallos += lote.length;
      veredictos.push(...lote.map(() => porDefecto("el filtro falló — pasa por defecto")));
    }
  }

  return {
    veredictos,
    aviso: fallos
      ? `El filtro de IA falló en ${fallos} negocio(s): esos entraron sin revisar.`
      : null,
  };
}

/** El puntaje del filtro alimenta la prioridad que ya se ve en la ficha del lead. */
export function prioridadDesdeScore(score: number): "alta" | "media" | "baja" {
  if (score >= 75) return "alta";
  if (score >= 60) return "media";
  return "baja";
}
