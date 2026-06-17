/**
 * WSAIModule — the contract every integration must satisfy.
 *
 * Add a new integration by:
 * 1. Create lib/modules/<name>.ts implementing WSAIModule
 * 2. Register it in lib/modules/registry.ts
 * 3. Add a Prisma table for its entities if needed
 * 4. Optionally add Inngest sync functions
 *
 * The shell picks up nav items, command actions, and agent context
 * automatically from the registry — no shell rewrites required.
 */

export type ModuleId = "mail" | "calendar" | "github" | "slack" | "linear"

export type NavItem = {
  href: string
  label: string
  // Icon is a Hugeicons icon data object — pass it to <HugeiconsIcon icon={...} />
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  badge?: string | (() => Promise<string | undefined>)
}

export type CommandAction = {
  id: string
  label: string
  group: string
  /** Returns a prompt string to dispatch to the AI, or null to navigate directly */
  onSelect: () => { type: "ai"; prompt: string } | { type: "navigate"; href: string }
}

export type ApprovalOperation = {
  plugin: string
  operation: string
  /** Human-readable description shown in the approval card */
  describe: (input: Record<string, unknown>) => string
}

export interface WSAIModule {
  /** Unique identifier for this module */
  id: ModuleId

  /** Display name used in nav and command palette */
  label: string

  /** Corsair plugin name (used for API calls and webhook routing) */
  corsairPlugin?: string

  /** Nav items this module contributes to the sidebar */
  navItems: NavItem[]

  /** Command palette actions this module contributes */
  commandActions: CommandAction[]

  /**
   * Return a human-readable context string for the AI given an item ID.
   * Used when the AI drawer is opened from within a module view.
   * Return null if no contextual string can be built.
   */
  agentContextForItem?: (itemId: string) => Promise<string | null>

  /**
   * Write operations that require user approval before execution.
   * Corsair creates permission rows for gated agent operations.
   */
  approvalRequired: ApprovalOperation[]

  /**
   * Prisma table names this module owns (used for health checks + reset)
   */
  dbTables?: string[]
}
