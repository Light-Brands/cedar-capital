'use client'

import type { Analysis } from '@/lib/supabase/types'

interface AnalysisPanelProps {
  analysis: Analysis
}

function fmt(n: number | null): string {
  if (n === null || n === undefined) return '-'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return '-'
  return `${(n * 100).toFixed(1)}%`
}

export default function AnalysisPanel({ analysis }: AnalysisPanelProps) {
  const rehabItems = [
    { label: 'Kitchen', value: analysis.rehab_kitchen },
    { label: 'Bathrooms', value: analysis.rehab_bath },
    { label: 'Interior Paint', value: analysis.rehab_interior_paint },
    { label: 'Exterior Paint', value: analysis.rehab_exterior_paint },
    { label: 'Flooring', value: analysis.rehab_flooring },
    { label: 'Windows', value: analysis.rehab_windows },
    { label: 'Misc', value: analysis.rehab_misc },
    { label: 'Roof', value: analysis.rehab_roof },
    { label: 'Sheetrock', value: analysis.rehab_sheetrock },
    { label: 'Framing', value: analysis.rehab_framing },
    { label: 'Electrical', value: analysis.rehab_electrical },
    { label: 'Plumbing', value: analysis.rehab_plumbing },
    { label: 'HVAC', value: analysis.rehab_hvac },
    { label: 'Landscape', value: analysis.rehab_landscape },
    { label: 'Foundation', value: analysis.rehab_foundation },
    { label: 'Other', value: analysis.rehab_other },
  ].filter(item => item.value && item.value > 0)

  return (
    <div className="space-y-6">
      {/* Deal Overview */}
      <div className="bg-white border border-stone/30 rounded-card p-5">
        <h3 className="font-heading font-semibold text-cedar-green mb-4">Deal Analysis</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-charcoal/50">Offer Price</p>
            <p className="font-semibold">{fmt(analysis.offer_price)}</p>
            <p className="text-xs text-charcoal/40">{analysis.offer_per_sqft ? `$${analysis.offer_per_sqft}/sqft` : ''}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal/50">ARV</p>
            <p className="font-semibold">{fmt(analysis.arv)}</p>
            <p className="text-xs text-charcoal/40">{analysis.arv_per_sqft ? `$${analysis.arv_per_sqft}/sqft` : ''}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal/50">Diff (ARV - Offer)</p>
            <p className="font-semibold text-success">{fmt(analysis.diff)}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal/50">Selling Costs (7%)</p>
            <p className="font-semibold">{fmt(analysis.selling_costs)}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal/50">Total Cost</p>
            <p className="font-semibold">{fmt(analysis.total_cost)}</p>
          </div>
          <div>
            <p className="text-xs text-charcoal/50">Est. Profit</p>
            <p className={`font-bold text-lg ${(analysis.est_profit ?? 0) > 0 ? 'text-success' : 'text-error'}`}>
              {fmt(analysis.est_profit)}
            </p>
          </div>
        </div>
      </div>

      {/* Rehab Breakdown */}
      <div className="bg-white border border-stone/30 rounded-card p-5">
        <h3 className="font-heading font-semibold text-cedar-green mb-4">Rehab Estimate</h3>
        <div className="space-y-2">
          {rehabItems.map(item => (
            <div key={item.label} className="flex justify-between text-sm">
              <span className="text-charcoal/70">{item.label}</span>
              <span className="font-medium">{fmt(item.value)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold border-t border-stone/20 pt-2 mt-2">
            <span>Total Rehab</span>
            <span>{fmt(analysis.rehab_total)}</span>
          </div>
        </div>
      </div>

      {/* Finance Analysis */}
      <div className="bg-white border border-stone/30 rounded-card p-5">
        <h3 className="font-heading font-semibold text-cedar-green mb-4">Finance Analysis</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-charcoal/50">LTV</p>
            <p className="font-medium">{fmtPct(analysis.ltv)}</p>
          </div>
          <div>
            <p className="text-charcoal/50">Loan Amount</p>
            <p className="font-medium">{fmt(analysis.loan_amount)}</p>
          </div>
          <div>
            <p className="text-charcoal/50">Points</p>
            <p className="font-medium">{fmtPct(analysis.points_pct)}</p>
          </div>
          <div>
            <p className="text-charcoal/50">Interest Rate</p>
            <p className="font-medium">{fmtPct(analysis.interest_pct)}</p>
          </div>
          <div>
            <p className="text-charcoal/50">Hold Period</p>
            <p className="font-medium">{analysis.months_held ?? '-'} months</p>
          </div>
          <div>
            <p className="text-charcoal/50">Monthly Payment</p>
            <p className="font-medium">{fmt(analysis.monthly_payment)}</p>
          </div>
          <div>
            <p className="text-charcoal/50">Total Interest</p>
            <p className="font-medium">{fmt(analysis.total_interest)}</p>
          </div>
          <div>
            <p className="text-charcoal/50">Total Points</p>
            <p className="font-medium">{fmt(analysis.total_points)}</p>
          </div>
          <div>
            <p className="text-charcoal/50">Total Finance Cost</p>
            <p className="font-bold">{fmt(analysis.total_finance_cost)}</p>
          </div>
          <div>
            <p className="text-charcoal/50">Profit w/ Finance</p>
            <p className={`font-bold ${(analysis.profit_with_finance ?? 0) > 0 ? 'text-success' : 'text-error'}`}>
              {fmt(analysis.profit_with_finance)}
            </p>
          </div>
          <div className="col-span-2 border-t border-stone/20 pt-2 mt-2">
            <p className="text-charcoal/50">ROI</p>
            <p className={`text-xl font-bold ${(analysis.roi ?? 0) > 20 ? 'text-success' : (analysis.roi ?? 0) > 0 ? 'text-warning' : 'text-error'}`}>
              {analysis.roi != null ? `${analysis.roi.toFixed(2)}%` : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Wholesale Analysis */}
      <div className="bg-white border border-stone/30 rounded-card p-5">
        <h3 className="font-heading font-semibold text-cedar-green mb-4">Wholesale Analysis</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-charcoal/50">MAO (75% ARV - Repairs)</p>
            <p className="font-bold text-lg">{fmt(analysis.mao)}</p>
          </div>
          <div>
            <p className="text-charcoal/50">Wholesale Profit</p>
            <p className={`font-bold text-lg ${(analysis.wholesale_profit ?? 0) > 0 ? 'text-success' : 'text-error'}`}>
              {fmt(analysis.wholesale_profit)}
            </p>
          </div>
        </div>
      </div>

      {/* Comps */}
      {analysis.comp_addresses && analysis.comp_addresses.length > 0 && (
        <div className="bg-white border border-stone/30 rounded-card p-5">
          <h3 className="font-heading font-semibold text-cedar-green mb-4">
            Comparable Sales ({analysis.comp_addresses.length})
          </h3>
          <div className="space-y-2 text-sm">
            {analysis.comp_addresses.map((addr, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-charcoal/70">{addr}</span>
                <span className="font-medium">
                  {analysis.comp_prices?.[i] ? fmt(analysis.comp_prices[i]) : '-'}
                </span>
              </div>
            ))}
            {analysis.comp_avg_per_sqft && (
              <div className="flex justify-between border-t border-stone/20 pt-2 mt-2 font-medium">
                <span>Avg $/sqft</span>
                <span>${analysis.comp_avg_per_sqft.toFixed(0)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Score Breakdown */}
      {analysis.score_factors && (
        <div className="bg-white border border-stone/30 rounded-card p-5">
          <h3 className="font-heading font-semibold text-cedar-green mb-4">Score Breakdown</h3>
          <div className="space-y-2 text-sm">
            {Object.entries(analysis.score_factors as Record<string, number>).map(([factor, pts]) => (
              <div key={factor} className="flex justify-between items-center">
                <span className="text-charcoal/70 capitalize">{factor.replace(/([A-Z])/g, ' $1').trim()}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-stone/20 rounded-full h-2">
                    <div
                      className="bg-cedar-green rounded-full h-2"
                      style={{ width: `${Math.min(100, (pts / 25) * 100)}%` }}
                    />
                  </div>
                  <span className="font-medium w-8 text-right">{pts}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-between border-t border-stone/20 pt-2 mt-2 font-bold">
              <span>Total</span>
              <span>{analysis.deal_score_numeric}/100</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
