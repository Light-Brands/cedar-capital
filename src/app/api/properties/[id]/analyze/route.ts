/**
 * POST /api/properties/:id/analyze
 *
 * Triggers a manual re-analysis of a single property from the detail page.
 * Uses the same zip-stats-backed path as the cron + enrich flows so it never
 * requires an ATTOM key, and supports manual overrides from the request body:
 *
 *   { arv?: number, offerPrice?: number, rehabLevel?: 'light'|'medium'|'heavy' }
 *
 * Returns the fresh analysis row so the UI can merge it in place.
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

  const { data: property, error: propError } = await supabase
    .from('properties')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (propError) {
    return NextResponse.json({ error: propError.message }, { status: 500 })
  }
  if (!property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  try {
    const body = await request.json().catch(() => ({}))

    // Fetch zip-stats lazily for this one zip
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
      property: property as Property,
      arv: body.arv,
      offerPrice: body.offerPrice,
      rehabLevel: body.rehabLevel,
      zipAvgPerSqft,
      distressSignal:
        (property as Property).distress_signal ??
        (property as Property).list_type ??
        undefined,
    })

    const insert = toAnalysisInsert(params.id, result)
    const { data: analysis, error } = await supabase
      .from('analyses')
      .upsert(insert, { onConflict: 'property_id' })
      .select()
      .maybeSingle()

    if (error) {
      console.error(`[properties/${params.id}/analyze] upsert failed:`, error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(analysis)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[properties/${params.id}/analyze] uncaught:`, err)
    return NextResponse.json({ error: 'Analysis failed', details: message }, { status: 500 })
  }
}
