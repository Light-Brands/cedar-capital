'use client'

/**
 * /dashboard/hot-leads
 *
 * Surfaces the `hot_leads` SQL view (built by scripts/build-hot-leads-view.sql).
 * Sortable by hot_score, deal_score_numeric, equity, ARV — whatever signal
 * the user wants to drive prioritization on a given day.
 *
 * The view computes hot_score per query, so every page load gets fresh data
 * without a refresh job. Trade-off: page is slow if the view's underlying
 * data is huge — at Cedar's current 8,705 Austin properties this is sub-200ms.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase/client'
import LeadPlayBadges from '@/components/dashboard/LeadPlayBadges'
import ScoreBadge from '@/components/dashboard/ScoreBadge'
import type { DealBadge } from '@/lib/analysis/badge'
import { useLocalStorage } from '@/lib/use-local-storage'

type HotLead = {
  id: string
  address: string
  zip_code: string | null
  beds: number | null
  baths: number | null
  sqft: number | null
  asking_price: number | null
  attom_avm_value: number | null
  arv_mid: number | null
  arv_confidence: 'high' | 'medium' | 'low' | null
  attom_ltv: number | null
  attom_lendable_equity: number | null
  attom_condition: string | null
  attom_absentee_ind: string | null
  description_categories: string[] | null
  distress_signal: string | null
  hot_score: number | null
  deal_score_numeric: number | null
  badge: DealBadge | null
  attom_last_synced_at: string | null
  // Migration 008 enrichments surfaced in view
  attom_owner_name: string | null
  attom_mortgage_lender: string | null
  attom_rental_avm: number | null
  gross_cap_rate_pct: number | null
  attom_permit_count: number | null
  years_since_permit: number | null
  mortgage_age_years: number | null
}

/**
 * Sortable columns. The string literal is the underlying SQL column name
 * (or a derived view column) so it can be passed straight to .order().
 *
 * Default is `hot_score DESC` — Motivation gated by deal economics is the
 * operator's most useful default per the multiplier in the SQL view.
 * Profitability acts as a secondary sort within Motivation ties.
 */
type SortKey =
  | 'hot_score'
  | 'deal_score_numeric'
  | 'address'
  | 'asking_price'
  | 'arv_mid'
  | 'attom_avm_value'
  | 'attom_ltv'
  | 'attom_lendable_equity'
  | 'gross_cap_rate_pct'
  | 'attom_permit_count'
  | 'mortgage_age_years'
  | 'years_since_permit'

type SortDir = 'asc' | 'desc'

const CATEGORY_TONE: Record<string, string> = {
  auction:    'bg-red-50 text-red-800 border-red-300',
  multi_unit: 'bg-amber-50 text-amber-800 border-amber-300',
  distressed: 'bg-orange-50 text-orange-800 border-orange-300',
  tax_sale:   'bg-red-50 text-red-800 border-red-300',
  probate:    'bg-purple-50 text-purple-800 border-purple-300',
  land:       'bg-emerald-50 text-emerald-800 border-emerald-300',
  mobile:     'bg-stone-100 text-stone-700 border-stone-300',
}

