/**
 * Zip-level pricing stats
 * Computes neighborhood average $/sqft per Austin zip from our own properties table.
 *
 * Rationale: Kelly's ARV formula is `Nbhd Avg $/sqft × SqFt`. Without real
 * sold-comp data (Rentcast quota, ATTOM not configured, Realtor.com wrappers
 * redact sold prices), we use the aggregate of ACTIVE listings as a proxy for
 * "current neighborhood price level." This slightly overstates ARV vs. true
 * sale-price comps but tracks the same signal Kelly uses manually.
 *
 * Flagged on the analysis row as `verified=false` so Kelly knows it's
 * listing-based, not sold-comp-based.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ZipStats {
  /** avg asking $/sqft across active listings in this zip */
  avgPerSqft: number
  /** median asking $/sqft (more robust to outliers) */
  medianPerSqft: number
  /** number of analyzable listings (has price and sqft) */
  sampleCount: number
}

export type ZipStatsMap = Map<string, ZipStats>

/**
 * Load zip stats for every Austin zip with ≥ minSample analyzable properties.
 * Intended to be called once per cron run, then passed to analyzeDeal per-property.
 */
export async function loadZipStats(
  supabase: SupabaseClient,
  minSample: number = 3,
): Promise<ZipStatsMap> {
  const stats: ZipStatsMap = new Map()

  // Page through all rows with positive price + sqft. Supabase REST caps at 1000
  // per page by default, so iterate until empty.
  const perPage = 1000
  let offset = 0
  const buckets = new Map<string, number[]>() // zip → [$/sqft, ...]

  while (true) {
    const { data, error } = await supabase
      .from('properties')
      .select('zip_code, asking_price, sqft')
      .gt('asking_price', 0)
      .gt('sqft', 0)
      .eq('listing_status', 'Active')
      .range(offset, offset + perPage - 1)

    if (error) {
      console.error('[zip-stats] fetch error:', error)
      break
    }
    if (!data || data.length === 0) break

    for (const row of data) {
      const zip = row.zip_code
      if (!zip) continue
      const perSqft = (row.asking_price as number) / (row.sqft as number)
      if (!Number.isFinite(perSqft) || perSqft <= 0) continue
      if (!buckets.has(zip)) buckets.set(zip, [])
      buckets.get(zip)!.push(perSqft)
    }

    if (data.length < perPage) break
    offset += perPage
  }

  Array.from(buckets).forEach(([zip, prices]: [string, number[]]) => {
    if (prices.length < minSample) return
    prices.sort((a: number, b: number) => a - b)
    const avg = prices.reduce((s: number, p: number) => s + p, 0) / prices.length
    const median = prices[Math.floor(prices.length / 2)]
    stats.set(zip, {
      avgPerSqft: Math.round(avg * 100) / 100,
      medianPerSqft: Math.round(median * 100) / 100,
      sampleCount: prices.length,
    })
  })

  return stats
}
