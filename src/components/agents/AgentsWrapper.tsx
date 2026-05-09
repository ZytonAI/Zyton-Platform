"use client";

import { useEffect, useState } from "react";

export function AgentsWrapper() {
  const [Comp, setComp] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    import("./AgentsPageClient").then((m) => {
      setComp(() => m.AgentsPageClient);
    });
  }, []);

  if (!Comp) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Cargando agentes...</div>
    );
  }

  return <Comp />;
}
