/**
 * GET /api/cron/attom-refresh
 *
 * Nightly job: refresh ATTOM data on hot leads whose attom_last_synced_at is
 * older than 30 days. Trial-budget-safe — capped to MAX_PER_RUN per invocation.
 *
 * The trial subscription gives us limited daily calls; this cron prioritizes
 * keeping our hottest leads fresh rather than enriching new properties.
 * (The bulk-discover-and-enrich path is `scripts/attom-backfill.sh`, run
 * manually when scope expands.)
 *
 * Schedule via vercel.json:
 *   { "path": "/api/cron/attom-refresh", "schedule": "0 7 * * *" }
 *
 * Authorization via CRON_SECRET to keep external callers off the endpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'
import { enrichByAddress } from '@/lib/api/attom'
import { calculateArv, type Condition } from '@/lib/analysis/arv-engine'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Trial budget: keep refreshes well under any conceivable daily cap.
// Each property = 2 ATTOM calls (detail + AVM). 25 props = 50 calls/day.
const MAX_PER_RUN = 25
const STALE_AFTER_DAYS = 30
const DELAY_MS = 250

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  if (!process.env.ATTOM_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ATTOM_API_KEY not configured' })
  }

  const supabase = createServerClient()
  const staleCutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Pick the hottest stale Austin leads. We don't have hot_score on the
  // properties row, so approximate: distressed OR multi_unit OR low LTV.
  const { data: candidates, error } = await supabase
    .from('properties')
    .select('id, address, zip_code, sqft, market_value, attom_id, attom_last_synced_at, distress_signal, description_categories, attom_ltv')
    .or('attom_last_synced_at.is.null,attom_last_synced_at.lt.' + staleCutoff)
    .not('zip_code', 'is', null)
    .or('description_categories.cs.{distressed},description_categories.cs.{multi_unit},attom_ltv.lte.30')
    .limit(MAX_PER_RUN * 2) // pull extra to account for filtering

  if (error) {
    console.error('[cron/attom-refresh] candidate fetch failed:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Filter to those with addresses and zips we can use
  const targets = (candidates ?? [])
    .filter((c) => c.address && c.zip_code)
    .slice(0, MAX_PER_RUN)

  let enriched = 0
  let skipped = 0
  let errors = 0

  for (const t of targets) {
    try {
      const street = t.address.split(',')[0].trim()
      const enrichment = await enrichByAddress(street, t.zip_code as string)
      if (!enrichment || enrichment.endpointsHit.length === 0) {
        skipped++
        continue
      }

      const arv = calculateArv({
        attomAvmValue: enrichment.avmValue,
        attomAvmLow: enrichment.avmLow,
        attomAvmHigh: enrichment.avmHigh,
        attomAvmScore: enrichment.avmScore,
        attomCondition: (enrichment.condition?.toUpperCase() ?? null) as Condition,
        rentcastCompPsf: null,
        rentcastCompCount: null,
        subjectSqft: (t as { sqft?: number | null }).sqft ?? null,
        tcadMarketValue: (t as { market_value?: number | null }).market_value ?? null,
      })

      await supabase
        .from('properties')
        .update({
          attom_id: enrichment.attomId,
          attom_data: enrichment.detail ? JSON.parse(JSON.stringify(enrichment.detail)) : null,
          attom_avm: enrichment.avm ? JSON.parse(JSON.stringify(enrichment.avm)) : null,
          attom_avm_value: enrichment.avmValue,
          attom_avm_low: enrichment.avmLow,
          attom_avm_high: enrichment.avmHigh,
          attom_avm_score: enrichment.avmScore,
          attom_ltv: enrichment.ltv,
          attom_lendable_equity: enrichment.lendableEquity,
          attom_total_loan_balance: enrichment.totalLoanBalance,
          attom_condition: enrichment.condition,
          attom_quality: enrichment.quality,
          attom_year_built_effective: enrichment.yearBuiltEffective,
          attom_absentee_ind: enrichment.absenteeInd,
          attom_last_synced_at: new Date().toISOString(),
          arv_low: arv.arvLow,
          arv_mid: arv.arvMid,
          arv_high: arv.arvHigh,
          arv_confidence: arv.confidence,
          arv_signals: JSON.parse(JSON.stringify(arv.signals)),
          arv_calculated_at: new Date().toISOString(),
        })
        .eq('id', t.id)

      enriched++
      await new Promise((r) => setTimeout(r, DELAY_MS))
    } catch (err) {
      errors++
      console.error('[cron/attom-refresh] error on', t.id, err)
    }
  }

  return NextResponse.json({
    ok: true,
    examined: targets.length,
    enriched,
    skipped,
    errors,
    staleAfterDays: STALE_AFTER_DAYS,
    capPerRun: MAX_PER_RUN,
  })
}
