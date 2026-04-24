'use client'

import { useState } from 'react'
import { clsx } from 'clsx'

export interface LeadSourceRow {
  slug: string
  display_name: string
  kind: 'listings' | 'enrichment' | 'skip_trace'
  enabled: boolean
  env_key_names: string[] | null
  docs_url: string | null
  notes: string | null
  last_sync_at: string | null
  last_sync_status: 'success' | 'partial' | 'failed' | 'needs_config' | 'never_run' | null
  last_sync_count: number | null
  last_sync_duration_ms: number | null
  last_error: string | null
  total_synced_count: number | null
  total_errors_count: number | null
}

interface Props {
  source: LeadSourceRow
  onToggle: (slug: string, enabled: boolean) => Promise<void>
  onTest: (slug: string) => Promise<TestResult>
}

interface TestResult {
  ok: boolean
  status: 'connected' | 'needs_config' | 'failing'
  message: string
  latencyMs?: number
}

const kindLabels: Record<LeadSourceRow['kind'], string> = {
  listings: 'Listings',
  enrichment: 'Enrichment',
  skip_trace: 'Skip Trace',
}

const kindClasses: Record<LeadSourceRow['kind'], string> = {
  listings: 'bg-cedar-green/10 text-cedar-green border-cedar-green/20',
  enrichment: 'bg-blue-50 text-blue-800 border-blue-200',
  skip_trace: 'bg-purple-50 text-purple-800 border-purple-200',
}

interface StatusDisplay {
  label: string
  className: string
  dot: string
}

function statusDisplay(source: LeadSourceRow): StatusDisplay {
  if (!source.enabled) {
    return { label: 'Disabled', className: 'bg-stone-100 text-stone-600 border-stone-300', dot: 'bg-stone-400' }
  }
  switch (source.last_sync_status) {
    case 'success':
    case 'partial':
      return { label: 'Connected', className: 'bg-emerald-50 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' }
    case 'needs_config':
      return { label: 'Needs Config', className: 'bg-amber-50 text-amber-900 border-amber-300', dot: 'bg-amber-500' }
    case 'failed':
      return { label: 'Failing', className: 'bg-red-50 text-red-800 border-red-300', dot: 'bg-red-500' }
    case 'never_run':
    case null:
    default:
      return { label: 'Never Run', className: 'bg-stone-50 text-stone-700 border-stone-300', dot: 'bg-stone-400' }
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export default function SourceCard({ source, onToggle, onTest }: Props) {
  const [busy, setBusy] = useState<'toggle' | 'test' | null>(null)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [testOk, setTestOk] = useState<boolean | null>(null)
  const status = statusDisplay(source)

  async function handleToggle() {
    setBusy('toggle')
    try {
      await onToggle(source.slug, !source.enabled)
    } finally {
      setBusy(null)
    }
  }

  async function handleTest() {
    setBusy('test')
    setTestMsg(null)
    try {
      const result = await onTest(source.slug)
      setTestOk(result.ok)
      setTestMsg(
        result.ok
          ? `✓ ${result.message}${result.latencyMs ? ` (${result.latencyMs}ms)` : ''}`
          : `✕ ${result.message}`,
      )
    } catch (err) {
      setTestOk(false)
      setTestMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const envKeys = source.env_key_names ?? []

  return (
    <div className="bg-white border border-stone/30 rounded-card p-5 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-semibold text-charcoal truncate">{source.display_name}</h3>
            <span
              className={clsx(
                'inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-md',
                kindClasses[source.kind],
              )}
            >
              {kindLabels[source.kind]}
            </span>
          </div>
          <div className="text-xs text-charcoal/50 mt-0.5 font-mono">{source.slug}</div>
        </div>
        <span
          className={clsx(
            'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded-md flex-shrink-0',
            status.className,
          )}
        >
          <span className={clsx('w-1.5 h-1.5 rounded-full', status.dot)} />
          {status.label}
        </span>
      </div>

      {/* Notes */}
      {source.notes && <p className="text-sm text-charcoal/70 leading-snug">{source.notes}</p>}

      {/* Sync info grid */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-charcoal/50 uppercase tracking-wide">Last Sync</div>
          <div className="text-charcoal font-medium">{relativeTime(source.last_sync_at)}</div>
          {source.last_sync_count !== null && source.last_sync_count > 0 && (
            <div className="text-charcoal/60">{source.last_sync_count} rows</div>
          )}
        </div>
        <div>
          <div className="text-charcoal/50 uppercase tracking-wide">Total Synced</div>
          <div className="text-charcoal font-medium">{source.total_synced_count ?? 0}</div>
        </div>
        <div>
          <div className="text-charcoal/50 uppercase tracking-wide">Errors</div>
          <div className={clsx('font-medium', (source.total_errors_count ?? 0) > 0 ? 'text-red-700' : 'text-charcoal')}>
            {source.total_errors_count ?? 0}
          </div>
        </div>
      </div>

      {/* Error message */}
      {source.last_error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-900">
          {source.last_error}
        </div>
      )}

      {/* Required env keys */}
      {envKeys.length > 0 && (
        <div className="text-xs">
          <div className="text-charcoal/50 uppercase tracking-wide mb-1">Required env</div>
          <div className="flex flex-wrap gap-1">
            {envKeys.map(k => (
              <code key={k} className="bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded font-mono text-[11px]">
                {k}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* Test result */}
      {testMsg && (
        <div
          className={clsx(
            'text-xs p-2 rounded-md border',
            testOk
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-900 border-red-200',
          )}
        >
          {testMsg}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone/20">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={source.enabled}
            disabled={busy !== null}
            onChange={handleToggle}
            className="w-4 h-4 accent-cedar-green cursor-pointer"
          />
          <span className="text-charcoal">Enabled</span>
        </label>
        <div className="flex items-center gap-2">
          {source.docs_url && (
            <a
              href={source.docs_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-cedar-green hover:underline"
            >
              Docs →
            </a>
          )}
          <button
            type="button"
            onClick={handleTest}
            disabled={busy !== null}
            className={clsx(
              'text-xs font-medium px-3 py-1.5 rounded-md border transition-colors',
              busy === 'test'
                ? 'bg-stone-100 text-stone-500 border-stone-300'
                : 'bg-white text-cedar-green border-cedar-green/30 hover:bg-cedar-green/5',
            )}
          >
            {busy === 'test' ? 'Testing…' : 'Test Connection'}
          </button>
        </div>
      </div>
    </div>
  )
}
