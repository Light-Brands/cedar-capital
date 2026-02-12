/**
 * Trigger re-analysis of a single property.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'
import { getComps, getPropertyValuation } from '@/lib/api/sources'
import { analyzeDeal, toAnalysisInsert } from '@/lib/analysis/deal-analyzer'
import { filterComps, analyzeComps, type CompSale } from '@/lib/analysis/comps'
import type { SalesComp } from '@/lib/api/types'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()

  // Get property
  const { data: property, error: propError } = await supabase
    .from('properties')
    .select('*')
    .eq('id', params.id)
    .single()

  if (propError || !property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  try {
    // Get valuation
    const valuation = await getPropertyValuation(
      property.address,
      property.city,
      property.state,
      property.zip_code ?? ''
    )

    // Get comps
    const rawComps = await getComps(property.address, property.zip_code ?? '')
    const compSales: CompSale[] = rawComps.map((c: SalesComp) => ({
      address: c.address,
      salePrice: c.salePrice,
      sqft: c.sqft,
      beds: c.beds,
      baths: c.baths,
      saleDate: c.saleDate,
      distanceMiles: c.distanceMiles,
    }))

    const filteredComps = filterComps(compSales, property.sqft ?? 1500)
    const compAnalysis = analyzeComps(filteredComps, property.sqft ?? 1500)

    // Allow manual overrides from request body
    const body = await request.json().catch(() => ({}))

    const arv = body.arv ?? valuation?.estimatedValue ?? compAnalysis.estimatedARV ?? 0
    const result = analyzeDeal({
      property,
      arv: arv > 0 ? arv : undefined,
      offerPrice: body.offerPrice,
      rehabLevel: body.rehabLevel,
      compAnalysis: compAnalysis.compCount > 0 ? compAnalysis : undefined,
      distressSignal: property.list_type ?? undefined,
    })

    // Save new analysis first, then clean up old ones (prevents data loss if insert fails)
    const insert = toAnalysisInsert(params.id, result)
    const { data: analysis, error } = await supabase
      .from('analyses')
      .insert(insert)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Delete old analyses for this property (keep the new one)
    await supabase
      .from('analyses')
      .delete()
      .eq('property_id', params.id)
      .neq('id', analysis.id)

    return NextResponse.json(analysis)
  } catch (err) {
    console.error('Re-analysis error:', err)
    return NextResponse.json(
      { error: 'Analysis failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
