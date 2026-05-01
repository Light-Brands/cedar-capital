'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase/client'
import { normalizeRelations } from '@/lib/supabase/normalize'
import StatsBar from '@/components/dashboard/StatsBar'
import DealCard from '@/components/dashboard/DealCard'
import RefreshButton from '@/components/dashboard/RefreshButton'
import { LEAD_PLAY_TONE, LEAD_PLAY_LABEL, LEAD_PLAY_DESCRIPTION, type LeadPlay } from '@/lib/lead-plays'

interface DashboardProperty {
  id: string
  address: string
  city: string
  zip_code: string | null
  beds: number | null
  baths: number | null
  sqft: number | null
  asking_price: number | null
  list_type: string | null
  analyses: Array<{
    deal_score: string | null
    deal_score_numeric: number | null
    roi: number | null
    mao: number | null
    wholesale_profit: number | null
    arv: number | null
    est_profit: number | null
    profit_with_finance: number | null
  }>
  pipeline: Array<{ stage: string }>
}

interface PlayCounts {
  reo: number
  short_sale: number
  equity_rich: number
  free_and_clear: number
  corporate_owner: number
  multi_owner: number
  hot: number
}

const PLAY_VIEWS: Array<{ key: keyof PlayCounts; view: string; href: string; label: string; play?: LeadPlay }> = [
  { key: 'hot',             view: 'hot_leads',             href: '/dashboard/hot-leads',                          label: 'Hot Leads' },
  { key: 'reo',             view: 'reo_leads',             href: '/dashboard/lead-plays?tab=reo',                 label: 'REO',             play: 'reo' },
  { key: 'short_sale',      view: 'short_sale_leads',      href: '/dashboard/lead-plays?tab=short_sale',          label: 'Short Sale',      play: 'short_sale' },
  { key: 'equity_rich',     view: 'equity_rich_leads',     href: '/dashboard/lead-plays?tab=equity_rich',         label: 'Equity Rich',     play: 'equity_rich' },
  { key: 'free_and_clear',  view: 'free_and_clear_leads',  href: '/dashboard/lead-plays?tab=free_and_clear',      label: 'Free & Clear',    play: 'free_and_clear' },
  { key: 'corporate_owner', view: 'corporate_owner_leads', href: '/dashboard/lead-plays?tab=corporate_owner',     label: 'Corp Owner',      play: 'corporate_owner' },
  { key: 'multi_owner',     view: 'multi_property_owners', href: '/dashboard/lead-plays?tab=multi_owner',         label: 'Multi-Owner' },
]

