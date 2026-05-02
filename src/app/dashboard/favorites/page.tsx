'use client'

/**
 * /dashboard/favorites
 *
 * The starred properties. Same column shape as Hot Leads + sortable headers
 * + a few favorites-specific affordances (favorited timestamp, quick unstar).
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase/client'
import LeadPlayBadges from '@/components/dashboard/LeadPlayBadges'
import ScoreBadge from '@/components/dashboard/ScoreBadge'
import FavoriteStar from '@/components/dashboard/FavoriteStar'
import type { DealBadge } from '@/lib/analysis/badge'

type FavoriteRow = {
  id: string
  address: string
  zip_code: string | null
  beds: number | null
  baths: number | null
  sqft: number | null
  asking_price: number | null
  attom_owner_name: string | null
  attom_avm_value: number | null
  attom_ltv: number | null
  attom_lendable_equity: number | null
  attom_condition: string | null
  attom_absentee_ind: string | null
  description_categories: string[] | null
  is_favorite: boolean
  favorited_at: string | null
  arv_mid: number | null
  arv_confidence: 'high' | 'medium' | 'low' | null
  reno_override_pct: number | null
  analyses: Array<{
    arv: number | null
    deal_score_numeric: number | null
    badge: DealBadge | null
    roi: number | null
    rehab_total: number | null
  }>
}

function fmtUSD(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return d }
}

export default function FavoritesPage() {
  const [rows, setRows] = useState<FavoriteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('properties')
      .select(`
        id, address, zip_code, beds, baths, sqft, asking_price,
        attom_owner_name, attom_avm_value, attom_ltv, attom_lendable_equity,
        attom_condition, attom_absentee_ind, description_categories,
        is_favorite, favorited_at, arv_mid, arv_confidence, reno_override_pct,
        analyses ( arv, deal_score_numeric, badge, roi, rehab_total )
      `)
      .eq('is_favorite', true)
      .order('favorited_at', { ascending: false })
      .limit(500)
    if (err) setError(err.message)
    else setRows((data ?? []) as unknown as FavoriteRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const stats = useMemo(() => {
    const total = rows.length
    const aGrade = rows.filter((r) => r.analyses?.[0]?.badge === 'Perfect Fit' || r.analyses?.[0]?.badge === 'Strong Match').length
    const distressed = rows.filter((r) => r.description_categories?.includes('distressed')).length
    const totalEquity = rows.reduce((s, r) => s + (r.attom_lendable_equity ?? 0), 0)
    return { total, aGrade, distressed, totalEquity }
  }, [rows])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-cedar-green">⭐ Favorites</h1>
        <p className="text-charcoal/60 mt-1 text-sm">
          Properties you&apos;ve starred. Sorted by most-recently favorited.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Favorites" value={stats.total.toString()} />
        <Stat label="A/B Grade" value={stats.aGrade.toString()} tone="emerald" />
        <Stat label="Distressed" value={stats.distressed.toString()} tone="orange" />
        <Stat label="Total Lendable Equity" value={fmtUSD(stats.totalEquity)} tone="emerald" />
      </div>

      {error && <div className="bg-red-50 border border-red-300 text-red-800 rounded-card p-3 text-sm">{error}</div>}
      {loading && <div className="text-charcoal/50 text-center py-12">Loading favorites…</div>}

      {!loading && rows.length === 0 && (
        <div className="text-charcoal/50 text-center py-16 bg-white border border-stone/30 rounded-card">
          <div className="text-4xl mb-3">⭐</div>
          <p className="mb-2">No favorites yet.</p>
          <p className="text-xs text-charcoal/40 max-w-md mx-auto">
            Click the star icon on any property to favorite it. Favorites land here for quick access.
          </p>
          <Link href="/dashboard/hot-leads" className="inline-block mt-4 text-cedar-green hover:underline text-sm">
            Browse Hot Leads →
          </Link>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-white border border-stone/30 rounded-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sand/30">
              <tr>
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2 font-medium text-charcoal/60 text-xs uppercase tracking-wide text-left">Address</th>
                <th className="px-3 py-2 font-medium text-charcoal/60 text-xs uppercase tracking-wide text-left">Owner</th>
                <th className="px-3 py-2 font-medium text-charcoal/60 text-xs uppercase tracking-wide text-right">Asking</th>
                <th className="px-3 py-2 font-medium text-charcoal/60 text-xs uppercase tracking-wide text-right">ARV</th>
                <th className="px-3 py-2 font-medium text-charcoal/60 text-xs uppercase tracking-wide text-right">Rehab</th>
                <th className="px-3 py-2 font-medium text-charcoal/60 text-xs uppercase tracking-wide text-right">Reno %</th>
                <th className="px-3 py-2 font-medium text-charcoal/60 text-xs uppercase tracking-wide text-right">ROI</th>
                <th className="px-3 py-2 font-medium text-charcoal/60 text-xs uppercase tracking-wide text-left">Plays</th>
                <th className="px-3 py-2 font-medium text-charcoal/60 text-xs uppercase tracking-wide text-right">Profitability</th>
                <th className="px-3 py-2 font-medium text-charcoal/60 text-xs uppercase tracking-wide text-left">Starred</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const arv = r.analyses?.[0]?.arv ?? r.arv_mid
                const rehab = r.analyses?.[0]?.rehab_total
                const roi = r.analyses?.[0]?.roi
                const dealScore = r.analyses?.[0]?.deal_score_numeric
                const badge = r.analyses?.[0]?.badge
                return (
                  <tr key={r.id} className="border-t border-stone/15 hover:bg-cream/40">
                    <td className="px-3 py-2">
                      <FavoriteStar
                        propertyId={r.id}
                        initial={r.is_favorite}
                        size="sm"
                        onChange={(next) => { if (!next) load() }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/properties/${r.id}`} className="text-cedar-green hover:underline font-medium">
                        {r.address}
                      </Link>
                      <div className="text-[10px] text-charcoal/50">{r.zip_code}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-charcoal/70 max-w-[180px] truncate">{r.attom_owner_name ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{fmtUSD(r.asking_price)}</td>
                    <td className="px-3 py-2 text-right">{fmtUSD(arv)}</td>
                    <td className="px-3 py-2 text-right text-xs">{fmtUSD(rehab)}</td>
                    <td className={clsx(
                      'px-3 py-2 text-right text-xs',
                      r.reno_override_pct ? 'font-bold text-cedar-green' : 'text-charcoal/40',
                    )}>
                      {r.reno_override_pct ? `${r.reno_override_pct}%` : 'auto'}
                    </td>
                    <td className={clsx(
                      'px-3 py-2 text-right',
                      roi === null ? 'text-charcoal/40' :
                      (roi ?? 0) >= 25 ? 'text-emerald-700 font-semibold' :
                      (roi ?? 0) >= 10 ? 'text-amber-700' :
                      (roi ?? 0) >= 0 ? 'text-charcoal/70' :
                      'text-red-700',
                    )}>
                      {roi !== null && roi !== undefined ? `${roi}%` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <LeadPlayBadges property={r as Parameters<typeof LeadPlayBadges>[0]['property']} max={2} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ScoreBadge badge={badge ?? null} score={dealScore ?? null} size="sm" />
                    </td>
                    <td className="px-3 py-2 text-xs text-charcoal/60">{fmtDate(r.favorited_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
