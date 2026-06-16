export const AVAILABLE_MODELS = [
  { id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "openai/gpt-4.1", label: "GPT-4.1" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
] as const

export type ModelId = (typeof AVAILABLE_MODELS)[number]["id"]
export const DEFAULT_MODEL: ModelId = "anthropic/claude-sonnet-4-5"