export default function DashboardPage() {
  const [properties, setProperties] = useState<DashboardProperty[]>([])
  const [stats, setStats] = useState({
    total: 0,
    aGrade: 0,
    bGrade: 0,
    contacted: 0,
    inPipeline: 0,
  })
  const [playCounts, setPlayCounts] = useState<PlayCounts>({
    hot: 0, reo: 0, short_sale: 0, equity_rich: 0, free_and_clear: 0, corporate_owner: 0, multi_owner: 0,
  })
  const [loading, setLoading] = useState(true)

  async function loadData() {
    const { data } = await supabase
      .from('properties')
      .select(`
        id, address, city, zip_code, beds, baths, sqft, asking_price, list_type,
        analyses ( deal_score, deal_score_numeric, roi, mao, wholesale_profit, arv, est_profit, profit_with_finance ),
        pipeline ( stage )
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    // Supabase returns analyses + pipeline as to-one objects now; normalize.
    const props = normalizeRelations(
      (data ?? []) as unknown as Record<string, unknown>[],
      ['analyses', 'pipeline'],
    ) as unknown as DashboardProperty[]
    setProperties(props)

    // Calculate stats
    let aGrade = 0, bGrade = 0, inPipeline = 0
    for (const p of props) {
      const score = p.analyses?.[0]?.deal_score
      if (score === 'A') aGrade++
      if (score === 'B') bGrade++
      if (p.pipeline?.[0]) inPipeline++
    }

    // Get outreach count
    const { count: contactedCount } = await supabase
      .from('outreach_log')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent')

    setStats({
      total: props.length,
      aGrade,
      bGrade,
      contacted: contactedCount ?? 0,
      inPipeline,
    })

    // Pull lead-play counts in parallel — one head-count per view
    const playResults = await Promise.all(
      PLAY_VIEWS.map(async (v) => {
        const { count } = await supabase.from(v.view).select('*', { count: 'exact', head: true })
        return [v.key, count ?? 0] as const
      }),
    )
    setPlayCounts(Object.fromEntries(playResults) as unknown as PlayCounts)

    setLoading(false)
  }

  useEffect(() => {
    loadData()

    // Real-time subscription for new properties
    const channel = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'properties' }, () => {
        loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analyses' }, () => {
        loadData()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Sort: A-grade first, then B, then by score
  const sorted = [...properties].sort((a, b) => {
    const scoreA = a.analyses?.[0]?.deal_score_numeric ?? 0
    const scoreB = b.analyses?.[0]?.deal_score_numeric ?? 0
    return scoreB - scoreA
  })

  const topDeals = sorted.filter(p => {
    const score = p.analyses?.[0]?.deal_score
    return score === 'A' || score === 'B'
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-cedar-green">Dashboard</h1>
          <p className="text-charcoal/60 text-sm">Speed-to-Lead Engine - Austin/Greater Austin</p>
        </div>
        <RefreshButton />
      </div>

      {/* Stats */}
      <StatsBar
        stats={[
          { label: 'Total Properties', value: stats.total },
          { label: 'A-Grade Deals', value: stats.aGrade },
          { label: 'B-Grade Deals', value: stats.bGrade },
          { label: 'Contacted', value: stats.contacted },
        ]}
      />

      {/* Lead Plays — quick-jump cards into the six wholesale archetypes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-heading font-semibold text-cedar-green">Lead Plays</h2>
          <Link href="/dashboard/lead-plays" className="text-xs text-cedar-green hover:underline">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {PLAY_VIEWS.map((v) => {
            const count = playCounts[v.key]
            const tone = v.key === 'hot'
              ? 'bg-red-50 border-red-200 hover:bg-red-100 text-red-900'
              : v.play
                ? `${LEAD_PLAY_TONE[v.play]} hover:opacity-80`
                : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
            return (
              <Link
                key={v.key}
                href={v.href}
                title={v.play ? LEAD_PLAY_DESCRIPTION[v.play] : 'Hottest leads ranked by composite signal'}
                className={clsx('rounded-card border p-3 transition-colors block', tone)}
              >
                <div className="text-[10px] uppercase tracking-wide opacity-70 font-semibold">
                  {v.play ? LEAD_PLAY_LABEL[v.play] : v.label}
                </div>
                <div className="text-2xl font-bold mt-0.5">{count}</div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Top Deals */}
      {topDeals.length > 0 && (
        <div>
          <h2 className="text-lg font-heading font-semibold text-cedar-green mb-4">
            Hot Leads ({topDeals.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {topDeals.map(prop => (
              <DealCard
                key={prop.id}
                id={prop.id}
                address={prop.address}
                city={prop.city}
                zipCode={prop.zip_code ?? ''}
                beds={prop.beds}
                baths={prop.baths}
                sqft={prop.sqft}
                askingPrice={prop.asking_price}
                dealScore={prop.analyses?.[0]?.deal_score ?? null}
                dealScoreNumeric={prop.analyses?.[0]?.deal_score_numeric ?? null}
                roi={prop.analyses?.[0]?.roi ?? null}
                mao={prop.analyses?.[0]?.mao ?? null}
                wholesaleProfit={prop.analyses?.[0]?.wholesale_profit ?? null}
                arv={prop.analyses?.[0]?.arv ?? null}
                estProfit={prop.analyses?.[0]?.est_profit ?? null}
                pipelineStage={prop.pipeline?.[0]?.stage ?? null}
                listType={prop.list_type}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent Properties */}
      <div>
        <h2 className="text-lg font-heading font-semibold text-cedar-green mb-4">
          Recent Properties
        </h2>
        {loading ? (
          <div className="text-center py-12 text-charcoal/50">Loading properties...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sorted.slice(0, 12).map(prop => (
              <DealCard
                key={prop.id}
                id={prop.id}
                address={prop.address}
                city={prop.city}
                zipCode={prop.zip_code ?? ''}
                beds={prop.beds}
                baths={prop.baths}
                sqft={prop.sqft}
                askingPrice={prop.asking_price}
                dealScore={prop.analyses?.[0]?.deal_score ?? null}
                dealScoreNumeric={prop.analyses?.[0]?.deal_score_numeric ?? null}
                roi={prop.analyses?.[0]?.roi ?? null}
                mao={prop.analyses?.[0]?.mao ?? null}
                wholesaleProfit={prop.analyses?.[0]?.wholesale_profit ?? null}
                arv={prop.analyses?.[0]?.arv ?? null}
                estProfit={prop.analyses?.[0]?.est_profit ?? null}
                pipelineStage={prop.pipeline?.[0]?.stage ?? null}
                listType={prop.list_type}
              />
            ))}
          </div>
        )}
        {!loading && properties.length === 0 && (
          <div className="text-center py-16 bg-white border border-stone/30 rounded-card">
            <p className="text-charcoal/50 mb-4">No properties discovered yet.</p>
            <p className="text-sm text-charcoal/40">Click the Refresh button above to start discovering distressed properties in the Austin area.</p>
          </div>
        )}
      </div>
    </div>
  )
}
