/**
 * Cron: Enrich properties with owner info (skip tracing)
 * Runs 15 minutes after discover. Processes unenriched properties.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUnenrichedProperties, enrichWithOwnerInfo } from '@/lib/api/sources'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const properties = await getUnenrichedProperties(20)
    let enriched = 0
    let failed = 0

    for (const prop of properties) {
      try {
        const result = await enrichWithOwnerInfo(
          prop.id,
          prop.address,
          prop.city,
          prop.state,
          prop.zip_code ?? ''
        )
        if (result) enriched++
      } catch (err) {
        console.error(`Enrich error for ${prop.address}:`, err)
        failed++
      }
    }

    return NextResponse.json({
      success: true,
      processed: properties.length,
      enriched,
      failed,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Enrich cron error:', err)
    return NextResponse.json(
      { error: 'Enrichment failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
