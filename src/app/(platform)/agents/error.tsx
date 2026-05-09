"use client";

export default function AgentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold text-destructive">Error cargando Agentes IA</h2>
      <pre className="text-xs bg-gray-100 rounded-lg p-4 overflow-auto max-h-48 text-gray-700">
        {error.message}
        {error.digest ? `\nDigest: ${error.digest}` : ""}
      </pre>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700"
      >
        Intentar de nuevo
      </button>
    </div>
  );
}
