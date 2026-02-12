/**
 * Cron: Discover new distressed properties
 * Runs every 2 hours. Queries ATTOM for new pre-foreclosure and distressed listings.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { discoverProperties, saveDiscoveredProperties } from '@/lib/api/sources'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const properties = await discoverProperties()
    const newIds = await saveDiscoveredProperties(properties)

    return NextResponse.json({
      success: true,
      discovered: properties.length,
      newlySaved: newIds.length,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Discover cron error:', err)
    return NextResponse.json(
      { error: 'Discovery failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
