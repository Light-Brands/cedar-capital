'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase/client'
import { normalizeRelations } from '@/lib/supabase/normalize'
import { classifyUnitType, isParcelMismatchLikely } from '@/lib/analysis/property-classifier'
import { classifyOwner, type OwnerType } from '@/lib/analysis/owner-classifier'
import { useLocalStorage } from '@/lib/use-local-storage'
import PropertyTable, {
  type FullPropertyRow,
  type EnrichmentResult,
} from '@/components/dashboard/PropertyTable'
import RefreshButton from '@/components/dashboard/RefreshButton'

type BadgeFilter = '' | 'Perfect Fit' | 'Strong Match' | 'Could Work' | 'Needs a Reason' | 'Pass'
type ReviewFilter = '' | 'New' | 'Reviewed' | 'Contacted' | 'Dead'
type UnitFilter = '' | 'SFR' | 'Condo' | 'Townhouse' | 'Duplex' | 'Multi' | 'Land'
type OwnerFilter = '' | OwnerType

interface Filters {
  badge: BadgeFilter
  review: ReviewFilter
  zip: string
  listType: string
  source: string
  fsboOnly: boolean
  unitType: UnitFilter
  hideMismatch: boolean
  ownerType: OwnerFilter
  absenteeOnly: boolean
  hasDistress: boolean
}

const EMPTY_FILTERS: Filters = {
  badge: '', review: '', zip: '', listType: '', source: '',
  fsboOnly: false, unitType: '', hideMismatch: false,
  ownerType: '', absenteeOnly: false, hasDistress: false,
}

/**
 * Preset filter combos — the one-click "Hot Deals" is the default Kelly
 * should reach for. Others give quick cuts for different campaigns.
 */
const PRESETS: Array<{ key: string; label: string; icon: string; desc: string; filters: Partial<Filters> }> = [
  {
    key: 'hot',
    label: 'Hot Deals',
    icon: '🔥',
    desc: 'Could Work+, individual owner, absentee, SFR, clean match',
    filters: { badge: 'Could Work', ownerType: 'Individual', absenteeOnly: true, unitType: 'SFR', hideMismatch: true },
  },
  {
    key: 'perfect',
    label: 'Perfect Fit',
    icon: '⭐',
    desc: 'Only the highest-scoring deals in the feed',
    filters: { badge: 'Perfect Fit' },
  },
  {
    key: 'strong',
    label: 'Strong Match',
    icon: '💎',
    desc: 'Score 75-89 — worth a call this week',
    filters: { badge: 'Strong Match' },
  },
  {
    key: 'distress',
    label: 'Distressed',
    icon: '⚠',
    desc: 'Pre-foreclosure, tax-delinquent, probate, vacant, REO',
    filters: { hasDistress: true },
  },
  {
    key: 'fsbo_indiv',
    label: 'Real FSBO',
    icon: '🏠',
    desc: 'Individual owner selling direct (not builder LLCs)',
    filters: { fsboOnly: true, ownerType: 'Individual' },
  },
  {
    key: 'investor',
    label: 'Absentee LLCs',
    icon: '🏢',
    desc: 'Corporate owners not occupying — sometimes sell off-market',
    filters: { ownerType: 'Entity', absenteeOnly: true },
  },
  {
    key: 'trust',
    label: 'Trust Owners',
    icon: '📜',
    desc: 'Estate/inheritance signal, often motivated',
    filters: { ownerType: 'Trust' },
  },
]

