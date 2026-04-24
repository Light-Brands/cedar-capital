/**
 * POST /api/sources/[slug]/toggle
 * Flips the `enabled` flag on a lead_sources row.
 * Body: { enabled: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params
  const body = await req.json().catch(() => ({}))
  const enabled = Boolean(body?.enabled)

  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('lead_sources')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('slug', slug)
      .select('slug, enabled')
      .maybeSingle()

    if (error) {
      console.error(`[sources/${slug}/toggle] supabase error:`, error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: `Unknown source: ${slug}` }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[sources/${slug}/toggle] uncaught:`, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
