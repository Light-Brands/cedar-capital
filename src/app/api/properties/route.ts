/**
 * Properties API - List and create properties
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'

export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const { searchParams } = new URL(request.url)

  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '50')
  const score = searchParams.get('score')
  const zip = searchParams.get('zip')
  const minPrice = searchParams.get('minPrice')
  const maxPrice = searchParams.get('maxPrice')
  const sort = searchParams.get('sort') ?? 'created_at'
  const order = searchParams.get('order') ?? 'desc'

  const offset = (page - 1) * limit

  let query = supabase
    .from('properties')
    .select(`
      *,
      analyses ( id, deal_score, deal_score_numeric, roi, mao, wholesale_profit, arv, offer_price, rehab_total, est_profit, profit_with_finance ),
      pipeline ( id, stage ),
      leads ( id, owner_name, phone_numbers, email_addresses )
    `, { count: 'exact' })

  if (zip) query = query.eq('zip_code', zip)
  if (minPrice) query = query.gte('asking_price', minPrice)
  if (maxPrice) query = query.lte('asking_price', maxPrice)
  if (score) query = query.eq('analyses.deal_score', score)

  query = query
    .order(sort, { ascending: order === 'asc' })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  })
}
