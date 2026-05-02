/**
 * POST /api/properties/:id/arv-bound
 *
 * Sets the operator-selected ARV bound (low / mid / high) on a property
 * and re-runs the deal analysis so all downstream numbers reflect the
 * chosen bound.
 *
 * Body: { bound: 'low' | 'mid' | 'high' | null }   // null clears, falls back to auto
 *
 * Same shape as /reno — server-side write to bypass RLS, plus an inline
 * re-analyze so the response carries the fresh analysis row.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'
import { analyzeDeal, toAnalysisInsert } from '@/lib/analysis/deal-analyzer'
import type { Property } from '@/lib/supabase/types'

const VALID = new Set(['low', 'mid', 'high', null])

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()

  let body: { bound?: 'low' | 'mid' | 'high' | null } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const bound = body.bound ?? null
  if (!VALID.has(bound)) {
    return NextResponse.json({ error: "bound must be 'low' | 'mid' | 'high' | null" }, { status: 400 })
  }

  const { error: updateErr } = await supabase
    .from('properties')
    .update({ arv_bound: bound })
    .eq('id', params.id)
  if (updateErr) {
    return NextResponse.json({ error: `update failed: ${updateErr.message}` }, { status: 500 })
  }

  const { data: property, error: fetchErr } = await supabase
    .from('properties')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()
  if (fetchErr || !property) {
    return NextResponse.json({ error: 'Property not found after update' }, { status: 500 })
  }

  // Zip-stat fallback for ARV (only used if neither bound nor any other signal lands)
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

  const result = analyzeDeal({
    property: property as Property,
    zipAvgPerSqft,
    distressSignal:
      (property as Property).distress_signal ??
      (property as Property).list_type ??
      undefined,
  })

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
    arv_bound: bound,
    analysis,
    arv: result.arv,
  })
}
