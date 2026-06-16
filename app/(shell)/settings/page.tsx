"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  EyeIcon,
  EyeOffIcon,
  Key01Icon,
  SaveIcon,
  Settings05Icon,
  UserCircle02Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type Tab = "account" | "api" | "preferences"

type Settings = {
  apiKeyProvider: string | null
  apiKey: string | null
  aiTone: string
  approvalStrict: string
  emailSignature: string | null
  hasApiKey: boolean
}

export default function SettingsPage() {
  const [tab, setTab] = React.useState<Tab>("api")
  const [settings, setSettings] = React.useState<Settings | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  // API key form state
  const [apiKeyProvider, setApiKeyProvider] = React.useState("openrouter")
  const [apiKey, setApiKey] = React.useState("")
  const [showKey, setShowKey] = React.useState(false)

  // Preferences form state
  const [aiTone, setAiTone] = React.useState("professional")
  const [approvalStrict, setApprovalStrict] = React.useState("writes")
  const [emailSignature, setEmailSignature] = React.useState("")

  React.useEffect(() => {
    void loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    try {
      const res = await fetch("/api/settings")
      const data = (await res.json()) as { settings: Settings; hasApiKey: boolean }
      setSettings({ ...data.settings, hasApiKey: data.hasApiKey })
      setApiKeyProvider(data.settings.apiKeyProvider ?? "openrouter")
      setAiTone(data.settings.aiTone ?? "professional")
      setApprovalStrict(data.settings.approvalStrict ?? "writes")
      setEmailSignature(data.settings.emailSignature ?? "")
    } catch {
      toast.error("Failed to load settings")
    } finally {
      setLoading(false)
    }
  }

  async function saveApiKey() {
    setSaving(true)
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKeyProvider,
          apiKey: apiKey || null,
        }),
      })
      const data = (await res.json()) as { settings: Settings; hasApiKey: boolean }
      setSettings((prev) => ({ ...(prev ?? ({} as Settings)), ...data.settings, hasApiKey: data.hasApiKey }))
      setApiKey("")
      toast.success("API key saved")
    } catch {
      toast.error("Failed to save API key")
    } finally {
      setSaving(false)
    }
  }

  async function removeApiKey() {
    setSaving(true)
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKeyProvider: null, apiKey: null }),
      })
      setSettings((prev) => prev ? { ...prev, hasApiKey: false, apiKeyProvider: null } : prev)
      toast.success("API key removed — using system key")
    } catch {
      toast.error("Failed to remove key")
    } finally {
      setSaving(false)
    }
  }

  async function savePreferences() {
    setSaving(true)
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aiTone, approvalStrict, emailSignature: emailSignature || null }),
      })
      toast.success("Preferences saved")
    } catch {
      toast.error("Failed to save preferences")
    } finally {
      setSaving(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "api", label: "API Keys" },
    { id: "preferences", label: "Preferences" },
    { id: "account", label: "Account" },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-14 items-center gap-3 border-b px-6">
        <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">Settings</h1>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Tab sidebar */}
        <nav className="w-48 shrink-0 border-r p-3">
          <div className="space-y-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                  tab === t.id
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              Loading…
            </div>
          ) : tab === "api" ? (
            <ApiKeyTab
              provider={apiKeyProvider}
              setProvider={setApiKeyProvider}
              apiKey={apiKey}
              setApiKey={setApiKey}
              showKey={showKey}
              setShowKey={setShowKey}
              hasKey={settings?.hasApiKey ?? false}
              saving={saving}
              onSave={saveApiKey}
              onRemove={removeApiKey}
            />
          ) : tab === "preferences" ? (
            <PreferencesTab
              aiTone={aiTone}
              setAiTone={setAiTone}
              approvalStrict={approvalStrict}
              setApprovalStrict={setApprovalStrict}
              emailSignature={emailSignature}
              setEmailSignature={setEmailSignature}
              saving={saving}
              onSave={savePreferences}
            />
          ) : (
            <AccountTab />
          )}
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Separator className="mt-6" />
    </div>
  )
}

