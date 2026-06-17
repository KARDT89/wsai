"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  Delete02Icon,
  RefreshIcon,
  Shield01Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Approval = {
  id: string
  plugin: string
  operation: string
  description: string
  inputJson: Record<string, unknown>
  status: "pending" | "approved" | "rejected" | "failed"
  error?: string | null
  decidedAt: string | null
  createdAt: string
}

type Filter = "pending" | "all"

export default function ApprovalsPage() {
  const [approvals, setApprovals] = React.useState<Approval[]>([])
  const [pendingCount, setPendingCount] = React.useState(0)
  const [filter, setFilter] = React.useState<Filter>("pending")
  const [loading, setLoading] = React.useState(true)
  const [acting, setActing] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const url = filter === "pending" ? "/api/approvals?status=pending" : "/api/approvals"
      const res = await fetch(url)
      const data = (await res.json()) as { approvals: Approval[]; pendingCount: number }
      setApprovals(data.approvals ?? [])
      setPendingCount(data.pendingCount ?? 0)
    } catch {
      toast.error("Failed to load approvals")
    } finally {
      setLoading(false)
    }
  }, [filter])

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load()
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [load])

  React.useEffect(() => {
    if (pendingCount === 0) return

    const interval = window.setInterval(() => {
      void load()
    }, 5_000)

    return () => window.clearInterval(interval)
  }, [load, pendingCount])

  async function decide(id: string, action: "approve" | "reject") {
    setActing(id)
    try {
      const res = await fetch(`/api/approvals/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = (await res.json()) as { approval?: Approval; error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "Failed")
      }
      toast.success(
        action === "approve"
          ? "Action approved. Refreshing the related cache."
          : "Action rejected"
      )
      setApprovals((prev) =>
        prev.map((a) =>
          a.id === id
            ? data.approval ?? {
                ...a,
                status: action === "approve" ? "approved" : "rejected",
                decidedAt: new Date().toISOString(),
              }
            : a
        )
      )
      if (action === "approve" || action === "reject") {
        setPendingCount((c) => Math.max(0, c - 1))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setActing(null)
    }
  }

  async function deleteApproval(id: string) {
    try {
      await fetch(`/api/approvals/${encodeURIComponent(id)}`, { method: "DELETE" })
      setApprovals((prev) => prev.filter((a) => a.id !== id))
    } catch {
      toast.error("Failed to delete")
    }
  }

  const pluginLabel: Record<string, string> = {
    gmail: "Gmail",
    googlecalendar: "Google Calendar",
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3">
          <HugeiconsIcon icon={Shield01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Approvals</h1>
          {pendingCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
              {pendingCount} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            {(["pending", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={cn(
                  "rounded-md px-3 py-1 text-xs transition-colors",
                  filter === f
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setFilter(f)}
              >
                {f === "pending" ? "Pending" : "All"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon-sm" onClick={() => void load()} disabled={loading}>
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className={cn("size-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : approvals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted">
              <HugeiconsIcon icon={Shield01Icon} strokeWidth={1.5} className="size-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No pending approvals</p>
            <p className="mt-1.5 max-w-sm text-xs text-muted-foreground">
              When wsai proposes a write action (sending email, creating events), it will appear here for your review.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            {approvals.map((a) => (
              <ApprovalCard
                key={a.id}
                approval={a}
                acting={acting === a.id}
                pluginLabel={pluginLabel}
                onApprove={() => void decide(a.id, "approve")}
                onReject={() => void decide(a.id, "reject")}
                onDelete={() => void deleteApproval(a.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ApprovalCard({
  approval,
  acting,
  pluginLabel,
  onApprove,
  onReject,
  onDelete,
}: {
  approval: Approval
  acting: boolean
  pluginLabel: Record<string, string>
  onApprove: () => void
  onReject: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = React.useState(false)

  const statusColors: Record<Approval["status"], string> = {
    pending: "border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20",
    approved: "border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/20",
    rejected: "border-border bg-muted/20",
    failed: "border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/20",
  }

  const statusBadge: Record<Approval["status"], string> = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    rejected: "bg-muted text-muted-foreground",
    failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  }

  return (
    <div className={cn("rounded-2xl border p-5 transition-all", statusColors[approval.status])}>
      <div className="flex items-start gap-4">
        <div className="mt-0.5">
          {approval.status === "pending" ? (
            <div className="flex size-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
              <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
          ) : approval.status === "approved" ? (
            <div className="flex size-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
              <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={2} className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          ) : (
            <div className="flex size-8 items-center justify-center rounded-full bg-muted">
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", statusBadge[approval.status])}>
              {approval.status}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {pluginLabel[approval.plugin] ?? approval.plugin} · {approval.operation}
            </span>
          </div>

          <p className="mt-2 text-sm font-medium">{approval.description}</p>

          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{new Date(approval.createdAt).toLocaleString()}</span>
            {approval.decidedAt && (
              <>
                <span>·</span>
                <span>Decided {new Date(approval.decidedAt).toLocaleString()}</span>
              </>
            )}
          </div>

          {/* Expandable payload */}
          <button
            type="button"
            className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide" : "Show"} payload
          </button>

          {expanded && (
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-background/60 p-3 text-[11px] text-muted-foreground ring-1 ring-border/50">
              {JSON.stringify(approval.inputJson, null, 2)}
            </pre>
          )}

          {approval.status === "failed" && approval.error ? (
            <p className="mt-2 rounded-md bg-background/70 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200 dark:text-red-300 dark:ring-red-900/60">
              {approval.error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {approval.status !== "pending" && (
            <button
              type="button"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={onDelete}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
            </button>
          )}
        </div>
      </div>

      {approval.status === "pending" && (
        <div className="mt-4 flex gap-2 border-t border-amber-200/50 pt-4 dark:border-amber-800/30">
          <Button
            size="sm"
            disabled={acting}
            onClick={onApprove}
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={2} className="size-3.5" />
            {acting ? "Running…" : "Approve & run"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={acting}
            onClick={onReject}
            className="gap-1.5"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
            Reject
          </Button>
        </div>
      )}
    </div>
  )
}
