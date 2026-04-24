'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { normalizeRelations } from '@/lib/supabase/normalize'
import PropertyTable, { type FullPropertyRow } from '@/components/dashboard/PropertyTable'
import RefreshButton from '@/components/dashboard/RefreshButton'

type BadgeFilter = '' | 'Perfect Fit' | 'Strong Match' | 'Could Work' | 'Needs a Reason' | 'Pass'
type ReviewFilter = '' | 'New' | 'Reviewed' | 'Contacted' | 'Dead'

export default function PropertiesPage() {
  const [rows, setRows] = useState<FullPropertyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    badge: '' as BadgeFilter,
    review: '' as ReviewFilter,
    zip: '',
    listType: '',
    source: '',
    fsboOnly: false,
  })
  const [zipInput, setZipInput] = useState('')
  const [sortColumn, setSortColumn] = useState<string>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleZipChange = useCallback((value: string) => {
    setZipInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setFilters(prev => ({ ...prev, zip: value }))
    }, 400)
  }, [])

  const loadProperties = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('properties')
      .select(`
        id, address, city, zip_code, beds, baths, sqft, asking_price, list_type,
        source, link, days_on_market, created_at, listing_status, review_status,
        agent_name, agent_phone, agent_email, special_features, notes,
        analyses (
          offer_price, arv, arv_per_sqft, diff, rehab_total, selling_costs, total_cost,
          est_profit, monthly_payment, months_held, profit_with_finance, roi, mao,
          wholesale_profit, deal_score, deal_score_numeric, comp_addresses, comp_prices,
          comp_avg_per_sqft, discount_pct, total_in, gross_profit, verified
        )
      `)
      .order('created_at', { ascending: sortOrder === 'asc' })
      .limit(500)

    if (filters.zip) query = query.eq('zip_code', filters.zip)
    if (filters.listType) query = query.eq('list_type', filters.listType)
    if (filters.source) query = query.eq('source', filters.source)
    if (filters.review) query = query.eq('review_status', filters.review)
    if (filters.fsboOnly) query = query.eq('list_type', 'FSBO')

    const { data, error } = await query
    if (error) {
      console.error('properties load failed:', error)
      setLoading(false)
      return
    }

    // Post-UNIQUE-constraint, Supabase returns `analyses` as object-or-null
    // instead of array. Normalize to array shape so UI code (p.analyses?.[0])
    // keeps working uniformly for analyzed + unanalyzed rows.
    let loaded = normalizeRelations(
      (data ?? []) as unknown as Record<string, unknown>[],
      ['analyses'],
    ) as unknown as FullPropertyRow[]

    // Client-side filter by badge (requires analysis)
    if (filters.badge) {
      loaded = loaded.filter(r => {
        const s = r.analyses?.[0]?.deal_score_numeric
        if (s === null || s === undefined) return false
        const badge =
          s >= 90 ? 'Perfect Fit'
          : s >= 75 ? 'Strong Match'
          : s >= 60 ? 'Could Work'
          : s >= 40 ? 'Needs a Reason'
          : 'Pass'
        return badge === filters.badge
      })
    }

    // Client-side sorting for analysis-derived columns
    const accessor = (r: FullPropertyRow, key: string): number => {
      const a = r.analyses?.[0]
      switch (key) {
        case 'address': return 0 // alphabetical handled below
        case 'date': return new Date(r.created_at).getTime()
        case 'beds': return r.beds ?? 0
        case 'baths': return r.baths ?? 0
        case 'sqft': return r.sqft ?? 0
        case 'asking_price': return r.asking_price ?? 0
        case 'offer': return a?.offer_price ?? 0
        case 'list_per_sqft': return (r.asking_price && r.sqft) ? r.asking_price / r.sqft : 0
        case 'discount_pct': return a?.discount_pct ?? 0
        case 'rehab': return a?.rehab_total ?? 0
        case 'total_in': return a?.total_in ?? 0
        case 'arv': return a?.arv ?? 0
        case 'gross_profit': return a?.gross_profit ?? 0
        case 'est_profit': return a?.est_profit ?? 0
        case 'roi': return a?.roi ?? 0
        case 'dom': return r.days_on_market ?? 0
        case 'mao': return a?.mao ?? 0
        case 'wholesale_profit': return a?.wholesale_profit ?? 0
        case 'deal_score': return a?.deal_score_numeric ?? 0
        default: return 0
      }
    }

    if (sortColumn === 'address') {
      loaded.sort((a, b) => sortOrder === 'asc' ? a.address.localeCompare(b.address) : b.address.localeCompare(a.address))
    } else if (sortColumn === 'list_type' || sortColumn === 'source') {
      const k = sortColumn
      loaded.sort((a, b) => {
        const va = String((a as unknown as Record<string, string | null>)[k] ?? '')
        const vb = String((b as unknown as Record<string, string | null>)[k] ?? '')
        return sortOrder === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      })
    } else if (sortColumn !== 'date') {
      loaded.sort((a, b) => {
        const va = accessor(a, sortColumn)
        const vb = accessor(b, sortColumn)
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

        <label className="flex items-center gap-1.5 text-sm text-charcoal cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.fsboOnly}
            onChange={e => setFilters(prev => ({ ...prev, fsboOnly: e.target.checked }))}
            className="accent-capital-gold"
          />
          FSBO only
        </label>

        {activeFilters > 0 && (
          <button
            onClick={() => {
              setFilters({ badge: '', review: '', zip: '', listType: '', source: '', fsboOnly: false })
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
        />
      )}
    </div>
  )
}