export default function PropertiesPage() {
  const [rows, setRows] = useState<FullPropertyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useLocalStorage<Filters>('cedar.properties.filters', EMPTY_FILTERS)
  const [zipInput, setZipInput] = useState('')
  const [sortColumn, setSortColumn] = useLocalStorage<string>('cedar.properties.sortColumn', 'date')
  const [sortOrder, setSortOrder] = useLocalStorage<'asc' | 'desc'>('cedar.properties.sortOrder', 'desc')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync zip input with persisted filter on mount
  useEffect(() => { setZipInput(filters.zip) }, [filters.zip])

  function applyPreset(key: string) {
    const preset = PRESETS.find(p => p.key === key)
    if (!preset) return
    // Presets are an OVERLAY on empty filters — so clicking a preset always
    // resets other filters first, avoiding confusing "stuck" filters.
    setFilters({ ...EMPTY_FILTERS, ...preset.filters })
    setZipInput('')
  }

  const handleZipChange = useCallback((value: string) => {
    setZipInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setFilters(prev => ({ ...prev, zip: value }))
    }, 400)
  }, [])

  const loadProperties = useCallback(async () => {
    setLoading(true)

    // Map UI sort keys → actual `analyses` column names. Any key in this map
    // triggers the "flipped" query below: we query `analyses` as root + nest
    // properties, so ordering on these cols actually ranks parent rows.
    const analysisSortColumns: Record<string, string> = {
      deal_score: 'deal_score_numeric',
      roi: 'roi',
      mao: 'mao',
      wholesale_profit: 'wholesale_profit',
      discount_pct: 'discount_pct',
      arv: 'arv',
      rehab: 'rehab_total',
      total_in: 'total_in',
      est_profit: 'est_profit',
      gross_profit: 'gross_profit',
      offer: 'offer_price',
    }
    const sortsOnAnalysis = sortColumn in analysisSortColumns

    const analysisFields = `
      offer_price, arv, arv_per_sqft, diff, rehab_total, selling_costs, total_cost,
      est_profit, monthly_payment, months_held, profit_with_finance, roi, mao,
      wholesale_profit, deal_score, deal_score_numeric, comp_addresses, comp_prices,
      comp_avg_per_sqft, discount_pct, total_in, gross_profit, verified, badge
    `
    const propertyFields = `
      id, tcad_prop_id, address, city, zip_code, beds, baths, sqft, lot_size,
      asking_price, list_type, property_type, market_value, source, link,
      days_on_market, created_at, listing_status, review_status,
      agent_name, agent_phone, agent_email,
      owner_name, owner_mailing_address, is_absentee, has_homestead_exemption,
      distress_signal, special_features, notes
    `

    let loaded: FullPropertyRow[] = []

    if (sortsOnAnalysis) {
      // Flipped query: analyses is root (so we can actually order by its
      // columns), with properties nested via !inner. PostgREST can only sort
      // parent rows by root-table columns, so this flip is the one way to
      // truly rank properties by score / ROI / MAO / etc.
      let q = supabase
        .from('analyses')
        .select(`${analysisFields}, properties!inner (${propertyFields})`)
        .order(analysisSortColumns[sortColumn], { ascending: sortOrder === 'asc', nullsFirst: false })
        .limit(2000)

      if (filters.badge) q = q.eq('badge', filters.badge)
      if (filters.zip) q = q.eq('properties.zip_code', filters.zip)
      if (filters.listType) q = q.eq('properties.list_type', filters.listType)
      if (filters.source) q = q.eq('properties.source', filters.source)
      if (filters.review) q = q.eq('properties.review_status', filters.review)
      if (filters.fsboOnly) q = q.eq('properties.list_type', 'FSBO')
      if (filters.absenteeOnly) q = q.eq('properties.is_absentee', true)
      if (filters.hasDistress) q = q.not('properties.distress_signal', 'is', null)

      const { data, error } = await q
      if (error) {
        console.error('analyses load failed:', error)
        setLoading(false)
        return
      }

      // Flip the shape: each row is {...analysis_fields, properties: {...}}.
      // Transform to FullPropertyRow: {...property_fields, analyses: [analysis]}
      loaded = (data ?? []).map(r => {
        const row = r as Record<string, unknown>
        const { properties: prop, ...analysis } = row
        return {
          ...(prop as Record<string, unknown>),
          analyses: [analysis],
        }
      }) as unknown as FullPropertyRow[]
    } else {
      // Property-first query (default shape) — sort on property-level fields
      const needsInner = Boolean(filters.badge)
      const analysesJoin = needsInner ? 'analyses!inner' : 'analyses'
      let query = supabase
        .from('properties')
        .select(`${propertyFields}, ${analysesJoin} (${analysisFields})`)
        .limit(needsInner ? 2000 : 500)

      if (sortColumn === 'asking_price' || sortColumn === 'sqft' || sortColumn === 'beds' || sortColumn === 'baths' || sortColumn === 'dom') {
        const colMap: Record<string, string> = {
          asking_price: 'asking_price', sqft: 'sqft', beds: 'beds', baths: 'baths', dom: 'days_on_market',
        }
        query = query.order(colMap[sortColumn], { ascending: sortOrder === 'asc', nullsFirst: false })
      } else if (sortColumn === 'list_type' || sortColumn === 'source') {
        query = query.order(sortColumn, { ascending: sortOrder === 'asc' })
      } else if (sortColumn === 'address') {
        query = query.order('address', { ascending: sortOrder === 'asc' })
      } else {
        query = query.order('created_at', { ascending: sortOrder === 'asc' })
      }

      if (filters.zip) query = query.eq('zip_code', filters.zip)
      if (filters.listType) query = query.eq('list_type', filters.listType)
      if (filters.source) query = query.eq('source', filters.source)
      if (filters.review) query = query.eq('review_status', filters.review)
      if (filters.fsboOnly) query = query.eq('list_type', 'FSBO')
      if (filters.badge) query = query.eq('analyses.badge', filters.badge)
      if (filters.absenteeOnly) query = query.eq('is_absentee', true)
      if (filters.hasDistress) query = query.not('distress_signal', 'is', null)

      const { data, error } = await query
      if (error) {
        console.error('properties load failed:', error)
        setLoading(false)
        return
      }

      // Post-UNIQUE-constraint, analyses comes back as object-or-null. Normalize.
      loaded = normalizeRelations(
        (data ?? []) as unknown as Record<string, unknown>[],
        ['analyses'],
      ) as unknown as FullPropertyRow[]
    }

    // Owner type filter (derived from owner_name — client-side classifier)
    if (filters.ownerType) {
      loaded = loaded.filter(r => classifyOwner(r.owner_name) === filters.ownerType)
    }

    // Client-side filters for type classifier (derived from multiple columns)
    if (filters.unitType) {
      loaded = loaded.filter(r => {
        const t = classifyUnitType({
          property_type: r.property_type,
          address: r.address,
          lot_size: r.lot_size,
          sqft: r.sqft,
          beds: r.beds,
        })
        return t === filters.unitType
      })
    }
    if (filters.hideMismatch) {
      loaded = loaded.filter(r => {
        const t = classifyUnitType({
          property_type: r.property_type,
          address: r.address,
          lot_size: r.lot_size,
          sqft: r.sqft,
          beds: r.beds,
        })
        return !isParcelMismatchLikely(t, r.market_value, r.asking_price)
      })
    }

    // For client-only sort keys (list_per_sqft is derived, rehab accessor etc.)
    // fall back to local sort. Everything else was sorted at the DB.
    if (sortColumn === 'list_per_sqft') {
      loaded.sort((a, b) => {
        const va = (a.asking_price && a.sqft) ? a.asking_price / a.sqft : 0
        const vb = (b.asking_price && b.sqft) ? b.asking_price / b.sqft : 0
        return sortOrder === 'asc' ? va - vb : vb - va
      })
    }

    setRows(loaded)
    setLoading(false)
  }, [filters, sortColumn, sortOrder])

  useEffect(() => {
    loadProperties()
  }, [loadProperties])

  // Realtime refresh on property inserts/updates
  useEffect(() => {
    const channel = supabase
      .channel('properties-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'properties' }, () => { loadProperties() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analyses' }, () => { loadProperties() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadProperties])

  function handleSort(key: string) {
    if (sortColumn === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(key)
      setSortOrder('desc')
    }
  }

  /**
   * Live-update the row's analysis when per-row enrichment completes so the
   * user sees the badge/score/ARV change inline. The server already re-ran
   * analyze and returned the fresh numbers — we just merge them into state.
   */
  function handleEnriched(id: string, source: 'batchdata' | 'rentcast_avm', result: EnrichmentResult) {
    if (!result.ok || !result.reanalysis) return
    const fresh = result.reanalysis
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r
      const existing = r.analyses?.[0] ?? {}
      const merged = {
        ...existing,
        arv: fresh.arv,
        roi: fresh.roi,
        mao: fresh.mao,
        wholesale_profit: fresh.wholesale_profit,
        discount_pct: fresh.discount_pct,
        verified: fresh.verified,
        deal_score_numeric: fresh.deal_score_numeric,
        badge: fresh.badge,
      }
      const updates: Partial<FullPropertyRow> = { analyses: [merged] as unknown as FullPropertyRow['analyses'] }
      if (source === 'batchdata' && result.distress) {
        // Owner enrichment may also patch distress signal into the row
        // (not rendered as a column yet, but available for future use)
      }
      return { ...r, ...updates }
    }))
  }

  async function handleReviewStatusChange(id: string, status: string) {
    // Optimistic update
    setRows(prev => prev.map(r => r.id === id ? { ...r, review_status: status } : r))
    try {
      const res = await fetch(`/api/properties/${id}/review-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        console.error('review-status update failed:', await res.text())
        // Rollback on failure by reloading
        loadProperties()
      }
    } catch (err) {
      console.error('review-status update error:', err)
      loadProperties()
    }
  }

  const activeFilters = Object.entries(filters).filter(([, v]) => v !== '' && v !== false).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-cedar-green">Properties</h1>
          <p className="text-charcoal/60 text-sm">
            {loading ? 'Loading...' : `${rows.length} properties`}
          </p>
        </div>
        <RefreshButton />
      </div>

      {/* Preset filter row — one-click wholesaler shortcuts */}
      <div className="bg-white border border-cedar-green/15 rounded-card p-3 flex flex-wrap gap-2 items-center">
        <span className="text-xs font-semibold text-cedar-green uppercase tracking-wide mr-1">Presets</span>
        {PRESETS.map(p => {
          const isActive = Object.entries(p.filters).every(
            ([k, v]) => (filters as unknown as Record<string, unknown>)[k] === v,
          )
          const isPrimary = p.key === 'hot'
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              title={p.desc}
              className={clsx(
                'text-xs font-semibold px-3 py-1.5 rounded border transition-colors',
                isActive
                  ? 'bg-cedar-green text-cream border-cedar-green'
                  : isPrimary
                    ? 'bg-capital-gold/10 text-capital-gold border-capital-gold/40 hover:bg-capital-gold/20'
                    : 'bg-white text-charcoal border-stone/40 hover:bg-sand/40',
              )}
            >
              {p.icon} {p.label}
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={filters.badge}
          onChange={e => setFilters(prev => ({ ...prev, badge: e.target.value as BadgeFilter }))}
          className="input w-auto"
        >
          <option value="">All Badges</option>
          <option value="Perfect Fit">Perfect Fit</option>
          <option value="Strong Match">Strong Match</option>
          <option value="Could Work">Could Work</option>
          <option value="Needs a Reason">Needs a Reason</option>
          <option value="Pass">Pass</option>
        </select>

        <select
          value={filters.review}
          onChange={e => setFilters(prev => ({ ...prev, review: e.target.value as ReviewFilter }))}
          className="input w-auto"
        >
          <option value="">All Triage</option>
          <option value="New">New</option>
          <option value="Reviewed">Reviewed</option>
          <option value="Contacted">Contacted</option>
          <option value="Dead">Dead</option>
        </select>

        <input
          type="text"
          placeholder="Zip code"
          value={zipInput}
          onChange={e => handleZipChange(e.target.value)}
          className="input w-28"
        />

        <select
          value={filters.source}
          onChange={e => setFilters(prev => ({ ...prev, source: e.target.value }))}
          className="input w-auto"
        >
          <option value="">All Sources</option>
          <option value="rentcast">Rentcast</option>
          <option value="realty_in_us">Realty-in-US</option>
          <option value="realtor16">Realtor16</option>
          <option value="attom">ATTOM</option>
        </select>

        <select
          value={filters.listType}
          onChange={e => setFilters(prev => ({ ...prev, listType: e.target.value }))}
          className="input w-auto"
        >
          <option value="">All Types</option>
          <option value="FSBO">FSBO</option>
          <option value="Listed">Listed</option>
          <option value="Pre-foreclosure">Pre-foreclosure</option>
          <option value="Auction">Auction</option>
          <option value="REO">REO</option>
        </select>

        <select
          value={filters.unitType}
          onChange={e => setFilters(prev => ({ ...prev, unitType: e.target.value as UnitFilter }))}
          className="input w-auto"
        >
          <option value="">All Unit Types</option>
          <option value="SFR">SFR</option>
          <option value="Condo">Condo</option>
          <option value="Townhouse">Townhouse</option>
          <option value="Duplex">Duplex</option>
          <option value="Multi">Multi-family</option>
          <option value="Land">Land</option>
        </select>

        <select
          value={filters.ownerType}
          onChange={e => setFilters(prev => ({ ...prev, ownerType: e.target.value as OwnerFilter }))}
          className="input w-auto"
          title="Owner type from TCAD — Individuals are most workable for cold outreach"
        >
          <option value="">All Owners</option>
          <option value="Individual">👤 Individual</option>
          <option value="Trust">📜 Trust</option>
          <option value="Entity">🏢 LLC / Entity</option>
          <option value="Government">🏛 Government</option>
          <option value="Unknown">Unknown</option>
        </select>

        <label className="flex items-center gap-1.5 text-sm text-charcoal cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.fsboOnly}
            onChange={e => setFilters(prev => ({ ...prev, fsboOnly: e.target.checked }))}
            className="accent-capital-gold"
          />
          FSBO only
        </label>

        <label
          className="flex items-center gap-1.5 text-sm text-charcoal cursor-pointer select-none"
          title="Hide rows where TCAD market_value looks like a whole-building parcel, not the unit"
        >
          <input
            type="checkbox"
            checked={filters.hideMismatch}
            onChange={e => setFilters(prev => ({ ...prev, hideMismatch: e.target.checked }))}
            className="accent-amber-500"
          />
          Hide parcel-mismatch
        </label>

        <label
          className="flex items-center gap-1.5 text-sm text-charcoal cursor-pointer select-none"
          title="Absentee owner (mailing address differs from property) — wholesaler prime target"
        >
          <input
            type="checkbox"
            checked={filters.absenteeOnly}
            onChange={e => setFilters(prev => ({ ...prev, absenteeOnly: e.target.checked }))}
            className="accent-capital-gold"
          />
          ✈ Absentee only
        </label>

        <label
          className="flex items-center gap-1.5 text-sm text-charcoal cursor-pointer select-none"
          title="Distress signal detected (pre-foreclosure, tax-delinquent, probate, vacant, etc.)"
        >
          <input
            type="checkbox"
            checked={filters.hasDistress}
            onChange={e => setFilters(prev => ({ ...prev, hasDistress: e.target.checked }))}
            className="accent-red-500"
          />
          ⚠ Distress only
        </label>

        {activeFilters > 0 && (
          <button
            onClick={() => {
              setFilters(EMPTY_FILTERS)
              setZipInput('')
            }}
            className="text-sm text-charcoal/60 hover:text-charcoal"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white border border-stone/30 rounded-card py-12 text-center text-charcoal/50">
          Loading properties...
        </div>
      ) : (
        <PropertyTable
          rows={rows}
          sortColumn={sortColumn}
          sortOrder={sortOrder}
          onSort={handleSort}
          onReviewStatusChange={handleReviewStatusChange}
          onEnriched={handleEnriched}
        />
      )}
    </div>
  )
}
