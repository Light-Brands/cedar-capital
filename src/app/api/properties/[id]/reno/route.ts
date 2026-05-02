/**
 * POST /api/properties/:id/reno
 *
 * Sets the operator-driven reno % override on a property and runs a fresh
 * deal analysis so all downstream numbers (rehab line items, MAO, ROI,
 * profit, deal score) update inline.
 *
 * Body: { pct: number | null }   // 5-30 range, or null to clear override
 *
 * Server-side write because RLS blocks anon-key updates to properties from
 * the browser. The deal_analyzer reads reno_override_pct off the property
 * row and overrides line-item rehab estimates when set.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'
import { analyzeDeal, toAnalysisInsert } from '@/lib/analysis/deal-analyzer'
import type { Property } from '@/lib/supabase/types'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()

  let body: { pct?: number | null } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const pct = body.pct === null || body.pct === undefined ? null : Number(body.pct)
  if (pct !== null && (Number.isNaN(pct) || pct < 1 || pct > 50)) {
    return NextResponse.json({ error: 'pct must be null or between 1 and 50' }, { status: 400 })
  }

  // 1) Persist the override on the property row
  const { error: updateErr } = await supabase
    .from('properties')
    .update({ reno_override_pct: pct })
    .eq('id', params.id)
  if (updateErr) {
    return NextResponse.json({ error: `update failed: ${updateErr.message}` }, { status: 500 })
  }

  // 2) Re-fetch the property so analyzeDeal sees the new override value
  const { data: property, error: fetchErr } = await supabase
    .from('properties')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()
  if (fetchErr || !property) {
    return NextResponse.json({ error: 'Property not found after update' }, { status: 500 })
  }

  // 3) Compute zip-stat ARV fallback (same shape as the analyze route)
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
      .map((r) => (r.asking_price as number) / (r.sqft as number))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (prices.length >= 3) {
      zipAvgPerSqft = prices.reduce((s, p) => s + p, 0) / prices.length
    }
  }

  // 4) Run the analyzer — it will pick up reno_override_pct off the property
  const result = analyzeDeal({
    property: property as Property,
    zipAvgPerSqft,
    distressSignal:
      (property as Property).distress_signal ??
      (property as Property).list_type ??
      undefined,
  })

  // 5) Upsert the fresh analysis
  const insert = toAnalysisInsert(params.id, result)
  const { data: analysis, error: upsertErr } = await supabase
    .from('analyses')
    .upsert(insert, { onConflict: 'property_id' })
    .select()
    .maybeSingle()
  if (upsertErr) {
    return NextResponse.json({ error: `analyses upsert failed: ${upsertErr.message}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    reno_override_pct: pct,
    analysis,
    rehab_total: result.rehab.total,
  })
}
