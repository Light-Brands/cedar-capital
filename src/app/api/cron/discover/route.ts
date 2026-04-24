/**
 * Cron: Discover new active listings
 * Runs every 2 hours (see vercel.json). Iterates every enabled listings source
 * via the adapter registry, upserts properties, and logs a sync event per source.
 *
 * Kelly's self-verify rule: only rows with listing_status='Active' end up in the feed.
 * (Adapters filter at fetch time; non-Active rows never hit the DB.)
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — enough headroom for 3 sources × 58 zips

import { NextRequest, NextResponse } from 'next/server'
import { runDiscover } from '@/lib/api/discover-orchestrator'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runDiscover()
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...summary,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/discover] uncaught:', err)
    return NextResponse.json(
      { error: 'Discovery failed', details: message },
      { status: 500 },
    )
  }
}
