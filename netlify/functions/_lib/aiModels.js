// Centralized Claude model IDs.
// Update these constants when Anthropic releases a new generation or retires a model.
// Override at runtime via env vars: CLAUDE_OPUS / CLAUDE_SONNET / CLAUDE_HAIKU

export const MODELS = {
  OPUS:   process.env.CLAUDE_OPUS   ?? "claude-opus-4-7",
  SONNET: process.env.CLAUDE_SONNET ?? "claude-sonnet-4-6",
  HAIKU:  process.env.CLAUDE_HAIKU  ?? "claude-haiku-4-5-20251001",
};
