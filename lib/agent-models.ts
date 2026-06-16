export type Step = { id: string; label: string; done: boolean }

export type AgentStreamEvent =
  | { type: "tool_start"; id: string; label: string }
  | { type: "tool_done"; id: string }
  | { type: "text"; delta: string }

export const AVAILABLE_MODELS = [
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
] as const

export type ModelId = (typeof AVAILABLE_MODELS)[number]["id"]
export const DEFAULT_MODEL: ModelId = "openai/gpt-4o"
