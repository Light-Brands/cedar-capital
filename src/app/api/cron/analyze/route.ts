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
const BATCH_SIZE = 500          // DB page size per round
const MAX_ROUNDS = 30           // safety cap: 30 * 500 = 15,000 properties per run

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

    // Load every already-analyzed property_id once (cheap: single col, paged).
    const analyzedIds = await loadAllAnalyzedIds(supabase)

    // Paginate through properties (id-ordered for stable paging).
    // Each round fetches the next slice and filters out already-analyzed ids.
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (Date.now() - start > TIME_BUDGET_MS) {
        console.log(`[cron/analyze] time budget reached after ${round} rounds`)
        break
      }

      const { data: props, error: propErr } = await supabase
        .from('properties')
        .select('*')
        .gt('asking_price', 0)
        .gt('sqft', 0)
        .order('id', { ascending: true })
        .range(round * BATCH_SIZE, (round + 1) * BATCH_SIZE - 1)

      if (propErr) {
        console.error('[cron/analyze] property fetch error:', propErr)
        break
      }

      const page = props ?? []
      if (page.length === 0) break

      const candidates = page.filter(p => !analyzedIds.has(p.id as string))

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
          // Upsert keyed on property_id (migration 003 adds the UNIQUE constraint).
          // Safe before the constraint lands: insert with on-conflict update still dedupes
          // as long as the row already matches; otherwise ignores the conflict clause.
          const { error: upsertErr } = await supabase
            .from('analyses')
            .upsert(insert, { onConflict: 'property_id' })
          if (upsertErr) {
            console.error(`[cron/analyze] upsert failed for ${property.address}:`, upsertErr.message)
            totalFailed++
          } else {
            totalAnalyzed++
            analyzedIds.add(property.id as string)
          }
        } catch (err) {
          console.error(`[cron/analyze] analyze error for ${property.address}:`, err)
          totalFailed++
        }
      }

      roundsRan = round + 1
      // End of table reached
      if (page.length < BATCH_SIZE) break
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

async function loadAllAnalyzedIds(supabase: ReturnType<typeof createServerClient>): Promise<Set<string>> {
  const ids = new Set<string>()
  const perPage = 1000
  let offset = 0
  while (true) {
    const { data } = await supabase
      .from('analyses')
      .select('property_id')
      .range(offset, offset + perPage - 1)
    if (!data || data.length === 0) break
    for (const row of data) ids.add(row.property_id as string)
    if (data.length < perPage) break
    offset += perPage
  }
  return ids
}