function fmtUSD(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function HotLeadsPage() {
  const [leads, setLeads] = useState<HotLead[]>([])
  const [loading, setLoading] = useState(true)
  // Sort state persists across page loads so the operator's preference sticks
  const [sortKey, setSortKey] = useLocalStorage<SortKey>('hotLeads.sortKey', 'hot_score')
  const [sortDir, setSortDir] = useLocalStorage<SortDir>('hotLeads.sortDir', 'desc')
  const [filter, setFilter] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)

  // Click a column header to sort. Same column toggles direction; new column
  // resets to DESC (most useful default for numeric columns; address gets ASC).
  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir(key === 'address' ? 'asc' : 'desc')
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      let query = supabase
        .from('hot_leads')
        .select('*')
        .order(sortKey, { ascending: sortDir === 'asc', nullsFirst: false })
      // Tie-breaker: when sorting by Motivation, fall through to Profitability
      // so the more profitable lead floats up within the same motivation tier.
      if (sortKey === 'hot_score') {
        query = query.order('deal_score_numeric', { ascending: false, nullsFirst: false })
      }
      const { data, error: err } = await query.limit(200)
      if (err) setError(err.message)
      else setLeads((data ?? []) as HotLead[])
      setLoading(false)
    }
    load()
  }, [sortKey, sortDir])

  const filtered = useMemo(() => {
    if (filter === 'all') return leads
    return leads.filter((l) => l.description_categories?.includes(filter))
  }, [leads, filter])

  const stats = useMemo(() => {
    const total = filtered.length
    const distressed = filtered.filter((l) => l.description_categories?.includes('distressed')).length
    const multiUnit = filtered.filter((l) => l.description_categories?.includes('multi_unit')).length
    const highEquity = filtered.filter((l) => (l.attom_ltv ?? 100) <= 30).length
    return { total, distressed, multiUnit, highEquity }
  }, [filtered])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-cedar-green">Hot Leads</h1>
        <p className="text-charcoal/60 mt-1 text-sm max-w-3xl">
          Two scores per row.{' '}
          <strong className="text-cedar-green">Seller Motivation</strong> (0-100) measures
          how likely the owner is to deal — REO ownership, free-and-clear or high equity,
          absenteeism, distress flags, multi-unit, deferred permits.{' '}
          <strong className="text-cedar-green">Profitability</strong> (0-100) measures whether
          the deal math works at the asking price — ROI, wholesale spread, ARV vs asking,
          comp confidence. Hot leads have both.
        </p>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Hot leads" value={stats.total.toString()} />
        <Stat label="Distressed" value={stats.distressed.toString()} tone="orange" />
        <Stat label="Multi-unit" value={stats.multiUnit.toString()} tone="amber" />
        <Stat label="High equity (≤30% LTV)" value={stats.highEquity.toString()} tone="emerald" />
      </div>

      {/* Controls — filters + active-sort indicator */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-charcoal/60">Filter</span>
          {['all', 'distressed', 'multi_unit', 'mobile', 'land'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'px-2 py-1 rounded-lg border text-xs uppercase tracking-wide',
                filter === f
                  ? 'bg-cedar-green text-cream border-cedar-green'
                  : 'bg-white text-charcoal/70 border-stone/30 hover:bg-sand/40',
              )}
            >
              {f === 'all' ? 'all' : f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-charcoal/50">
          <span>Sorted by</span>
          <span className="font-medium text-charcoal">
            {SORT_LABELS[sortKey]} {sortDir === 'desc' ? '↓' : '↑'}
          </span>
          {(sortKey !== 'hot_score' || sortDir !== 'desc') && (
            <button
              onClick={() => { setSortKey('hot_score'); setSortDir('desc') }}
              className="text-cedar-green hover:underline"
            >
              reset to Motivation ↓
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-300 text-red-800 rounded-card p-3 text-sm">{error}</div>}
      {loading && <div className="text-charcoal/50 text-center py-12">Loading hot leads…</div>}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="bg-white border border-stone/30 rounded-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sand/30">
              <tr>
                <SortableTh sortKey="hot_score" active={sortKey} dir={sortDir} onSort={handleSort}
                  title="Seller Motivation 0-100. How likely is the owner to deal? Click to sort.">
                  Motivation
                </SortableTh>
                <SortableTh sortKey="address" active={sortKey} dir={sortDir} onSort={handleSort}>
                  Address
                </SortableTh>
                <Th>Beds/Baths/Sqft</Th>
                <SortableTh sortKey="asking_price" active={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  Asking
                </SortableTh>
                <SortableTh sortKey="arv_mid" active={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  ARV mid
                </SortableTh>
                <SortableTh sortKey="attom_avm_value" active={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  AVM
                </SortableTh>
                <SortableTh sortKey="attom_ltv" active={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  LTV
                </SortableTh>
                <SortableTh sortKey="attom_lendable_equity" active={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  Equity
                </SortableTh>
                <Th>Cond</Th>
                <Th align="right">Rent</Th>
                <SortableTh sortKey="gross_cap_rate_pct" active={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  Cap%
                </SortableTh>
                <SortableTh sortKey="attom_permit_count" active={sortKey} dir={sortDir} onSort={handleSort} align="right"
                  title="Permit count. 0 or null = deferred maintenance signal.">
                  Perms
                </SortableTh>
                <Th>Tags</Th>
                <SortableTh sortKey="deal_score_numeric" active={sortKey} dir={sortDir} onSort={handleSort} align="right"
                  title="Profitability 0-100. Does the deal math work? Click to sort.">
                  Profitability
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-t border-stone/15 hover:bg-cream/40">
                  <td className="px-3 py-2">
                    <span className={clsx(
                      'inline-block px-2 py-0.5 rounded font-bold text-xs',
                      (l.hot_score ?? 0) >= 70 ? 'bg-red-100 text-red-800' :
                      (l.hot_score ?? 0) >= 50 ? 'bg-orange-100 text-orange-800' :
                      (l.hot_score ?? 0) >= 30 ? 'bg-amber-100 text-amber-800' :
                      'bg-stone-100 text-stone-600',
                    )}>
                      {l.hot_score ?? 0}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/properties/${l.id}`} className="text-cedar-green hover:underline font-medium">
                      {l.address}
                    </Link>
                    <div className="text-[10px] text-charcoal/50">{l.zip_code}</div>
                  </td>
                  <td className="px-3 py-2 text-charcoal/70 text-xs whitespace-nowrap">
                    {l.beds ?? '—'} / {l.baths ?? '—'} / {l.sqft?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right">{fmtUSD(l.asking_price)}</td>
                  <td className="px-3 py-2 text-right">
                    {fmtUSD(l.arv_mid)}
                    {l.arv_confidence && (
                      <span className="ml-1 text-[10px] text-charcoal/50 uppercase">{l.arv_confidence[0]}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{fmtUSD(l.attom_avm_value)}</td>
                  <td className={clsx(
                    'px-3 py-2 text-right',
                    l.attom_ltv === null ? 'text-charcoal/40' :
                    l.attom_ltv === 0 ? 'text-emerald-700 font-semibold' :
                    l.attom_ltv <= 30 ? 'text-emerald-700' :
                    l.attom_ltv <= 60 ? 'text-amber-700' :
                    'text-red-700',
                  )}>
                    {l.attom_ltv === null ? '—' : `${l.attom_ltv}%`}
                  </td>
                  <td className="px-3 py-2 text-right">{fmtUSD(l.attom_lendable_equity)}</td>
                  <td className="px-3 py-2 text-xs text-charcoal/60">{l.attom_condition ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-xs">
                    {l.attom_rental_avm ? `${fmtUSD(l.attom_rental_avm)}/mo` : '—'}
                  </td>
                  <td className={clsx(
                    'px-3 py-2 text-right text-xs',
                    l.gross_cap_rate_pct === null ? 'text-charcoal/40' :
                    l.gross_cap_rate_pct >= 7 ? 'text-emerald-700 font-semibold' :
                    l.gross_cap_rate_pct >= 5 ? 'text-amber-700' :
                    'text-charcoal/60',
                  )}>
                    {l.gross_cap_rate_pct !== null ? `${l.gross_cap_rate_pct}%` : '—'}
                  </td>
                  <td className={clsx(
                    'px-3 py-2 text-right text-xs',
                    l.attom_permit_count === 0 ? 'text-orange-700 font-semibold' :
                    l.years_since_permit !== null && l.years_since_permit >= 20 ? 'text-orange-700' :
                    'text-charcoal/60',
                  )} title={l.years_since_permit !== null ? `last permit ${l.years_since_permit}y ago` : 'no permit data'}>
                    {l.attom_permit_count ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <LeadPlayBadges property={l as Parameters<typeof LeadPlayBadges>[0]['property']} max={3} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <ScoreBadge badge={l.badge} score={l.deal_score_numeric} size="sm" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-charcoal/50 text-center py-12">
          No hot leads matching the current filter. Try widening the criteria.
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone = 'green' }: { label: string; value: string; tone?: 'green' | 'orange' | 'amber' | 'emerald' }) {
  const toneClass =
    tone === 'orange' ? 'bg-orange-50 border-orange-200 text-orange-800' :
    tone === 'amber'  ? 'bg-amber-50 border-amber-200 text-amber-800' :
    tone === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
    'bg-cedar-green/5 border-cedar-green/20 text-cedar-green'
  return (
    <div className={clsx('rounded-card border p-3', toneClass)}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
    </div>
  )
}

/** Human-readable labels for the sort indicator strip + reset button */
const SORT_LABELS: Record<SortKey, string> = {
  hot_score: 'Motivation',
  deal_score_numeric: 'Profitability',
  address: 'Address',
  asking_price: 'Asking',
  arv_mid: 'ARV mid',
  attom_avm_value: 'AVM',
  attom_ltv: 'LTV',
  attom_lendable_equity: 'Equity',
  gross_cap_rate_pct: 'Cap rate',
  attom_permit_count: 'Permits',
  mortgage_age_years: 'Mortgage age',
  years_since_permit: 'Years since permit',
}

function SortableTh({
  children,
  sortKey,
  active,
  dir,
  onSort,
  align = 'left',
  title,
}: {
  children: React.ReactNode
  sortKey: SortKey
  active: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
  title?: string
}) {
  const isActive = active === sortKey
  const arrow = isActive ? (dir === 'desc' ? '↓' : '↑') : ''
  return (
    <th
      title={title ?? `Click to sort by ${SORT_LABELS[sortKey]}`}
      onClick={() => onSort(sortKey)}
      className={clsx(
        'px-3 py-2 font-medium text-xs uppercase tracking-wide cursor-pointer select-none transition-colors hover:bg-sand/60',
        align === 'right' ? 'text-right' : 'text-left',
        isActive ? 'text-cedar-green bg-sand/40' : 'text-charcoal/60',
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={clsx('text-xs', isActive ? 'opacity-100' : 'opacity-30')}>
          {arrow || '↕'}
        </span>
      </span>
    </th>
  )
}

function Th({ children, align = 'left', title }: { children: React.ReactNode; align?: 'left' | 'right'; title?: string }) {
  return (
    <th title={title} className={clsx(
      'px-3 py-2 font-medium text-charcoal/60 text-xs uppercase tracking-wide',
      align === 'right' ? 'text-right' : 'text-left',
    )}>
      {children}
    </th>
  )
}
