import type { WSAIModule, ModuleId } from "./types"

const modules = new Map<ModuleId, WSAIModule>()

export function registerModule(mod: WSAIModule) {
  modules.set(mod.id, mod)
}

export function getModule(id: ModuleId): WSAIModule | undefined {
  return modules.get(id)
}

export function getAllModules(): WSAIModule[] {
  return Array.from(modules.values())
}

export function getAllNavItems() {
  return getAllModules().flatMap((m) => m.navItems)
}

export function getAllCommandActions() {
  return getAllModules().flatMap((m) => m.commandActions)
}
