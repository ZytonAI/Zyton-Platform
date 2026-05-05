import { createClient } from "@supabase/supabase-js";

// Cliente con service role — bypasea RLS, solo usar en API routes de servidor
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
