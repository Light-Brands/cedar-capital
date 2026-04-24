/**
 * Cron: Discover — single source variant
 * GET /api/cron/discover/:slug
 *
 * Each listings source gets its own 300s budget via a dedicated cron entry in
 * vercel.json. Prevents the "all three in 5 min" timeout we hit on the first
 * unified run. When a source fails its health rolls up in /dashboard/sources.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { runDiscover } from '@/lib/api/discover-orchestrator'

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = params

  try {
    const summary = await runDiscover({ sourceSlug: slug })
    return NextResponse.json({
      success: true,
      slug,
      timestamp: new Date().toISOString(),
      ...summary,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron/discover/${slug}] uncaught:`, err)
    return NextResponse.json(
      { error: 'Discovery failed', slug, details: message },
      { status: 500 },
    )
  }
}
