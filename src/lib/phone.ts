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
 * Convierte un teléfono a wa_chat_id canónico (`<dígitos>@c.us`).
 * Los números locales de 10 dígitos o menos reciben el código de país
 * por defecto, para que coincidan con lo que reporta WhatsApp.
 */
export function toWaChatId(phone: string): string {
  let digits = normalizePhone(phone);
  if (digits.length <= 10 && !digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    digits = `${DEFAULT_COUNTRY_CODE}${digits}`;
  }
  return `${digits}@c.us`;
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
