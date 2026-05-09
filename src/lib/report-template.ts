import type { WebAnalysis } from "@/types";

function buildBars(metricas: WebAnalysis["metricas"]): string {
  return metricas
    .map(
      (m) => `
    <div style="margin-bottom:18px">
      <div class="bar-label">${m.label}</div>
      <div class="bar-track">
        <span class="bar-fill bar-benchmark" style="width:${m.benchmark}%"></span>
      </div>
      <div class="bar-track">
        <span class="bar-fill bar-actual" style="width:${m.actual}%"></span>
      </div>
      <div class="bar-pct">Tu sitio: ${m.actual}% &nbsp;·&nbsp; Benchmark: ${m.benchmark}%</div>
    </div>`
    )
    .join("");
}

function buildOportunidades(oportunidades: string[]): string {
  return oportunidades.map((o) => `<li>${o}</li>`).join("");
}

function getPeriodo(): string {
  return new Date().toLocaleString("es-CO", { month: "long", year: "numeric" });
}

export function generateReportHtml(analysis: WebAnalysis, ciudad: string): string {
  const periodo = getPeriodo();
  const graficoBars = buildBars(analysis.metricas);
  const oportunidadesHtml = buildOportunidades(analysis.oportunidades);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Roboto:wght@400;500&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 210mm; height: 297mm; overflow: hidden; }
    body { font-family: 'Roboto', sans-serif; background: #FFFFFF; color: #1A1A1A; display: flex; flex-direction: column; }

    .header { flex-shrink: 0; padding: 16px 32px; background: #FFFFFF; border-bottom: 3px solid #1a2d4f; display: flex; justify-content: space-between; align-items: center; }
    .header-brand { font-family: 'Poppins', sans-serif; font-size: 20px; font-weight: 700; color: #1a2d4f; letter-spacing: 2px; }
    .header-tagline { font-family: 'Poppins', sans-serif; font-size: 9px; color: #1a2d4f; letter-spacing: 1.5px; text-transform: uppercase; opacity: 0.65; }

    .title-bar { flex-shrink: 0; background: #1a2d4f; color: #FFFFFF; padding: 20px 32px; }
    .title-bar h1 { font-family: 'Poppins', sans-serif; font-size: 18px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }
    .title-bar .subtitle { font-size: 12px; margin-top: 5px; opacity: 0.80; letter-spacing: 0.3px; }

    .two-col { flex: 1; display: flex; min-height: 0; }
    .col-left { flex: 0 0 55%; padding: 28px 32px; display: flex; flex-direction: column; background: #FFFFFF; border-right: 2px solid #e0e6ef; }
    .col-right { flex: 1; padding: 28px 28px; display: flex; flex-direction: column; background: #F5F6F8; }

    .section-title { font-family: 'Poppins', sans-serif; font-size: 9.5px; font-weight: 700; color: #1a2d4f; text-transform: uppercase; letter-spacing: 2.5px; margin-bottom: 14px; padding-bottom: 7px; border-bottom: 2px solid #1a2d4f; }

    .resumen-text { font-size: 12px; color: #1A1A1A; line-height: 1.7; }

    .metric-boxes { display: flex; gap: 10px; margin-top: 24px; }
    .metric-box { flex: 1; background: #1a2d4f; color: #FFFFFF; padding: 18px 20px; border-radius: 5px; }
    .metric-value { font-family: 'Poppins', sans-serif; font-size: 30px; font-weight: 700; line-height: 1; color: #FFFFFF; }
    .metric-label { font-size: 9px; margin-top: 6px; opacity: 0.80; text-transform: uppercase; letter-spacing: 1px; color: #FFFFFF; }

    .chart-area { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
    .bar-label { font-family: 'Poppins', sans-serif; font-size: 11px; font-weight: 600; color: #1a2d4f; margin-bottom: 5px; }
    .bar-track { background: #dde4ef; height: 10px; border-radius: 3px; margin-bottom: 4px; overflow: hidden; }
    .bar-fill { height: 10px; border-radius: 3px; display: block; }
    .bar-actual { background: #1a2d4f; }
    .bar-benchmark { background: #2e5fa3; opacity: 0.45; }
    .bar-pct { font-size: 9.5px; color: #6B7280; }

    .chart-legend { display: flex; gap: 16px; margin-top: 16px; }
    .legend-item { display: flex; align-items: center; gap: 6px; font-size: 9.5px; color: #6B7280; }
    .legend-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }

    .opportunities { flex-shrink: 0; padding: 24px 32px; background: #FFFFFF; border-top: 2px solid #e0e6ef; }
    .opp-list { list-style: none; margin-top: 10px; }
    .opp-list li { font-size: 11.5px; color: #1A1A1A; line-height: 1.5; padding: 11px 0 11px 20px; border-bottom: 1px solid #eaeff5; position: relative; }
    .opp-list li:last-child { border-bottom: none; }
    .opp-list li::before { content: ""; position: absolute; left: 0; top: 16px; width: 7px; height: 7px; border-radius: 50%; background: #1a2d4f; }

    .footer { flex-shrink: 0; background: #1a2d4f; color: #FFFFFF; padding: 13px 32px; display: flex; justify-content: space-between; align-items: center; }
    .footer span { font-size: 10px; opacity: 0.75; }
  </style>
</head>
<body>
  <div class="header">
    <span class="header-brand">ZYTON AI</span>
    <span class="header-tagline">Inteligencia Artificial para Negocios</span>
  </div>

  <div class="title-bar">
    <h1>Análisis de Presencia Web</h1>
    <div class="subtitle">${analysis.nombre} &nbsp;·&nbsp; ${ciudad} &nbsp;·&nbsp; ${periodo}</div>
  </div>

  <div class="two-col">
    <div class="col-left">
      <div class="section-title">Diagnóstico Actual</div>
      <p class="resumen-text">${analysis.resumen}</p>
      <div class="metric-boxes">
        <div class="metric-box">
          <div class="metric-value">${analysis.puntaje_web}/100</div>
          <div class="metric-label">Puntaje web</div>
        </div>
        <div class="metric-box">
          <div class="metric-value">${analysis.velocidad}</div>
          <div class="metric-label">Velocidad estimada</div>
        </div>
      </div>
    </div>
    <div class="col-right">
      <div class="section-title">Comparativa del Sector</div>
      <div class="chart-area">
        ${graficoBars}
      </div>
      <div class="chart-legend">
        <div class="legend-item">
          <span class="legend-dot" style="background:#1a2d4f;"></span>Tu sitio
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background:#2e5fa3; opacity:0.6;"></span>Benchmark sector
        </div>
      </div>
    </div>
  </div>

  <div class="opportunities">
    <div class="section-title">Oportunidades de Mejora</div>
    <ul class="opp-list">
      ${oportunidadesHtml}
    </ul>
  </div>

  <div class="footer">
    <span>zytonai.com &nbsp;·&nbsp; contacto@zytonai.com</span>
    <span>Informe preparado por Zyton AI &nbsp;·&nbsp; ${periodo}</span>
  </div>
</body>
</html>`;
}
