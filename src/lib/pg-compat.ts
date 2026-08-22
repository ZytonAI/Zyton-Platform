/**
 * Red de seguridad para el desfase entre desplegar y correr la migración.
 *
 * Las migraciones se aplican a mano en el SQL Editor de Supabase, así que
 * puede haber unos minutos en los que el código ya conoce una columna que la
 * base todavía no tiene. Sin esto, guardar un lead reventaría con
 * "column leads.contacted_by does not exist".
 *
 * Con esto, el guardado se reintenta sin esa columna: se pierde el dato nuevo
 * (el resto se guarda bien) y queda un aviso en los logs. En cuanto la
 * migración corre, todo vuelve a guardarse completo sin tocar nada.
 */

/**
 * Resultado de una query de supabase-js. `data` queda sin tipar, igual que lo
 * devuelve el cliente sin generics: las rutas hacen `if (error) return ...`
 * y después leen sus campos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryResult = { data: any; error: { message: string } | null };

/**
 * Saca el nombre de la columna del mensaje de error. Hay dos redacciones:
 *
 *   PostgREST (PGRST204, es la que sale al insertar/actualizar):
 *     Could not find the 'contacted_by' column of 'leads' in the schema cache
 *   Postgres crudo:
 *     column leads.contacted_by does not exist
 */
function missingColumn(message: string): string | null {
  const patterns = [
    /could not find the '([^']+)' column/i,
    /column "?([\w.]+)"? does not exist/i,
    /column "([^"]+)" of relation/i,
  ];
  for (const pattern of patterns) {
    const found = pattern.exec(message)?.[1];
    if (found) return found.includes(".") ? found.split(".").pop()! : found;
  }
  return null;
}

/**
 * Corre la query; si la base se queja de una columna que no existe, la quita
 * del payload y reintenta. Máximo unos pocos intentos para no ciclar.
 */
export async function withColumnFallback(
  payload: Record<string, unknown>,
  run: (payload: Record<string, unknown>) => PromiseLike<QueryResult>,
  maxRetries = 5
): Promise<QueryResult> {
  const current = { ...payload };

  for (let i = 0; i <= maxRetries; i++) {
    const result = await run(current);
    if (!result.error) return result;

    const column = missingColumn(result.error.message);
    if (!column || !(column in current)) return result;

    console.warn(
      `[pg-compat] la columna "${column}" no existe todavía en la base — se guarda sin ella. ` +
        `Corre las migraciones pendientes de supabase/migrations/.`
    );
    delete current[column];
  }

  return run(current);
}

/**
 * Igual que `withColumnFallback`, pero para inserciones en lote (por ejemplo
 * los leads que trae Raúl): quita la columna de todas las filas y reintenta.
 */
export async function withColumnFallbackRows(
  rows: Record<string, unknown>[],
  run: (rows: Record<string, unknown>[]) => PromiseLike<QueryResult>,
  maxRetries = 5
): Promise<QueryResult> {
  let current = rows.map((row) => ({ ...row }));

  for (let i = 0; i <= maxRetries; i++) {
    const result = await run(current);
    if (!result.error) return result;

    const column = missingColumn(result.error.message);
    if (!column || !current.some((row) => column in row)) return result;

    console.warn(
      `[pg-compat] la columna "${column}" no existe todavía en la base — se guarda sin ella. ` +
        `Corre las migraciones pendientes de supabase/migrations/.`
    );
    current = current.map((row) => {
      const copy = { ...row };
      delete copy[column];
      return copy;
    });
  }

  return run(current);
}
