// Replaced by /api/agents/elisa
export async function POST() {
  return new Response(JSON.stringify({ error: "Use /api/agents/elisa instead" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  });
}
