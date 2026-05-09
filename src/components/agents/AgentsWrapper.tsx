"use client";

import { useEffect, useState } from "react";

export function AgentsWrapper() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [Comp, setComp] = useState<any>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    import("./AgentsPageClient")
      .then((m) => setComp(() => m.AgentsPageClient))
      .catch((e) => setImportError(String(e)));
  }, []);

  if (importError) {
    return (
      <div style={{ padding: "2rem", color: "red", fontFamily: "monospace" }}>
        Import error: {importError}
      </div>
    );
  }

  if (!Comp) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando agentes...</div>;
  }

  return <Comp />;
}
