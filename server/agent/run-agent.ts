import { OpenAIAgentsProvider } from "@corsair-dev/mcp"
import { Agent, OpenAIProvider, Runner, tool } from "@openai/agents"

import { ensureCorsairSetup, getCorsairAgentInstance } from "@/lib/corsair/server"
import { logReliableSyncFailure, requestReliableSync } from "@/lib/corsair/reliable-sync"
import { DEFAULT_MODEL } from "@/lib/agent-models"
import type { SyncableCorsairPluginId } from "@/lib/corsair/sync"

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
      return labelForCorsairScript(code)
    }
    default:
      return name.replace(/_/g, " ")
  }
}

function labelForCorsairScript(code: string): string {
  if (/gmail\.db\.(threads|messages)\.search/.test(code)) {
    return "Searching Gmail"
  }
  if (/gmail\.db\.labels\.search/.test(code)) {
    return "Reading Gmail labels"
  }
  if (/gmail\.api\.threads\.list|gmail\.api\.messages\.list/.test(code)) {
    return "Searching Gmail"
  }
  if (/gmail\.api\.threads\.get|gmail\.api\.messages\.get/.test(code)) {
    return "Reading Gmail"
  }
  if (/gmail\.api\.messages\.send|gmail\.api\.drafts\.send/.test(code)) {
    return "Sending email"
  }
  if (/gmail\.api\.drafts\.(create|update)/.test(code)) {
    return "Saving email draft"
  }
  if (/gmail\.api\.(threads|messages)\.(modify|trash|delete|untrash)/.test(code)) {
    if (/removeLabelIds:\s*\[[^\]]*["']INBOX["']/.test(code)) return "Archiving thread"
    if (/addLabelIds:\s*\[[^\]]*["']STARRED["']/.test(code)) return "Starring thread"
    if (/removeLabelIds:\s*\[[^\]]*["']STARRED["']/.test(code)) return "Unstarring thread"
    if (/removeLabelIds:\s*\[[^\]]*["']UNREAD["']/.test(code)) return "Marking email read"
    if (/addLabelIds:\s*\[[^\]]*["']UNREAD["']/.test(code)) return "Marking email unread"
    if (/\.trash\(/.test(code)) return "Moving email to trash"
    if (/\.delete\(/.test(code)) return "Deleting email"
    if (/\.untrash\(/.test(code)) return "Restoring email"
    return "Updating email"
  }
  if (/googlecalendar\.db\.events\.search/.test(code)) {
    return "Fetching calendar"
  }
  if (/googlecalendar\.api\.events\.getMany/.test(code)) {
    return "Fetching calendar"
  }
  if (/googlecalendar\.api\.events\.get/.test(code)) {
    return "Reading calendar event"
  }
  if (/googlecalendar\.api\.events\.(create|update|delete)/.test(code)) {
    if (/\.create\(/.test(code)) return "Creating calendar event"
    if (/\.update\(/.test(code)) return "Updating calendar event"
    if (/\.delete\(/.test(code)) return "Deleting calendar event"
    return "Updating calendar"
  }
  if (/googlecalendar\.api\.calendar\.getAvailability/.test(code)) {
    return "Checking availability"
  }
  return "Running Corsair operation"
}

function syncPluginForCorsairScript(code: string): SyncableCorsairPluginId | null {
  if (
    /gmail\.api\.messages\.(send|modify|batchModify|trash|delete|untrash)/.test(code) ||
    /gmail\.api\.drafts\.(create|update|delete|send)/.test(code) ||
    /gmail\.api\.threads\.(modify|trash|delete|untrash)/.test(code) ||
    /gmail\.api\.labels\.(create|update|delete)/.test(code)
  ) {
    return "gmail"
  }

  if (/googlecalendar\.api\.events\.(create|update|delete)/.test(code)) {
    return "googlecalendar"
  }

  return null
}

// ─── System prompt ──────────────────────────────────────────────────────────

function buildApprovalInstructions(approvalStrict?: string | null): string {
  if (approvalStrict === "never") {
    return "Read, write, and destructive Corsair actions may run immediately because the user disabled approval gating."
  }

  if (approvalStrict === "all") {
    return "All Corsair operations, including reads, are permission-gated. If a tool result says approval is required or pending, stop and tell the user to review it on /approvals. Do not retry the same operation until the user approves it."
  }

  return "Read-only actions may run immediately. Write or destructive operations are permission-gated by Corsair. If a tool result says approval is required or pending, stop and tell the user to review it on /approvals. Do not retry the same write until the user approves it."
}

function buildSystemPrompt(approvalStrict?: string | null): string {
  return `
You are the WSAI workspace assistant. You help users manage their connected integrations.

You have access to Corsair tools. Use list_operations to discover available APIs, get_schema to understand arguments, and run_script to execute them.

- For reads and searches, prefer list_operations with type "db" (faster, uses cached data).
- For writes and actions, use list_operations with type "api".
- Always call get_schema before any write or destructive operation, including Gmail send/draft/reply/archive/trash/delete and Calendar create/update/delete.
- If an operation name or argument shape is not already known from list_operations or get_schema, do not guess. Discover first.
- On a schema or validation error, read the error and retry once with corrected parameters. On auth, missing integration, permission, or approval errors, stop and explain the required user action.
- If an integration is not connected, tell the user to connect it at /integrations and stop.

## Trust-loop proof

The first product proof is Gmail and Google Calendar reliability through Corsair:
- Gmail: search/read current mail, archive/star/mark read/trash/delete, create drafts, send replies.
- Calendar: list/search events, check availability, create/update/delete events.
- Direct writes should execute through Corsair when approval mode allows it. If approval is required, stop after the approval request and tell the user to review /approvals.
- After any successful write, state exactly what changed.

## Real-time feedback

Before each tool call, write one short sentence telling the user what you are about to do.
Examples: "I'll search your inbox now." / "Archiving that thread." / "Checking your calendar."
After getting results, go straight to the answer.

## Limits

- Call list_operations for one plugin at a time.
- Use maxResults <= 10 unless the user asks for more.
- Use snippets and metadata for summaries — do not fetch full email bodies in a loop.
- Filter large responses inside run_script; return only what's needed.
- If a search returns nothing, say so and stop. Do not broaden or retry unless asked.
- If the task depends on a missing item, do nothing and explain why.
- For a request like "archive the newest test email", search a narrow recent inbox result first, then archive exactly that thread.
- For reply/send requests, include the recipient and message summary in the final answer.
- For calendar create/update/delete requests, include the event title and time in the final answer.

## Approval and safety

${buildApprovalInstructions(approvalStrict)}

Be concise. Do not ask for clarification unless the request cannot be completed safely.
`.trim()
}

// ─── Streaming ──────────────────────────────────────────────────────────────

export type AgentProviderOpts = {
  apiKey?: string | null
  apiKeyProvider?: string | null
  approvalStrict?: string | null
}

export async function* streamWsaiAgentEvents(
  tenantId: string,
  prompt: string,
  model: string = DEFAULT_MODEL,
  providerOpts?: AgentProviderOpts
): AsyncGenerator<AgentStreamEvent> {
  await ensureCorsairSetup(tenantId)
  const corsair = getCorsairAgentInstance(providerOpts?.approvalStrict).withTenant(tenantId)
  const provider = new OpenAIAgentsProvider()
  const tools = provider.build({ corsair, tool, tenantId, setup: false })

  const modelProvider = buildProvider({
    apiKey: providerOpts?.apiKey,
    provider: providerOpts?.apiKeyProvider,
  })

  const agent = new Agent({
    name: "wsai-agent",
    model,
    instructions: buildSystemPrompt(providerOpts?.approvalStrict),
    tools,
  })

  const runner = new Runner(modelProvider ? { modelProvider } : undefined)
  const result = await runner.run(agent, prompt, { stream: true })

  let toolIndex = 0
  const callIdToId = new Map<string, string>()
  const callIdToSyncPlugin = new Map<string, SyncableCorsairPluginId>()

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
        if (toolName === "run_script") {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(rawArgs) as Record<string, unknown>
          } catch {
            // unparseable — no sync hint
          }
          const code = typeof args.code === "string" ? args.code : ""
          const syncPlugin = syncPluginForCorsairScript(code)
          if (syncPlugin) callIdToSyncPlugin.set(callId, syncPlugin)
        }
        yield { type: "tool_start", id, label: labelForToolCall(toolName, rawArgs) }
      } else if (event.name === "tool_output") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = event.item as any
        const callId: string = item.callId ?? ""
        const id = callIdToId.get(callId) ?? `t${toolIndex}`
        yield { type: "tool_done", id }
        const syncPlugin = callIdToSyncPlugin.get(callId)
        if (syncPlugin) {
          void requestReliableSync({
            tenantId,
            plugin: syncPlugin,
            reason: "user_action",
          }).catch(logReliableSyncFailure(`agent ${syncPlugin}`))
          callIdToSyncPlugin.delete(callId)
        }
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
