export type AgentPlugin = {
  id: string
  systemPromptSection: string
  labelForScript: (code: string) => string | null
}

const registry: AgentPlugin[] = []

export function registerPlugin(plugin: AgentPlugin) {
  registry.push(plugin)
}

export function getPlugins(): AgentPlugin[] {
  return registry
}

export function buildPluginSystemPrompt(): string {
  return registry.map((p) => p.systemPromptSection.trim()).join("\n\n")
}

export function labelFromPlugins(code: string): string | null {
  for (const plugin of registry) {
    const label = plugin.labelForScript(code)
    if (label) return label
  }
  return null
}
