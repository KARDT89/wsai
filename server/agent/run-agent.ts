import { OpenAIAgentsProvider } from "@corsair-dev/mcp"
import { Agent, OpenAIProvider, Runner, tool } from "@openai/agents"

import { getCorsairInstance } from "@/lib/corsair/server"
import { DEFAULT_MODEL } from "@/lib/agent-models"

// Register all plugins (side-effect imports)
import "./plugins/gmail"
import "./plugins/googlecalendar"

import { buildPluginSystemPrompt, labelFromPlugins } from "./plugins/index"

export { AVAILABLE_MODELS, DEFAULT_MODEL } from "@/lib/agent-models"
export type { ModelId } from "@/lib/agent-models"

const PROVIDER_BASE_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
}

function buildProvider(opts?: { apiKey?: string | null; provider?: string | null }) {
  const userKey = opts?.apiKey?.trim()
  const userProvider = opts?.provider?.trim() ?? "openrouter"

  if (userKey) {
    return new OpenAIProvider({
      apiKey: userKey,
      baseURL: PROVIDER_BASE_URLS[userProvider] ?? PROVIDER_BASE_URLS.openrouter,
    })
  }

  if (process.env.OPENROUTER_API_KEY) {
    return new OpenAIProvider({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: PROVIDER_BASE_URLS.openrouter,
    })
  }

  return undefined
}

// ─── Stream event types ─────────────────────────────────────────────────────

export type AgentStreamEvent =
  | { type: "tool_start"; id: string; label: string }
  | { type: "tool_done"; id: string }
  | { type: "text"; delta: string }

// ─── Tool label helpers ─────────────────────────────────────────────────────

function labelForToolCall(name: string, rawArgs: string): string {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(rawArgs) as Record<string, unknown>
  } catch {
    // unparseable — use defaults
  }

  switch (name) {
    case "corsair_setup":
      return "Connecting to workspace"
    case "list_operations": {
      const plugin = typeof args.plugin === "string" ? args.plugin : ""
      return plugin ? `Discovering ${plugin} operations` : "Discovering operations"
    }
    case "get_schema": {
      const path = typeof args.path === "string" ? args.path : ""
      return path ? `Reading schema: ${path}` : "Reading API schema"
    }
    case "run_script": {
      const code = typeof args.code === "string" ? args.code : ""
      return labelFromPlugins(code) ?? "Running operation"
    }
    default:
      return name.replace(/_/g, " ")
  }
}

// ─── System prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `
You are the WSAI workspace assistant. You help users manage their Gmail and Google Calendar.

## Tool usage

Call run_script directly. Do NOT call corsair_setup, list_operations, or get_schema.

If run_script returns an error containing "unauthorized", "no token", "not connected", or similar, tell the user that integration needs to be connected at /integrations and stop.

All operation syntax is documented below.

${buildPluginSystemPrompt()}

## Behavioural rules

AUTONOMY: Never ask the user for clarification, confirmation, or more information. If the user asks you to do something, do it immediately using your best judgment.

- Read/search: execute immediately, no preamble.
- Send email: compose the full email yourself (subject, body, tone). Send it. Do not ask what to write.
- Draft reply: read the thread first, compose a reply that fits the conversation context.
- Create event: pick reasonable defaults for duration if not specified. Create it.
- Write operations (send, delete, create event): say what you did in one sentence after completing.
- Summarise threads: use the snippet from threads.list. Do NOT call threads.get for each thread — that explodes token usage.
- Only call threads.get (format: "full") when the user asks to open or read a specific single email.
- Limit threads.list and messages.list to maxResults: 10 unless asked for more.
- If a tool call returns an error, report the exact error in one sentence. Do not retry.
`.trim()
}

// ─── Streaming ──────────────────────────────────────────────────────────────

export type AgentProviderOpts = {
  apiKey?: string | null
  apiKeyProvider?: string | null
}

export async function* streamWsaiAgentEvents(
  tenantId: string,
  prompt: string,
  model: string = DEFAULT_MODEL,
  providerOpts?: AgentProviderOpts
): AsyncGenerator<AgentStreamEvent> {
  const corsair = getCorsairInstance().withTenant(tenantId)
  const provider = new OpenAIAgentsProvider()
  const tools = provider.build({ corsair, tool, tenantId })

  const modelProvider = buildProvider({
    apiKey: providerOpts?.apiKey,
    provider: providerOpts?.apiKeyProvider,
  })

  const agent = new Agent({
    name: "wsai-agent",
    model,
    instructions: buildSystemPrompt(),
    tools,
  })

  const runner = new Runner(modelProvider ? { modelProvider } : undefined)
  const result = await runner.run(agent, prompt, { stream: true })

  let toolIndex = 0
  const callIdToId = new Map<string, string>()

  for await (const event of result) {
    if (event.type === "run_item_stream_event") {
      if (event.name === "tool_called") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = event.item as any
        const toolName: string = item.toolName ?? "unknown"
        const callId: string = item.callId ?? String(toolIndex)
        const rawArgs: string =
          typeof item.rawItem?.arguments === "string"
            ? item.rawItem.arguments
            : typeof item.rawItem?.input === "string"
              ? item.rawItem.input
              : "{}"
        const id = `t${++toolIndex}`
        callIdToId.set(callId, id)
        yield { type: "tool_start", id, label: labelForToolCall(toolName, rawArgs) }
      } else if (event.name === "tool_output") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = event.item as any
        const callId: string = item.callId ?? ""
        const id = callIdToId.get(callId) ?? `t${toolIndex}`
        yield { type: "tool_done", id }
      }
    } else if (
      event.type === "raw_model_stream_event" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (event.data as any).type === "output_text_delta"
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delta: string = (event.data as any).delta ?? ""
      if (delta) yield { type: "text", delta }
    }
  }
}
