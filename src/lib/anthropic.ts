import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _client;
}

// Keep backward-compat export for existing code
export const anthropic = {
  messages: { create: (...args: Parameters<Anthropic["messages"]["create"]>) => getAnthropic().messages.create(...args) },
};
