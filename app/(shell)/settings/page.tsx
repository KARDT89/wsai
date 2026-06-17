"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  Database01Icon,
  EyeIcon,
  EyeOffIcon,
  Key01Icon,
  Logout01Icon,
  Mail01Icon,
  SaveIcon,
  Settings05Icon,
  Shield01Icon,
  UserCircle02Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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

type AccountOverview = {
  user: {
    id: string
    name: string
    email: string
    emailVerified: boolean
    image: string | null
    createdAt: string
    updatedAt: string
  }
  authAccounts: Array<{
    id: string
    providerId: string
    accountId: string
    scope: string | null
    createdAt: string
    updatedAt: string
  }>
  sessions: Array<{
    id: string
    createdAt: string
    updatedAt: string
    expiresAt: string
    ipAddress: string | null
    userAgent: string | null
    current: boolean
  }>
  integrations: Array<{
    id: string
    plugin: string
    connected: boolean
    createdAt: string
    updatedAt: string
    cachedEntities: number
  }>
  security: {
    pendingApprovals: number
    sessionCount: number
    authMethodCount: number
    integrationCount: number
  }
}

export default function SettingsPage() {
  const [tab, setTab] = React.useState<Tab>("account")
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

  const loadSettings = React.useCallback(async () => {
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
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSettings()
  }, [loadSettings])

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
  const [overview, setOverview] = React.useState<AccountOverview | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [name, setName] = React.useState("")
  const [image, setImage] = React.useState("")
  const [deleteConfirm, setDeleteConfirm] = React.useState("")

  const loadAccount = React.useCallback(async () => {
    try {
      const response = await fetch("/api/account")
      if (!response.ok) {
        throw new Error(await getAccountError(response, "Unable to load account"))
      }
      const data = (await response.json()) as AccountOverview
      setOverview(data)
      setName(data.user.name)
      setImage(data.user.image ?? "")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load account")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccount()
  }, [loadAccount])

  async function saveProfile() {
    setSaving(true)
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, image: image || null }),
      })
      if (!response.ok) {
        throw new Error(await getAccountError(response, "Unable to save profile"))
      }
      const data = (await response.json()) as { user: AccountOverview["user"] }
      setOverview((current) => (current ? { ...current, user: data.user } : current))
      toast.success("Profile updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save profile")
    } finally {
      setSaving(false)
    }
  }

  async function revokeSession(sessionId: string, current: boolean) {
    try {
      const response = await fetch(`/api/account/sessions/${sessionId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        throw new Error(await getAccountError(response, "Unable to revoke session"))
      }

      if (current) {
        window.location.assign("/login")
        return
      }

      setOverview((value) =>
        value
          ? {
              ...value,
              sessions: value.sessions.filter((session) => session.id !== sessionId),
              security: {
                ...value.security,
                sessionCount: Math.max(0, value.security.sessionCount - 1),
              },
            }
          : value
      )
      toast.success("Session revoked")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to revoke session")
    }
  }

  async function deleteAccount() {
    setDeleting(true)
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmEmail: deleteConfirm }),
      })
      if (!response.ok) {
        throw new Error(await getAccountError(response, "Unable to delete account"))
      }
      toast.success("Account deleted")
      window.location.assign("/login")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete account")
    } finally {
      setDeleting(false)
    }
  }

  const canSaveProfile =
    overview !== null &&
    (name.trim() !== overview.user.name || image.trim() !== (overview.user.image ?? ""))
  const canDelete = deleteConfirm.trim().toLowerCase() === overview?.user.email.toLowerCase()

  return (
    <div className="max-w-4xl space-y-8">
      <SectionHeader
        icon={<HugeiconsIcon icon={UserCircle02Icon} strokeWidth={2} className="size-4 text-muted-foreground" />}
        title="Account"
        description="Manage your profile, login methods, active sessions, connected data, and account lifecycle."
      />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="size-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          Loading account…
        </div>
      ) : overview ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <AccountMetric label="Auth methods" value={overview.security.authMethodCount} />
            <AccountMetric label="Sessions" value={overview.security.sessionCount} />
            <AccountMetric label="Integrations" value={overview.security.integrationCount} />
            <AccountMetric label="Pending approvals" value={overview.security.pendingApprovals} />
          </div>

          <SettingsPanel
            icon={UserCircle02Icon}
            title="Profile"
            description="This name and avatar are used throughout your workspace."
          >
            <div className="grid gap-4 sm:grid-cols-[72px_1fr]">
              <div className="flex size-16 items-center justify-center overflow-hidden rounded-md border bg-muted text-lg font-semibold">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt={name} className="size-full object-cover" />
                ) : (
                  getInitials(name || overview.user.email)
                )}
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor="account-name">
                    Display name
                  </label>
                  <Input
                    id="account-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor="account-avatar">
                    Avatar URL
                  </label>
                  <Input
                    id="account-avatar"
                    value={image}
                    onChange={(event) => setImage(event.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    Joined {formatDate(overview.user.createdAt)}
                  </div>
                  <Button
                    type="button"
                    className="gap-2"
                    disabled={!canSaveProfile || saving}
                    onClick={saveProfile}
                  >
                    <HugeiconsIcon icon={SaveIcon} strokeWidth={2} className="size-4" />
                    {saving ? "Saving…" : "Save profile"}
                  </Button>
                </div>
              </div>
            </div>
          </SettingsPanel>

          <SettingsPanel
            icon={Mail01Icon}
            title="Email and login"
            description="Your primary identity and the sign-in providers attached to it."
          >
            <div className="mb-4 flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium">{overview.user.email}</div>
                <div className="text-xs text-muted-foreground">Primary email</div>
              </div>
              <Badge variant={overview.user.emailVerified ? "default" : "outline"}>
                {overview.user.emailVerified ? "Verified" : "Unverified"}
              </Badge>
            </div>
            <div className="divide-y rounded-md border">
              {overview.authAccounts.length > 0 ? (
                overview.authAccounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div>
                      <div className="text-sm font-medium">
                        {formatProviderName(account.providerId)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Added {formatDate(account.createdAt)}
                      </div>
                    </div>
                    <Badge variant="outline">{account.scope ? "Scoped" : "Connected"}</Badge>
                  </div>
                ))
              ) : (
                <div className="px-3 py-2.5 text-sm text-muted-foreground">
                  No linked auth providers found.
                </div>
              )}
            </div>
          </SettingsPanel>

          <SettingsPanel
            icon={Database01Icon}
            title="Connected data"
            description="Corsair-backed integrations and cached entity counts for this workspace."
          >
            <div className="divide-y rounded-md border">
              {overview.integrations.length > 0 ? (
                overview.integrations.map((integration) => (
                  <div key={integration.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div>
                      <div className="text-sm font-medium">
                        {formatIntegrationName(integration.plugin)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {integration.cachedEntities} cached entities · Updated {formatDate(integration.updatedAt)}
                      </div>
                    </div>
                    <Badge variant={integration.connected ? "default" : "outline"}>
                      {integration.connected ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="px-3 py-2.5 text-sm text-muted-foreground">
                  No integrations connected yet.
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => {
                window.location.assign("/integrations")
              }}
            >
              Manage integrations
            </Button>
          </SettingsPanel>

          <SettingsPanel
            icon={Shield01Icon}
            title="Active sessions"
            description="Review where your account is signed in and revoke sessions you no longer recognize."
          >
            <div className="divide-y rounded-md border">
              {overview.sessions.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {formatUserAgent(item.userAgent)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.ipAddress ?? "Unknown IP"} · Last active {formatDate(item.updatedAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.current ? <Badge>Current</Badge> : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => revokeSession(item.id, item.current)}
                    >
                      <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} className="size-3.5" />
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </SettingsPanel>

          <SettingsPanel
            icon={Delete02Icon}
            title="Delete account"
            description="Permanently remove your user, sessions, settings, Corsair accounts, cached entities, approvals, and agent history."
            danger
          >
            <div className="grid gap-3">
              <div className="text-sm text-muted-foreground">
                Type <span className="font-mono text-foreground">{overview.user.email}</span> to confirm deletion.
              </div>
              <Input
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                placeholder={overview.user.email}
              />
              <div>
                <Button
                  type="button"
                  variant="destructive"
                  className="gap-2"
                  disabled={!canDelete || deleting}
                  onClick={deleteAccount}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
                  {deleting ? "Deleting…" : "Delete account"}
                </Button>
              </div>
            </div>
          </SettingsPanel>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Account details could not be loaded.</p>
      )}
    </div>
  )
}

function SettingsPanel({
  icon,
  title,
  description,
  danger,
  children,
}: {
  icon: typeof UserCircle02Icon
  title: string
  description: string
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "rounded-md border p-4",
        danger && "border-destructive/40 bg-destructive/5"
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md border bg-background",
            danger && "border-destructive/30 text-destructive"
          )}
        >
          <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function AccountMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

async function getAccountError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string
  } | null

  return payload?.error ?? fallback
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function formatDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "Unknown"

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function formatProviderName(provider: string) {
  if (provider === "google") return "Google"
  if (provider === "github") return "GitHub"
  if (provider === "credential" || provider === "email-password") return "Email and password"
  return provider
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ")
}

function formatIntegrationName(plugin: string) {
  if (plugin === "gmail") return "Gmail"
  if (plugin === "googlecalendar") return "Google Calendar"
  return formatProviderName(plugin)
}

function formatUserAgent(value: string | null) {
  if (!value) return "Unknown device"
  if (value.includes("Chrome")) return "Chrome browser"
  if (value.includes("Firefox")) return "Firefox browser"
  if (value.includes("Safari")) return "Safari browser"
  return value.slice(0, 72)
}
