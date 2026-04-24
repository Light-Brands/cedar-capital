/**
 * POST /api/properties/:id/review-status
 * Cycles or sets review_status on a property row.
 * Body: { status: 'New' | 'Reviewed' | 'Contacted' | 'Dead' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['New', 'Reviewed', 'Contacted', 'Dead'] as const
type ReviewStatus = (typeof VALID_STATUSES)[number]

function isValid(s: unknown): s is ReviewStatus {
  return typeof s === 'string' && VALID_STATUSES.includes(s as ReviewStatus)
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params
  const body = await req.json().catch(() => ({}))
  const status = body?.status

  if (!isValid(status)) {
    return NextResponse.json(
      { error: `Invalid status. Expected one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    )
  }

  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('properties')
      .update({ review_status: status })
      .eq('id', id)
      .select('id, review_status')
      .maybeSingle()

    if (error) {
      console.error(`[properties/${id}/review-status] supabase error:`, error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[properties/${id}/review-status] uncaught:`, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
