import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/permissions";
import { TopBar } from "@/components/layout/TopBar";
import { EmpresasSaasClient, type EmpresaSaas } from "@/components/saas/EmpresasSaasClient";

export const dynamic = "force-dynamic";

/**
 * Empresas del SaaS (app.zytonai.com) con lo que hace falta para facturarles:
 * razón social, documento, dirección, correo de la gerencia y los cobros que
 * les entraron en el mes. Solo el Dueño, igual que Facturas.
 *
 * Los datos viven en el Supabase del SaaS, no en el de esta plataforma. Se
 * piden a su API (`GET /plataforma/empresas`) servidor a servidor con la llave
 * de plataforma (`SAAS_PLATAFORMA_KEY`, la misma `PLATAFORMA_API_KEY` del
 * backend del SaaS): nunca llega al navegador.
 */
export default async function SaasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { user, role } = await getSession();
  if (!user) redirect("/login");
  if (!isOwner(role)) redirect("/dashboard");

  const { mes } = await searchParams;
  const mesValido = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : undefined;

  let empresas: EmpresaSaas[] = [];
  let mesMostrado = mesValido ?? new Date().toISOString().slice(0, 7);
  let error: string | null = null;

  const llave = process.env.SAAS_PLATAFORMA_KEY;
  const base = (process.env.SAAS_API_URL || "https://api.zytonai.com").replace(/\/$/, "");
  if (!llave) {
    error = "Falta SAAS_PLATAFORMA_KEY en el entorno de esta plataforma.";
  } else {
    try {
      const r = await fetch(`${base}/plataforma/empresas${mesValido ? `?mes=${mesValido}` : ""}`, {
        headers: { "X-Plataforma-Key": llave },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) {
        error = `La API del SaaS respondió ${r.status}.`;
      } else {
        const data = (await r.json()) as { mes: string; empresas: EmpresaSaas[] };
        empresas = data.empresas;
        mesMostrado = data.mes;
      }
    } catch {
      error = "No se pudo hablar con la API del SaaS.";
    }
  }

  return (
    <>
      <TopBar title="Empresas SaaS" userEmail={user?.email} />
      <EmpresasSaasClient empresas={empresas} mes={mesMostrado} error={error} />
    </>
  );
}
