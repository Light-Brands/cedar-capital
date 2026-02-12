/**
 * Cron: Analyze unanalyzed properties
 * Runs 30 minutes after discover. Runs the full deal analysis engine.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'
import { getUnanalyzedProperties, getComps, getPropertyValuation } from '@/lib/api/sources'
import { analyzeDeal, toAnalysisInsert } from '@/lib/analysis/deal-analyzer'
import { filterComps, analyzeComps, type CompSale } from '@/lib/analysis/comps'
import type { SalesComp } from '@/lib/api/types'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  try {
    const properties = await getUnanalyzedProperties(20)
    let analyzed = 0
    let failed = 0

    for (const property of properties) {
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

        // Run deal analysis
        const arv = valuation?.estimatedValue ?? compAnalysis.estimatedARV ?? 0
        const result = analyzeDeal({
          property,
          arv: arv > 0 ? arv : undefined,
          compAnalysis: compAnalysis.compCount > 0 ? compAnalysis : undefined,
          distressSignal: property.list_type ?? undefined,
        })

        // Save analysis
        const insert = toAnalysisInsert(property.id, result)
        const { data: analysisRow, error } = await supabase
          .from('analyses')
          .insert(insert)
          .select('id')
          .single()

        if (error) {
          console.error(`Failed to save analysis for ${property.address}:`, error)
          failed++
        } else {
          analyzed++

          // Auto-create pipeline entry for A/B deals
          if (result.score.grade === 'A' || result.score.grade === 'B') {
            await supabase.from('pipeline').upsert({
              property_id: property.id,
              analysis_id: analysisRow.id,
              stage: 'new',
              notes: `Auto-scored ${result.score.grade} (${result.score.totalScore}/100). ROI: ${result.roi}%`,
            }, { onConflict: 'property_id' })
          }
        }
      } catch (err) {
        console.error(`Analysis error for ${property.address}:`, err)
        failed++
      }
    }

    return NextResponse.json({
      success: true,
      processed: properties.length,
      analyzed,
      failed,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Analyze cron error:', err)
    return NextResponse.json(
      { error: 'Analysis failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
