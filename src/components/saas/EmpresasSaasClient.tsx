"use client";

import { useRouter } from "next/navigation";
import { Download, Building2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface PagoSaas {
  pagado_en: string;
  monto: number;
  referencia: string | null;
  origen: string | null;
  plan: string | null;
  periodo: string | null;
  cubre_desde: string | null;
  cubre_hasta: string | null;
}

export interface EmpresaSaas {
  id: string;
  nombre: string;
  nombre_marca: string | null;
  subdominio: string;
  plan: string;
  plan_periodo: string | null;
  estado: string;
  cobro_estado: string | null;
  plan_pagado_hasta: string | null;
  plan_cancelado_en: string | null;
  razon_social: string | null;
  documento_tipo: string | null;
  documento_numero: string | null;
  documento_dv: string | null;
  direccion_facturacion: string | null;
  ciudad_facturacion: string | null;
  gerente: string | null;
  correo_gerencia: string | null;
  pagos_del_mes: PagoSaas[];
}

const pesos = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const documento = (e: EmpresaSaas) =>
  e.documento_numero
    ? `${e.documento_tipo ?? ""} ${e.documento_numero}${e.documento_dv ? `-${e.documento_dv}` : ""}`.trim()
    : "";

/** Una fila por cobro del mes (lo que se factura); las que no pagaron, una fila sin monto. */
function csv(empresas: EmpresaSaas[], mes: string) {
  const cols = [
    "Empresa", "Subdominio", "Razón social", "Documento", "Dirección", "Ciudad",
    "Correo", "Plan", "Periodo", "Pagado el", "Monto (COP)", "Referencia", "Cubre desde", "Cubre hasta",
  ];
  const celda = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const filas: unknown[][] = [];
  for (const e of empresas) {
    const fijos = [
      e.nombre_marca ?? e.nombre, e.subdominio, e.razon_social, documento(e),
      e.direccion_facturacion, e.ciudad_facturacion, e.correo_gerencia,
    ];
    if (e.pagos_del_mes.length === 0) filas.push([...fijos, e.plan, e.plan_periodo, "", "", "", "", ""]);
    for (const p of e.pagos_del_mes) {
      filas.push([...fijos, p.plan, p.periodo, p.pagado_en.slice(0, 10), p.monto, p.referencia, p.cubre_desde, p.cubre_hasta]);
    }
  }
  // BOM para que Excel abra bien las tildes.
  const texto = "﻿" + [cols, ...filas].map((f) => f.map(celda).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `empresas-saas-${mes}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function EmpresasSaasClient({
  empresas,
  mes,
  error,
}: {
  empresas: EmpresaSaas[];
  mes: string;
  error: string | null;
}) {
  const router = useRouter();
  const cobrado = empresas.reduce((s, e) => s + e.pagos_del_mes.reduce((t, p) => t + p.monto, 0), 0);
  const conCobro = empresas.filter((e) => e.pagos_del_mes.length > 0).length;
  const sinDatos = empresas.filter((e) => e.pagos_del_mes.length > 0 && !e.documento_numero).length;

  return (
    <div className="p-5 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Lo que hay que facturar a las empresas del CRM. Un cobro aprobado del mes = una factura.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={mes}
            onChange={(e) => e.target.value && router.push(`/saas?mes=${e.target.value}`)}
            className="w-40"
          />
          <Button variant="outline" onClick={() => csv(empresas, mes)} disabled={!empresas.length}>
            <Download className="w-4 h-4 mr-1.5" /> Descargar CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl p-4 text-sm bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          ["Empresas", String(empresas.length)],
          ["Con cobros este mes", String(conCobro)],
          ["Cobrado en el mes", pesos(cobrado)],
        ].map(([t, v]) => (
          <div key={t} className="rounded-2xl p-4 bg-card shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
            <p className="text-[11px] font-medium text-muted-foreground">{t}</p>
            <p className="mt-2 text-2xl font-bold leading-none">{v}</p>
          </div>
        ))}
      </div>

      {sinDatos > 0 && (
        <div className="flex items-start gap-2 rounded-xl p-3 text-sm bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {sinDatos === 1 ? "Una empresa pagó" : `${sinDatos} empresas pagaron`} este mes sin razón social ni
          documento. Pídeselos antes de facturar (o que los llenen en su Configuración → Plan y pagos).
        </div>
      )}

      <div className="rounded-2xl bg-card shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.08] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Facturar a</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Pagado hasta</TableHead>
              <TableHead className="text-right">Cobros del mes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {empresas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  <Building2 className="w-5 h-5 mx-auto mb-2 opacity-50" />
                  Sin empresas.
                </TableCell>
              </TableRow>
            )}
            {empresas.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <p className="font-medium">{e.nombre_marca ?? e.nombre}</p>
                  <p className="text-xs text-muted-foreground">{e.subdominio}.zytonai.com</p>
                </TableCell>
                <TableCell>
                  {e.razon_social || e.documento_numero ? (
                    <>
                      <p>{e.razon_social ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {[documento(e), e.direccion_facturacion, e.ciudad_facturacion].filter(Boolean).join(" · ")}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin datos de facturación</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {e.correo_gerencia ?? <span className="text-xs text-muted-foreground">Sin correo real</span>}
                </TableCell>
                <TableCell className="text-sm capitalize">
                  {e.plan} {e.plan_periodo ? `· ${e.plan_periodo}` : ""}
                  {e.estado !== "activo" && <p className="text-xs text-red-600">{e.estado}</p>}
                  {e.plan_cancelado_en && <p className="text-xs text-amber-600">cancelado</p>}
                </TableCell>
                <TableCell className="text-sm">{e.plan_pagado_hasta ?? "Sin vencimiento"}</TableCell>
                <TableCell className="text-right text-sm">
                  {e.pagos_del_mes.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    e.pagos_del_mes.map((p) => (
                      <p key={`${p.referencia}-${p.pagado_en}`}>
                        {pesos(p.monto)}{" "}
                        <span className="text-xs text-muted-foreground">{p.pagado_en.slice(0, 10)}</span>
                      </p>
                    ))
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
