'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import PropertyTable from '@/components/dashboard/PropertyTable'
import RefreshButton from '@/components/dashboard/RefreshButton'

interface PropertyRow {
  id: string
  address: string
  city: string
  zip_code: string | null
  beds: number | null
  baths: number | null
  sqft: number | null
  asking_price: number | null
  list_type: string | null
  created_at: string
  analyses: Array<{
    deal_score: string | null
    deal_score_numeric: number | null
    roi: number | null
    mao: number | null
    wholesale_profit: number | null
    arv: number | null
    est_profit: number | null
    profit_with_finance: number | null
  }> | null
  pipeline: Array<{ stage: string }> | null
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    score: '',
    zip: '',
    listType: '',
  })
  const [zipInput, setZipInput] = useState('')
  const [sortColumn, setSortColumn] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce zip code input
  const handleZipChange = useCallback((value: string) => {
    setZipInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setFilters(prev => ({ ...prev, zip: value }))
    }, 400)
  }, [])

  async function loadProperties() {
    setLoading(true)
    let query = supabase
      .from('properties')
      .select(`
        id, address, city, zip_code, beds, baths, sqft, asking_price, list_type, created_at,
        analyses ( deal_score, deal_score_numeric, roi, mao, wholesale_profit, arv, est_profit, profit_with_finance ),
        pipeline ( stage )
      `)
      .order('created_at', { ascending: sortOrder === 'asc' })
      .limit(100)

    if (filters.zip) query = query.eq('zip_code', filters.zip)
    if (filters.listType) query = query.eq('list_type', filters.listType)

    const { data } = await query
    let rows = (data ?? []) as unknown as PropertyRow[]

    // Client-side filter by score (since it's in a nested relation)
    if (filters.score) {
      rows = rows.filter(r => r.analyses?.[0]?.deal_score === filters.score)
    }

    // Client-side sorting for all columns
    const getNestedNum = (r: PropertyRow, col: string): number => {
      const a = r.analyses?.[0]
      switch (col) {
        case 'deal_score': return a?.deal_score_numeric ?? 0
        case 'roi': return a?.roi ?? 0
        case 'arv': return a?.arv ?? 0
        case 'mao': return a?.mao ?? 0
        case 'est_profit': return a?.est_profit ?? 0
        case 'wholesale_profit': return a?.wholesale_profit ?? 0
        case 'asking_price': return r.asking_price ?? 0
        case 'sqft': return r.sqft ?? 0
        case 'beds': return r.beds ?? 0
        default: return 0
      }
    }

    if (sortColumn !== 'created_at') {
      rows.sort((a, b) => {
        const va = getNestedNum(a, sortColumn)
        const vb = getNestedNum(b, sortColumn)
        return sortOrder === 'asc' ? va - vb : vb - va
      })
    }

    setProperties(rows)
    setLoading(false)
  }

  useEffect(() => {
    loadProperties()
  }, [filters, sortColumn, sortOrder])

  function handleSort(column: string) {
    if (sortColumn === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortOrder('desc')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-cedar-green">Properties</h1>
          <p className="text-charcoal/60 text-sm">{properties.length} properties found</p>
        </div>
        <RefreshButton />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.score}
          onChange={e => setFilters(prev => ({ ...prev, score: e.target.value }))}
          className="input w-auto"
        >
          <option value="">All Scores</option>
          <option value="A">A Grade</option>
          <option value="B">B Grade</option>
          <option value="C">C Grade</option>
          <option value="D">D Grade</option>
          <option value="F">F Grade</option>
        </select>

        <input
          type="text"
          placeholder="Zip Code"
          value={zipInput}
          onChange={e => handleZipChange(e.target.value)}
          className="input w-32"
        />

        <select
          value={filters.listType}
          onChange={e => setFilters(prev => ({ ...prev, listType: e.target.value }))}
          className="input w-auto"
        >
          <option value="">All Types</option>
          <option value="Pre-foreclosure">Pre-foreclosure</option>
          <option value="Auction">Auction</option>
          <option value="REO">REO</option>
          <option value="FSBO">FSBO</option>
          <option value="MLS">MLS</option>
        </select>

        {(filters.score || filters.zip || filters.listType) && (
          <button
            onClick={() => {
              setFilters({ score: '', zip: '', listType: '' })
              setZipInput('')
            }}
            className="text-sm text-charcoal/60 hover:text-charcoal"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-stone/30 rounded-card">
        {loading ? (
          <div className="text-center py-12 text-charcoal/50">Loading...</div>
        ) : (
          <PropertyTable
            properties={properties}
            onSort={handleSort}
            sortColumn={sortColumn}
            sortOrder={sortOrder}
          />
        )}
      </div>
    </div>
  )
}
