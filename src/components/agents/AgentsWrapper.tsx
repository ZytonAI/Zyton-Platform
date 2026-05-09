"use client";

import { useEffect, useState, Component } from "react";
import type { ReactNode } from "react";

class LocalErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", color: "red", fontFamily: "monospace" }}>
          <strong>CRASH en AgentsPageClient:</strong>
          <pre style={{ marginTop: "1rem", whiteSpace: "pre-wrap", fontSize: "12px" }}>
            {String(this.state.error)}
            {"\n"}
            {(this.state.error as Error).stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AgentsWrapper() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [Comp, setComp] = useState<any>(null);

  useEffect(() => {
    import("./AgentsPageClient")
      .then((m) => setComp(() => m.AgentsPageClient))
      .catch((e) => console.error("import failed:", e));
  }, []);

  if (!Comp) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando agentes...</div>;
  }

  return (
    <LocalErrorBoundary>
      <Comp />
    </LocalErrorBoundary>
  );
}
