'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import SourceCard, { type LeadSourceRow } from '@/components/dashboard/SourceCard'

type KindFilter = 'all' | 'listings' | 'enrichment' | 'skip_trace'

export default function SourcesPage() {
  const [sources, setSources] = useState<LeadSourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<KindFilter>('all')

  const loadSources = useCallback(async () => {
    const { data, error } = await supabase
      .from('lead_sources')
      .select('*')
      .order('kind', { ascending: true })
      .order('display_name', { ascending: true })

    if (error) {
      console.error('[sources] load failed:', error)
      setLoading(false)
      return
    }
    setSources((data ?? []) as LeadSourceRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSources()

    // Realtime updates: health state changes flow in without polling
    const channel = supabase
      .channel('sources-monitor')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lead_sources' },
        () => { loadSources() },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lead_source_syncs' },
        () => { loadSources() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadSources])

  async function handleToggle(slug: string, enabled: boolean) {
    const res = await fetch(`/api/sources/${slug}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    if (!res.ok) {
      console.error(`toggle failed for ${slug}:`, await res.text())
    }
    // Realtime subscription will refresh the row
  }

  async function handleTest(slug: string) {
    const res = await fetch(`/api/sources/${slug}/test`, { method: 'POST' })
    return res.json()
  }

  const filtered = filter === 'all'
    ? sources
    : sources.filter(s => s.kind === filter)

  const counts = {
    all: sources.length,
    listings: sources.filter(s => s.kind === 'listings').length,
    enrichment: sources.filter(s => s.kind === 'enrichment').length,
    skip_trace: sources.filter(s => s.kind === 'skip_trace').length,
  }

  const healthRollup = {
    connected: sources.filter(s => s.enabled && (s.last_sync_status === 'success' || s.last_sync_status === 'partial')).length,
    needsConfig: sources.filter(s => s.last_sync_status === 'needs_config').length,
    failing: sources.filter(s => s.last_sync_status === 'failed').length,
    disabled: sources.filter(s => !s.enabled).length,
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-cedar-green">Lead Sources</h1>
          <p className="text-charcoal/60 text-sm mt-0.5">
            Monitor and configure every data source feeding the pipeline.
          </p>
        </div>

        {/* Health rollup chips */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {healthRollup.connected} connected
          </span>
          {healthRollup.needsConfig > 0 && (
            <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-1 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {healthRollup.needsConfig} needs config
            </span>
          )}
          {healthRollup.failing > 0 && (
            <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-800 border border-red-200 px-2 py-1 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              {healthRollup.failing} failing
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 bg-stone-100 text-stone-600 border border-stone-300 px-2 py-1 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
            {healthRollup.disabled} disabled
          </span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 border-b border-stone/30">
        {(['all', 'listings', 'enrichment', 'skip_trace'] as const).map(k => {
          const label = k === 'all' ? 'All' : k === 'skip_trace' ? 'Skip Trace' : k.charAt(0).toUpperCase() + k.slice(1)
          const isActive = filter === k
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={
                isActive
                  ? 'px-4 py-2 text-sm font-medium text-cedar-green border-b-2 border-cedar-green -mb-px'
                  : 'px-4 py-2 text-sm text-charcoal/60 hover:text-charcoal border-b-2 border-transparent -mb-px'
              }
            >
              {label}
              <span className="ml-1.5 text-xs opacity-60">{counts[k]}</span>
            </button>
          )
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-12 text-charcoal/50">Loading sources…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-charcoal/50">No sources in this category.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(s => (
            <SourceCard
              key={s.slug}
              source={s}
              onToggle={handleToggle}
              onTest={handleTest}
            />
          ))}
        </div>
      )}

      {/* Footnote */}
      <div className="text-xs text-charcoal/50 pt-4 border-t border-stone/20">
        API keys are configured in Vercel env vars, not here. Rotate keys via{' '}
        <a
          href="https://vercel.com/autod3vs-projects/cedar-capital/settings/environment-variables"
          target="_blank"
          rel="noreferrer"
          className="text-cedar-green hover:underline"
        >
          Vercel dashboard
        </a>
        .
      </div>
    </div>
  )
}
