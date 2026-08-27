/**
 * "Ver como" — el Dueño mira la plataforma con los ojos de un Socio
 * Estratégico, sin pedirle la contraseña a nadie.
 *
 * Es una vista de la INTERFAZ: cambia el rol y el slug con los que se
 * renderiza la app (qué ítems salen en el menú, qué chats le tocan, qué
 * esconde el Dashboard). La sesión de Supabase sigue siendo la del Dueño,
 * así que RLS y `owner_id` no cambian: lo personal de la otra persona
 * —sus eventos privados del calendario y su historial de Diana— no se ve.
 *
 * Solo lo aplica `getSession` cuando quien está firmado es de verdad el
 * Dueño; una cookie puesta a mano por un Socio Estratégico se ignora.
 */
export const VIEW_AS_COOKIE = "zyton_view_as";

/** Cuánto dura la vista prestada antes de volver sola a la propia. */
export const VIEW_AS_MAX_AGE = 8 * 60 * 60; // 8 horas
