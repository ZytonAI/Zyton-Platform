// Normalización de teléfonos para WhatsApp.
// Los duplicados de conversaciones nacían de comparar números con y sin
// código de país ("3001234567" vs "573001234567"): aquí se centraliza
// la canonicalización para que todas las rutas hablen el mismo formato.

const DEFAULT_COUNTRY_CODE = process.env.WA_DEFAULT_COUNTRY_CODE ?? "57";

/** Deja solo dígitos y quita el prefijo internacional "00". */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits;
}

/**
 * ¿Estos 10 dígitos son un número colombiano sin código de país?
 *
 * En Colombia los móviles empiezan por 3 (3XX XXX XXXX) y los fijos por 60
 * (60X XXX XXXX). Cualquier otro número de 10 dígitos es de otro país — un
 * `(214) 571-4553` de Estados Unidos, por ejemplo.
 */
function pareceColombianoSinPais(digits: string): boolean {
  return digits.length === 10 && (digits.startsWith("3") || digits.startsWith("60"));
}

/**
 * Convierte un teléfono a wa_chat_id canónico (`<dígitos>@c.us`).
 *
 * El `+`, los espacios y los paréntesis se pierden por el camino: WhatsApp
 * direcciona con dígitos pelados, así que da igual cómo esté escrito.
 *
 * El código de país solo se añade cuando el número de verdad parece
 * colombiano. Antes se le ponía a cualquier cosa de 10 dígitos o menos, y eso
 * convertía un número extranjero en uno colombiano **válido pero de otra
 * persona**: `(214) 571-4553` (Dallas) salía como `572145714553`, y ese
 * mensaje se le habría ido a un desconocido. Es mejor que WhatsApp diga que
 * el número no existe a mandarle el mensaje a quien no es.
 */
export function toWaChatId(phone: string): string {
  const digits = normalizePhone(phone);
  const conPais = pareceColombianoSinPais(digits)
    ? `${DEFAULT_COUNTRY_CODE}${digits}`
    : digits;
  return `${conPais}@c.us`;
}

/**
 * Dos teléfonos son el mismo si tras normalizar son iguales, o si uno es
 * sufijo del otro con al menos 10 dígitos de coincidencia (mismo número
 * con y sin código de país). Reemplaza el viejo LIKE %últimos-10, que
 * podía cruzar contactos distintos con sufijos cortos.
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [longer, shorter] = na.length >= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 10 && longer.endsWith(shorter);
}
