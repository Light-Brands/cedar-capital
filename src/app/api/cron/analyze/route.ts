/**
 * Cron: Analyze unanalyzed properties
 * Runs every 2 hours, 40 min after the discover pass.
 *
 * Strategy:
 *   1. Load zip-level avg $/sqft from our own active-listings table.
 *   2. Fetch the next batch of properties that don't yet have an analysis row.
 *   3. Compute ARV via Kelly's formula (nbhd avg $/sqft × sqft) when no real comps.
 *   4. Run analyzeDeal → insert analysis row with all Kelly 36-col fields + badge.
 *   5. Loop until close to Vercel's 300s cap, then return.
 *
 * Verified flag stays false because we're using listing-based comp proxy,
 * not sold-comp data. Once Rentcast AVM or ATTOM is available, comps take over
 * and verified flips to true automatically.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'
import { analyzeDeal, toAnalysisInsert } from '@/lib/analysis/deal-analyzer'
import { loadZipStats } from '@/lib/analysis/zip-stats'
import type { Property } from '@/lib/supabase/types'

const TIME_BUDGET_MS = 270_000 // leave 30s for overhead
const BATCH_SIZE = 500          // DB page size for fetching unanalyzed properties
const MAX_ROUNDS = 20           // safety cap: max iterations

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()
  const supabase = createServerClient()

  try {
    // Load zip stats once for the whole run
    const zipStats = await loadZipStats(supabase, 3)

    let totalAnalyzed = 0
    let totalFailed = 0
    let totalSkipped = 0
    let roundsRan = 0

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (Date.now() - start > TIME_BUDGET_MS) {
        console.log(`[cron/analyze] time budget reached after ${round} rounds`)
        break
      }

      // Fetch properties that don't yet have an analysis.
      // We use a left-join via .not('id', 'in', ...) style — but Supabase REST
      // doesn't support that cleanly, so do two queries and diff client-side.
      const { data: analyzedRows } = await supabase
        .from('analyses')
        .select('property_id')
        .limit(50_000)
      const analyzedIds = new Set((analyzedRows ?? []).map(r => r.property_id as string))

      const { data: props, error: propErr } = await supabase
        .from('properties')
        .select('*')
        .gt('asking_price', 0)
        .gt('sqft', 0)
        .order('created_at', { ascending: false })
        .limit(BATCH_SIZE)

      if (propErr) {
        console.error('[cron/analyze] property fetch error:', propErr)
        break
      }

      const candidates = (props ?? []).filter(p => !analyzedIds.has(p.id as string))
      if (candidates.length === 0) {
        console.log(`[cron/analyze] no more unanalyzed properties after ${round} rounds`)
        break
      }

      for (const property of candidates) {
        if (Date.now() - start > TIME_BUDGET_MS) break

        try {
          const zipStat = property.zip_code ? zipStats.get(property.zip_code) : undefined
          const zipAvg = zipStat?.avgPerSqft

          if (!zipAvg) {
            totalSkipped++
            continue
          }

          const result = analyzeDeal({
            property: property as unknown as Property,
            zipAvgPerSqft: zipAvg,
            distressSignal: property.list_type ?? undefined,
          })

          const insert = toAnalysisInsert(property.id as string, result)
          const { error: insertErr } = await supabase.from('analyses').insert(insert)
          if (insertErr) {
            console.error(`[cron/analyze] insert failed for ${property.address}:`, insertErr.message)
            totalFailed++
          } else {
            totalAnalyzed++
          }
        } catch (err) {
          console.error(`[cron/analyze] analyze error for ${property.address}:`, err)
          totalFailed++
        }
      }

      roundsRan = round + 1
      // If the fetched batch was smaller than BATCH_SIZE, we've exhausted candidates in this pass
      if (candidates.length < BATCH_SIZE) break
    }

    const durationMs = Date.now() - start
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      analyzed: totalAnalyzed,
      failed: totalFailed,
      skipped: totalSkipped,
      rounds: roundsRan,
      zipsInStats: zipStats.size,
      durationMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/analyze] uncaught:', err)
    return NextResponse.json(
      { error: 'Analysis failed', details: message },
      { status: 500 },
    )
  }
}
