/**
 * POST /api/properties/:id/enrich/:source
 *
 * Per-row manual enrichment, triggered by the buttons in PropertyTable.
 * :source is 'batchdata' (skip-trace / distress), 'rentcast_avm' (real sold comps),
 * 'attom_detail' (ATTOM property detail + condition + absentee), or 'attom_avm'
 * (ATTOM AVM + LTV + lendable equity + ARV recompute).
 *
 * Each variant:
 *   1. Pulls the property from DB.
 *   2. Hits the third-party API for this one property.
 *   3. Persists enriched data + raw payload to a jsonb column for replay.
 *   4. Re-runs analyze for this property so badge/score/verified update inline.
 *   5. Returns a compact summary the UI flashes on the row.
 *
 * No mass processing — one property per request by design.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'
import type { Property } from '@/lib/supabase/types'
import * as batchdata from '@/lib/api/batchdata'
import * as rentcast from '@/lib/api/rentcast'
import * as attom from '@/lib/api/attom'
import { progressiveFilterComps, analyzeComps, type CompSale } from '@/lib/analysis/comps'
import { analyzeDeal, toAnalysisInsert } from '@/lib/analysis/deal-analyzer'
import { calculateArv, type Condition } from '@/lib/analysis/arv-engine'
import { classifyAll, extractDescription } from '@/lib/analysis/classify-description'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; source: string } },
) {
  const { id, source } = params
  const supabase = createServerClient()

  const { data: property, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (!property) {
    return NextResponse.json({ ok: false, error: 'Property not found' }, { status: 404 })
  }

  try {
    switch (source) {
      case 'batchdata':
        return await enrichBatchData(supabase, property as Property)
      case 'rentcast_avm':
        return await enrichRentcastAvm(supabase, property as Property)
      case 'attom_detail':
      case 'attom_avm':
        // Both ATTOM cases hit enrichByAddress() which fetches detail + AVM in
        // a single call. The two sources are kept distinct in the UI so users
        // can label which button they pressed, but the underlying work is the
        // same — there's no benefit to splitting the calls.
        return await enrichAttom(supabase, property as Property, source)
      default:
        return NextResponse.json(
          { ok: false, error: `Unknown source "${source}". Expected batchdata, rentcast_avm, attom_detail, or attom_avm.` },
          { status: 400 },
        )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[enrich/${source}] uncaught:`, err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

// ============================================================
// BatchData: skip trace + distress
// ============================================================

async function enrichBatchData(
  supabase: ReturnType<typeof createServerClient>,
  property: Property,
) {
  if (!process.env.BATCHDATA_API_KEY) {
    return NextResponse.json({
      ok: false,
      needsConfig: true,
      error: 'BATCHDATA_API_KEY not configured. Set it in Vercel env and redeploy.',
    })
  }

  // Our stored address is the full "street, city, state zip" string but
  // BatchData expects just the street portion — otherwise the match fails.
  const streetOnly = property.address.split(',')[0].trim()
  const owner = await batchdata.skipTrace(
    streetOnly,
    property.city,
    property.state,
    property.zip_code ?? '',
  )

  if (!owner) {
    await supabase
      .from('properties')
      .update({ last_enriched_at: new Date().toISOString() })
      .eq('id', property.id)
    return NextResponse.json({
      ok: false,
      message: 'No BatchData match for this address',
    })
  }

  // Extract a distress signal from the raw response (varies per provider —
  // BatchData returns flags like `preforeclosure`, `taxDelinquent`, `probate`,
  // `vacant`, `codeViolation` under property.* or owner.*).
  const distress = extractDistressSignal(owner.rawData)

  const { error: leadErr } = await supabase.from('leads').upsert(
    {
      property_id: property.id,
      owner_name: owner.ownerName ?? null,
      owner_type: owner.ownerType ?? null,
      mailing_address: owner.mailingAddress ?? null,
      phone_numbers: owner.phoneNumbers.length > 0 ? owner.phoneNumbers : null,
      email_addresses: owner.emailAddresses.length > 0 ? owner.emailAddresses : null,
      is_absentee: owner.isAbsentee ?? null,
      is_owner_occupied: owner.isOwnerOccupied ?? null,
      ownership_length_years: owner.ownershipLengthYears ?? null,
      estimated_equity: owner.estimatedEquity ?? null,
      mortgage_balance: owner.mortgageBalance ?? null,
      skip_trace_data: JSON.parse(JSON.stringify(owner.rawData)),
    },
    { onConflict: 'property_id' },
  )
  if (leadErr) {
    console.error('[enrich/batchdata] lead upsert failed:', leadErr.message)
  }

  // Patch distress + refreshed timestamp onto properties so scoring picks it up
  const { error: propErr } = await supabase
    .from('properties')
    .update({
      distress_signal: distress,
      is_absentee: owner.isAbsentee ?? property.is_absentee,
      last_enriched_at: new Date().toISOString(),
    })
    .eq('id', property.id)
  if (propErr) {
    console.error('[enrich/batchdata] property update failed:', propErr.message)
  }

  // Re-run analyze with the new distress signal
  const enriched = { ...property, distress_signal: distress }
  const reanalysis = await reanalyzeOne(supabase, enriched as Property)

  return NextResponse.json({
    ok: true,
    source: 'batchdata',
    owner: {
      name: owner.ownerName,
      phones: owner.phoneNumbers,
      emails: owner.emailAddresses,
      isAbsentee: owner.isAbsentee,
      ownershipLengthYears: owner.ownershipLengthYears,
      estimatedEquity: owner.estimatedEquity,
    },
    distress,
    reanalysis,
  })
}

function extractDistressSignal(raw: Record<string, unknown>): string | null {
  const flat = JSON.stringify(raw).toLowerCase()
  if (/pre[- ]?foreclosure|notice of default|lis pendens/.test(flat)) return 'Pre-foreclosure'
  if (/tax.*delinqu|delinquent.*tax/.test(flat)) return 'Tax delinquent'
  if (/probate|inheritance/.test(flat)) return 'Probate'
  if (/\bvacant\b|\bvacancy\b/.test(flat)) return 'Vacant'
  if (/\breo\b|bank[- ]owned/.test(flat)) return 'REO'
  if (/code violation/.test(flat)) return 'Code violation'
  if (/auction/.test(flat)) return 'Auction'
  if (/divorce/.test(flat)) return 'Divorce'
  return null
}

// ============================================================
// Rentcast AVM: real sold comps
// ============================================================

async function enrichRentcastAvm(
  supabase: ReturnType<typeof createServerClient>,
  property: Property,
) {
  if (!process.env.RENTCAST_API_KEY) {
    return NextResponse.json({
      ok: false,
      needsConfig: true,
      error: 'RENTCAST_API_KEY not configured.',
    })
  }

  // Same caveat as batchdata — address is pre-formatted; most external APIs
  // expect just the street portion.
  const streetOnly = property.address.split(',')[0].trim()

  // Progressive radius: pull up to 20 comps from Rentcast (one API call
  // regardless of radius), then widen the filter until we hit 3 comps so
  // rural / low-density properties don't hard-fail at 0.5mi.
  const allComps = await rentcast.getSalesComps(
    streetOnly,
    property.city,
    property.state,
    property.zip_code ?? '',
    5.0, // wide pull — we filter down progressively below
    20,
  )

  if (allComps.length === 0) {
    await supabase
      .from('properties')
      .update({ last_enriched_at: new Date().toISOString() })
      .eq('id', property.id)
    return NextResponse.json({
      ok: false,
      message: 'Rentcast returned no comparables for this address',
    })
  }

  const compSales: CompSale[] = allComps.map(c => ({
    address: c.address,
    salePrice: c.salePrice,
    sqft: c.sqft,
    beds: c.beds,
    baths: c.baths,
    saleDate: c.saleDate,
    distanceMiles: c.distanceMiles,
  }))

  // Progressive filter — try strict first, loosen until we have ≥3 comps.
  const { filtered, tier, radius: effectiveRadius } = progressiveFilterComps(
    compSales,
    property.sqft ?? 1500,
  )
  const compAnalysis = analyzeComps(filtered, property.sqft ?? 1500)

  // If we only landed comps at the loosest "best available" tier with < 3
  // matches, they're probably dissimilar (e.g. a small house in a subdivision
  // of larger homes). Don't let them drive ARV — let the analyzer fall back
  // to TCAD market_value which is usually more grounded in that scenario.
  const bestAvailableTier = 'best available (5mi, any size)'
  const trustComps = tier !== bestAvailableTier && compAnalysis.compCount >= 3

  const reanalysis = await reanalyzeOne(
    supabase,
    property,
    trustComps ? compAnalysis : undefined,
  )

  await supabase
    .from('properties')
    .update({ last_enriched_at: new Date().toISOString() })
    .eq('id', property.id)

  return NextResponse.json({
    ok: true,
    source: 'rentcast_avm',
    compCount: compAnalysis.compCount,
    effectiveRadius,
    tier,
    trustComps,
    rawCompsReturned: allComps.length,
    estimatedARV: compAnalysis.estimatedARV,
    avgPricePerSqft: compAnalysis.avgPricePerSqft,
    verified: compAnalysis.compCount >= 3,
    reanalysis,
  })
}

// ============================================================
// ATTOM: detail + AVM + ARV recompute + description re-classify
// ============================================================

async function enrichAttom(
  supabase: ReturnType<typeof createServerClient>,
  property: Property,
  uiSource: 'attom_detail' | 'attom_avm',
) {
  if (!process.env.ATTOM_API_KEY) {
    return NextResponse.json({
      ok: false,
      needsConfig: true,
      error: 'ATTOM_API_KEY not configured. Set it in Vercel env and redeploy.',
    })
  }

  const streetOnly = property.address.split(',')[0].trim()
  const enrichment = await attom.enrichByAddress(streetOnly, property.zip_code ?? '')

  if (!enrichment || (enrichment.endpointsHit.length === 0)) {
    await supabase
      .from('properties')
      .update({ last_enriched_at: new Date().toISOString() })
      .eq('id', property.id)
    return NextResponse.json({
      ok: false,
      message: enrichment?.endpointsSkipped[0]?.reason ?? 'ATTOM returned no data for this address',
      skipped: enrichment?.endpointsSkipped ?? [],
    })
  }

  // Re-classify combining structural signals (always available — realtor16
  // description.type, rentcast propertyType, foreclosure flags, distress) with
  // freeform text if any was captured. Mirrors the SQL backfill logic from
  // migration 006 so runtime + batch results stay consistent.
  const propRaw = property as unknown as Record<string, unknown>
  const existingDescription = (propRaw.description as string | null) ?? null
  const { text: extractedText, source: extractedSource } = existingDescription
    ? { text: null, source: null }
    : extractDescription(property.raw_data)
  const description = existingDescription ?? extractedText

  const classification = classifyAll({
    description,
    rawData: property.raw_data,
    distressSignal: property.distress_signal,
  })

  const descriptionUpdate: Record<string, unknown> = {
    description_categories: classification.categories,
    description_flags: classification.flags,
    description_classified_at: new Date().toISOString(),
    ...(extractedText
      ? { description: extractedText, description_source: extractedSource }
      : {}),
  }

  // Recompute ARV using ATTOM AVM + condition + existing comp signals
  // (compMedianPsf is loaded from the latest analyses row if present).
  const { data: latestAnalysis } = await supabase
    .from('analyses')
    .select('comp_avg_per_sqft, comp_addresses')
    .eq('property_id', property.id)
    .maybeSingle()

  const compAddrs = (latestAnalysis as { comp_addresses?: string[] | null } | null)?.comp_addresses ?? null
  const arv = calculateArv({
    attomAvmValue: enrichment.avmValue,
    attomAvmLow: enrichment.avmLow,
    attomAvmHigh: enrichment.avmHigh,
    attomAvmScore: enrichment.avmScore,
    attomCondition: (enrichment.condition?.toUpperCase() ?? null) as Condition,
    rentcastCompPsf: (latestAnalysis as { comp_avg_per_sqft?: number } | null)?.comp_avg_per_sqft ?? null,
    rentcastCompCount: compAddrs ? compAddrs.length : null,
    subjectSqft: property.sqft ?? null,
    tcadMarketValue: property.market_value ?? null,
  })

  // Persist ATTOM extracted fields + raw payloads + new ARV range
  const { error: propErr } = await supabase
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
      last_enriched_at: new Date().toISOString(),
      ...descriptionUpdate,
    })
    .eq('id', property.id)

  if (propErr) {
    console.error('[enrich/attom] property update failed:', propErr.message)
    return NextResponse.json({ ok: false, error: propErr.message }, { status: 500 })
  }

  // Re-run analyze so the badge / score reflects the new ARV range mid-point
  const reanalysis = await reanalyzeOne(supabase, property as Property)

  return NextResponse.json({
    ok: true,
    source: uiSource,
    attomId: enrichment.attomId,
    endpointsHit: enrichment.endpointsHit,
    endpointsSkipped: enrichment.endpointsSkipped,
    avm: {
      value: enrichment.avmValue,
      low: enrichment.avmLow,
      high: enrichment.avmHigh,
      score: enrichment.avmScore,
    },
    homeEquity: {
      ltv: enrichment.ltv,
      lendableEquity: enrichment.lendableEquity,
      totalLoanBalance: enrichment.totalLoanBalance,
    },
    building: {
      condition: enrichment.condition,
      quality: enrichment.quality,
      yearBuiltEffective: enrichment.yearBuiltEffective,
      absenteeInd: enrichment.absenteeInd,
    },
    arv: {
      low: arv.arvLow,
      mid: arv.arvMid,
      high: arv.arvHigh,
      confidence: arv.confidence,
    },
    description: descriptionUpdate.description ?? existingDescription ?? null,
    descriptionCategories: descriptionUpdate.description_categories ?? null,
    reanalysis,
  })
}

// ============================================================
// Re-analyze helper (per-property)
// ============================================================

async function reanalyzeOne(
  supabase: ReturnType<typeof createServerClient>,
  property: Property,
  compAnalysis?: ReturnType<typeof analyzeComps>,
) {
  // Cheap per-zip avg: fetch active listings in this zip, compute on the fly.
  let zipAvgPerSqft: number | undefined
  if (property.zip_code) {
    const { data: zipRows } = await supabase
      .from('properties')
      .select('asking_price, sqft')
      .eq('zip_code', property.zip_code)
      .eq('listing_status', 'Active')
      .gt('asking_price', 0)
      .gt('sqft', 0)
      .limit(500)
    const prices = (zipRows ?? [])
      .map(r => (r.asking_price as number) / (r.sqft as number))
      .filter(n => Number.isFinite(n) && n > 0)
    if (prices.length >= 3) {
      zipAvgPerSqft = prices.reduce((s, p) => s + p, 0) / prices.length
    }
  }

  const result = analyzeDeal({
    property,
    compAnalysis: compAnalysis && compAnalysis.compCount > 0 ? compAnalysis : undefined,
    zipAvgPerSqft,
    distressSignal: property.distress_signal ?? property.list_type ?? undefined,
  })

  const insert = toAnalysisInsert(property.id, result)
  const { error } = await supabase.from('analyses').upsert(insert, { onConflict: 'property_id' })
  if (error) {
    console.error(`[reanalyzeOne] upsert failed for ${property.id}:`, error.message)
    return null
  }

  return {
    arv: result.arv,
    roi: result.roi,
    mao: result.mao,
    wholesale_profit: result.wholesaleProfit,
    discount_pct: result.discountPct,
    verified: result.verified,
    deal_score_numeric: result.score.totalScore,
    badge: result.badge,
  }
}
