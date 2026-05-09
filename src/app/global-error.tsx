"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ fontFamily: "system-ui", padding: "2rem", background: "#fff" }}>
        <h2 style={{ color: "#dc2626", marginBottom: "1rem" }}>
          Error del servidor
        </h2>
        <pre
          style={{
            background: "#f3f4f6",
            padding: "1rem",
            borderRadius: "8px",
            fontSize: "12px",
            overflow: "auto",
            maxHeight: "300px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {error?.message || "Sin mensaje de error"}
          {"\n\n"}
          {error?.stack || "Sin stack trace"}
          {error?.digest ? `\n\nDigest: ${error.digest}` : ""}
        </pre>
        <button
          onClick={reset}
          style={{
            marginTop: "1rem",
            padding: "8px 16px",
            background: "#111",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
