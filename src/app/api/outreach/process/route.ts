/**
 * Outreach Process API - manually trigger outreach queue processing.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { processOutreachQueue } from '@/lib/outreach/queue'

export async function POST(request: NextRequest) {
  // Verify auth: if an Authorization header is provided, it must match CRON_SECRET.
  // Dashboard calls (same-origin, no auth header) are allowed through.
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stats = await processOutreachQueue()
    return NextResponse.json({ success: true, ...stats })
  } catch (err) {
    console.error('Outreach process error:', err)
    return NextResponse.json(
      { error: 'Processing failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