function ApiKeyTab({
  provider, setProvider, apiKey, setApiKey, showKey, setShowKey,
  hasKey, saving, onSave, onRemove,
}: {
  provider: string
  setProvider: (v: string) => void
  apiKey: string
  setApiKey: (v: string) => void
  showKey: boolean
  setShowKey: (v: boolean) => void
  hasKey: boolean
  saving: boolean
  onSave: () => void
  onRemove: () => void
}) {
  const providers = [
    { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-...", hint: "Supports 100+ models — recommended" },
    { id: "openai", label: "OpenAI", placeholder: "sk-...", hint: "Direct OpenAI API" },
    { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-...", hint: "Direct Anthropic API" },
  ]

  const selected = providers.find((p) => p.id === provider) ?? providers[0]

  return (
    <div className="max-w-2xl space-y-8">
      <SectionHeader
        icon={<HugeiconsIcon icon={Key01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />}
        title="AI Provider & API Key"
        description="Use your own API key. If not set, the system key is used as a fallback."
      />

      {/* Current key status */}
      <div className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm",
        hasKey
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
          : "border-border bg-muted/30 text-muted-foreground"
      )}>
        <HugeiconsIcon
          icon={hasKey ? CheckmarkCircle01Icon : Key01Icon}
          strokeWidth={2}
          className="size-4 shrink-0"
        />
        <span>{hasKey ? "Custom API key is active" : "Using system API key"}</span>
        {hasKey && (
          <button
            type="button"
            className="ml-auto flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
            onClick={onRemove}
            disabled={saving}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
            Remove
          </button>
        )}
      </div>

      {/* Provider picker */}
      <div>
        <label className="mb-2 block text-sm font-medium">Provider</label>
        <div className="grid grid-cols-3 gap-2">
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "rounded-xl border px-4 py-3 text-left text-sm transition-all",
                provider === p.id
                  ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/30"
                  : "border-border text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
              )}
              onClick={() => setProvider(p.id)}
            >
              <div className="font-medium">{p.label}</div>
              <div className="mt-0.5 text-[11px] opacity-70">{p.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* API key input */}
      <div>
        <label className="mb-2 block text-sm font-medium">
          {selected.label} API Key
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              placeholder={hasKey ? "••••••••••••••••" : selected.placeholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowKey(!showKey)}
            >
              <HugeiconsIcon icon={showKey ? EyeOffIcon : EyeIcon} strokeWidth={2} className="size-4" />
            </button>
          </div>
          <Button
            type="button"
            disabled={!apiKey.trim() || saving}
            onClick={onSave}
            className="gap-2"
          >
            <HugeiconsIcon icon={SaveIcon} strokeWidth={2} className="size-4" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Keys are stored in the database and used server-side only. They are never sent to the client.
        </p>
      </div>
    </div>
  )
}

function PreferencesTab({
  aiTone, setAiTone, approvalStrict, setApprovalStrict,
  emailSignature, setEmailSignature, saving, onSave,
}: {
  aiTone: string
  setAiTone: (v: string) => void
  approvalStrict: string
  setApprovalStrict: (v: string) => void
  emailSignature: string
  setEmailSignature: (v: string) => void
  saving: boolean
  onSave: () => void
}) {
  return (
    <div className="max-w-2xl space-y-8">
      <SectionHeader
        icon={<HugeiconsIcon icon={Settings05Icon} strokeWidth={2} className="size-4 text-muted-foreground" />}
        title="Preferences"
        description="Customize how wsai writes and what actions require your approval."
      />

      {/* AI tone */}
      <div>
        <label className="mb-2 block text-sm font-medium">AI Reply Tone</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: "professional", label: "Professional", hint: "Formal, polished" },
            { id: "casual", label: "Casual", hint: "Friendly, relaxed" },
            { id: "concise", label: "Concise", hint: "Short, to the point" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                "rounded-xl border px-4 py-3 text-left text-sm transition-all",
                aiTone === t.id
                  ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/30"
                  : "border-border text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
              )}
              onClick={() => setAiTone(t.id)}
            >
              <div className="font-medium">{t.label}</div>
              <div className="mt-0.5 text-[11px] opacity-70">{t.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Approval strictness */}
      <div>
        <label className="mb-2 block text-sm font-medium">Approval Gate</label>
        <p className="mb-3 text-xs text-muted-foreground">
          When should wsai ask for your approval before performing an action?
        </p>
        <div className="space-y-2">
          {[
            { id: "all", label: "All actions", hint: "Approve everything, including reads" },
            { id: "writes", label: "Write actions only", hint: "Approve send, delete, create — not searches (recommended)" },
            { id: "never", label: "Never", hint: "Let wsai act autonomously — use with care" },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all",
                approvalStrict === s.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border hover:border-muted-foreground/30"
              )}
              onClick={() => setApprovalStrict(s.id)}
            >
              <div className={cn(
                "size-4 rounded-full border-2 transition-colors",
                approvalStrict === s.id ? "border-primary bg-primary" : "border-muted-foreground/40"
              )} />
              <div>
                <div className="font-medium">{s.label}</div>
                <div className="text-[11px] text-muted-foreground">{s.hint}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Email signature */}
      <div>
        <label className="mb-2 block text-sm font-medium">Email Signature</label>
        <textarea
          value={emailSignature}
          onChange={(e) => setEmailSignature(e.target.value)}
          placeholder="Best regards,&#10;Your Name"
          rows={4}
          className="w-full rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 resize-none"
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Appended when wsai drafts outgoing emails for you.
        </p>
      </div>

      <Button type="button" onClick={onSave} disabled={saving} className="gap-2">
        <HugeiconsIcon icon={SaveIcon} strokeWidth={2} className="size-4" />
        {saving ? "Saving…" : "Save preferences"}
      </Button>
    </div>
  )
}

function AccountTab() {
  return (
    <div className="max-w-2xl space-y-8">
      <SectionHeader
        icon={<HugeiconsIcon icon={UserCircle02Icon} strokeWidth={2} className="size-4 text-muted-foreground" />}
        title="Account"
        description="Manage your profile and authentication settings."
      />
      <p className="text-sm text-muted-foreground">
        Profile management is handled through BetterAuth. More controls coming soon.
      </p>
    </div>
  )
}
