"use client";

import { useEffect, useState } from "react";

export function AgentsWrapper() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    import("./AgentsPageClient")
      .then(() => setLoaded(true))
      .catch((e) => console.error("import failed:", e));
  }, []);

  return (
    <div className="p-6 text-sm">
      {loaded ? "AgentsPageClient cargado OK — paso 4" : "Cargando..."}
    </div>
  );
}
