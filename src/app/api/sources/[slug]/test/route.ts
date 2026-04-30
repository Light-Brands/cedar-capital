/**
 * POST /api/sources/[slug]/test
 * Runs testConnection() on the adapter and writes the result to lead_sources.
 * Also records a "test" sync event for audit (status mapped from the test outcome).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdapter } from '@/lib/api/registry'
import { probeEntitlements } from '@/lib/api/attom'
import { createServerClient } from '@/lib/supabase/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params

  // ATTOM is special-cased: instead of a single connection check, probe all
  // five product endpoints and report which are entitled on this key. Lets
  // the dashboard show "3 of 5 products live, upgrade to unlock comps +
  // pre-foreclosure" rather than a binary success/fail.
  if (slug === 'attom') {
    return await runAttomProbe()
  }

  const adapter = getAdapter(slug)

  if (!adapter) {
    // Sources that exist in the DB but don't have an adapter wired yet
    // (e.g. batchdata / estated) — report needs_config gracefully.
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

async function runAttomProbe() {
  if (!process.env.ATTOM_API_KEY) {
    return NextResponse.json({
      slug: 'attom',
      ok: false,
      status: 'needs_config',
      message: 'ATTOM_API_KEY not configured. Set it in Vercel env and redeploy.',
    })
  }

  const supabase = createServerClient()
  const start = Date.now()
  try {
    const probe = await probeEntitlements()
    const latencyMs = Date.now() - start
    const entitledList = probe.entitled.filter((e) => e.entitled).map((e) => e.endpoint)
    const blockedList = probe.entitled.filter((e) => !e.entitled).map((e) => e.endpoint)

    await supabase
      .from('lead_sources')
      .update({
        last_sync_status: probe.ok ? 'success' : 'failed',
        last_error: probe.ok ? null : `Entitled: ${entitledList.join(', ') || 'none'}. Blocked: ${blockedList.join(', ') || 'none'}.`,
        updated_at: new Date().toISOString(),
      })
      .eq('slug', 'attom')

    return NextResponse.json({
      slug: 'attom',
      ok: probe.ok,
      status: probe.ok ? (blockedList.length > 0 ? 'partial' : 'success') : 'failing',
      message: probe.message,
      latencyMs,
      entitled: probe.entitled,
      summary: {
        entitledEndpoints: entitledList,
        blockedEndpoints: blockedList,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sources/attom/test] probe failed:', err)
    return NextResponse.json({ slug: 'attom', ok: false, status: 'failing', message }, { status: 500 })
  }
}
