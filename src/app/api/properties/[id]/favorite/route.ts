/**
 * POST /api/properties/:id/favorite
 *
 * Toggles is_favorite on a property. Server-side because RLS blocks anon-key
 * updates from the browser.
 *
 * Body: { favorited: boolean }
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServerClient()

  let body: { favorited?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const favorited = body.favorited === true

  const { error } = await supabase
    .from('properties')
    .update({
      is_favorite: favorited,
      favorited_at: favorited ? new Date().toISOString() : null,
    })
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, favorited })
}
