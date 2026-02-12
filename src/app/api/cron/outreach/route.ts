/**
 * Cron: Process outreach queue
 * Runs 45 minutes after discover. Sends SMS/email to A/B leads.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { processOutreachQueue } from '@/lib/outreach/queue'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stats = await processOutreachQueue()

    return NextResponse.json({
      success: true,
      ...stats,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Outreach cron error:', err)
    return NextResponse.json(
      { error: 'Outreach failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
