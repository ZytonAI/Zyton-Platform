/**
 * La hora de los eventos del calendario.
 *
 * La columna `calendar_events.event_date` es TIMESTAMPTZ: guarda un instante,
 * no la hora que alguien escribió. El formulario, en cambio, habla de hora de
 * pared ("2026-08-27" + "15:30"), y ese texto sin huso Postgres lo tomaba como
 * UTC: el evento quedaba grabado cinco horas más tarde de lo que se quiso y la
 * lista lo mostraba a las 10:30. Estas dos funciones son las que traducen entre
 * los dos mundos, en la ida y en la vuelta.
 */

/** Colombia no cambia de hora con las estaciones, así que el huso es fijo. */
const HORA_COLOMBIA = "-05:00";
const SIN_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/**
 * Le pone su huso a una hora escrita sin zona. Lo que ya viene con zona —la ISO
 * que manda arrastrar un evento en el calendario, por ejemplo— se deja igual.
 */
export function conHoraDeColombia(valor: string): string {
  if (!SIN_ZONA.test(valor)) return valor;
  const conSegundos = valor.length === 16 ? `${valor}:00` : valor;
  return `${conSegundos}${HORA_COLOMBIA}`;
}

/**
 * El camino de vuelta: del instante guardado a lo que tienen que mostrar los
 * campos de fecha y hora del formulario. Recortar el texto ISO enseñaba la hora
 * en UTC, que es justo lo que hay que evitar.
 */
export function splitDateTime(valor: string): { date: string; time: string } {
  if (!valor) return { date: "", time: "" };
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) {
    const [date, time] = valor.slice(0, 16).split("T");
    return { date: date ?? "", time: time ?? "" };
  }
  const dosCifras = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`,
    time: `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`,
  };
}
