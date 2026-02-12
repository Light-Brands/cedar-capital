/**
 * Manual refresh trigger - runs the full discover → enrich → analyze pipeline.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { discoverProperties, saveDiscoveredProperties, getUnenrichedProperties, enrichWithOwnerInfo, getUnanalyzedProperties, getComps, getPropertyValuation } from '@/lib/api/sources'
import { createServerClient } from '@/lib/supabase/client'
import { analyzeDeal, toAnalysisInsert } from '@/lib/analysis/deal-analyzer'
import { filterComps, analyzeComps, type CompSale } from '@/lib/analysis/comps'
import type { SalesComp } from '@/lib/api/types'

export async function POST(request: NextRequest) {
  // Verify auth: if an Authorization header is provided, it must match CRON_SECRET.
  // Dashboard calls (same-origin, no auth header) are allowed through.
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  try {
    // Step 1: Discover
    const discovered = await discoverProperties()
    const newIds = await saveDiscoveredProperties(discovered)

    // Step 2: Enrich
    const unenriched = await getUnenrichedProperties(10)
    let enriched = 0
    for (const prop of unenriched) {
      const result = await enrichWithOwnerInfo(
        prop.id, prop.address, prop.city, prop.state, prop.zip_code ?? ''
      )
      if (result) enriched++
    }

    // Step 3: Analyze
    const unanalyzed = await getUnanalyzedProperties(10)
    let analyzed = 0
    for (const property of unanalyzed) {
      try {
        const valuation = await getPropertyValuation(
          property.address, property.city, property.state, property.zip_code ?? ''
        )
        const rawComps = await getComps(property.address, property.zip_code ?? '')
        const compSales: CompSale[] = rawComps.map((c: SalesComp) => ({
          address: c.address, salePrice: c.salePrice, sqft: c.sqft,
          beds: c.beds, baths: c.baths, saleDate: c.saleDate, distanceMiles: c.distanceMiles,
        }))
        const filteredComps = filterComps(compSales, property.sqft ?? 1500)
        const compAnalysis = analyzeComps(filteredComps, property.sqft ?? 1500)

        const arv = valuation?.estimatedValue ?? compAnalysis.estimatedARV ?? 0
        const result = analyzeDeal({
          property, arv: arv > 0 ? arv : undefined,
          compAnalysis: compAnalysis.compCount > 0 ? compAnalysis : undefined,
          distressSignal: property.list_type ?? undefined,
        })

        const insert = toAnalysisInsert(property.id, result)
        await supabase.from('analyses').insert(insert)
        analyzed++
      } catch (err) {
        console.error(`Refresh analysis error for ${property.address}:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      discovered: discovered.length,
      saved: newIds.length,
      enriched,
      analyzed,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Manual refresh error:', err)
    return NextResponse.json(
      { error: 'Refresh failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
