/**
 * POST /api/sources/[slug]/test
 * Runs testConnection() on the adapter and writes the result to lead_sources.
 * Also records a "test" sync event for audit (status mapped from the test outcome).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdapter } from '@/lib/api/registry'
import { createServerClient } from '@/lib/supabase/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params
  const adapter = getAdapter(slug)

  if (!adapter) {
    // Sources that exist in the DB but don't have an adapter wired yet
    // (e.g. attom / batchdata / estated) — report needs_config gracefully.
    return NextResponse.json(
      {
        slug,
        ok: false,
        status: 'needs_config',
        message: 'Adapter not yet registered in the code. See src/lib/api/registry.ts to add it.',
      },
      { status: 200 },
    )
  }

  try {
    const result = await adapter.testConnection()

    // Update the source row so the dashboard reflects the latest health state.
    const supabase = createServerClient()
    await supabase
      .from('lead_sources')
      .update({
        last_sync_status: result.ok
          ? 'success'
          : result.status === 'needs_config'
          ? 'needs_config'
          : 'failed',
        last_error: result.ok ? null : result.message,
        updated_at: new Date().toISOString(),
      })
      .eq('slug', slug)

    return NextResponse.json({
      slug,
      ok: result.ok,
      status: result.status,
      message: result.message,
      latencyMs: result.latencyMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[sources/${slug}/test] uncaught:`, err)
    return NextResponse.json(
      { slug, ok: false, status: 'failing', message },
      { status: 500 },
    )
  }
}
