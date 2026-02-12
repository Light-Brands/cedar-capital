/**
 * Pipeline API - Get pipeline entries and update stages.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'

export async function GET() {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('pipeline')
    .select(`
      *,
      properties ( id, address, city, zip_code, beds, baths, sqft, asking_price ),
      analyses ( id, deal_score, deal_score_numeric, roi, mao, wholesale_profit, arv, est_profit )
    `)
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const supabase = createServerClient()
  const body = await request.json()
  const { id, stage, notes, assigned_to, next_action, next_action_date } = body

  if (!id) {
    return NextResponse.json({ error: 'Pipeline entry ID required' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (stage) update.stage = stage
  if (notes !== undefined) update.notes = notes
  if (assigned_to !== undefined) update.assigned_to = assigned_to
  if (next_action !== undefined) update.next_action = next_action
  if (next_action_date !== undefined) update.next_action_date = next_action_date

  const { data, error } = await supabase
    .from('pipeline')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
