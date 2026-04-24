/**
 * Discovery Orchestrator
 * Iterates every enabled listings source, runs its adapter, upserts properties,
 * and records a sync event for each run. Called by /api/cron/discover.
 *
 * Per-source isolation: one adapter's failure does not abort others.
 * Every run gets a lead_source_syncs row for audit.
 */

import { createServerClient } from '@/lib/supabase/client'
import type { PropertyInsert } from '@/lib/supabase/types'
import type { DiscoveredProperty } from './types'
import { getAdapter } from './registry'

export interface PerSourceResult {
  slug: string
  status: 'success' | 'failed' | 'skipped'
  discovered: number
  saved: number
  durationMs: number
  error?: string
}

export interface DiscoverSummary {
  totalDiscovered: number
  totalSaved: number
  sources: PerSourceResult[]
}

export async function runDiscover(): Promise<DiscoverSummary> {
  const supabase = createServerClient()

  // Load enabled listings sources and Austin zip codes in parallel
  const [sourcesRes, zipRes] = await Promise.all([
    supabase
      .from('lead_sources')
      .select('slug, total_synced_count, total_errors_count')
      .eq('enabled', true)
      .eq('kind', 'listings'),
    supabase
      .from('austin_zip_codes')
      .select('zip_code')
      .eq('is_active', true),
  ])

  const sources = sourcesRes.data ?? []
  const zipCodes = (zipRes.data ?? []).map(z => z.zip_code)

  if (sources.length === 0) {
    return { totalDiscovered: 0, totalSaved: 0, sources: [] }
  }
  if (zipCodes.length === 0) {
    return { totalDiscovered: 0, totalSaved: 0, sources: [] }
  }

  const results: PerSourceResult[] = []

  // Sources run sequentially to keep rate-limit exposure predictable and memory bounded
  for (const source of sources) {
    results.push(await runSource(source.slug, source.total_synced_count ?? 0, source.total_errors_count ?? 0, zipCodes))
  }

  return {
    totalDiscovered: results.reduce((s, r) => s + r.discovered, 0),
    totalSaved: results.reduce((s, r) => s + r.saved, 0),
    sources: results,
  }
}

async function runSource(
  slug: string,
  priorSynced: number,
  priorErrors: number,
  zipCodes: string[],
): Promise<PerSourceResult> {
  const supabase = createServerClient()
  const adapter = getAdapter(slug)

  if (!adapter || adapter.kind !== 'listings') {
    return {
      slug,
      status: 'skipped',
      discovered: 0,
      saved: 0,
      durationMs: 0,
      error: `No listings adapter registered for slug "${slug}"`,
    }
  }

  // Open a sync event for this run
  const { data: syncEvent } = await supabase
    .from('lead_source_syncs')
    .insert({ source_slug: slug, status: 'running' })
    .select('id')
    .single()
  const syncId = syncEvent?.id as string | undefined

  const start = Date.now()
  let discovered: DiscoveredProperty[] = []

  try {
    discovered = await adapter.discover({ zipCodes })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const durationMs = Date.now() - start
    await finalizeFailure(supabase, syncId, slug, priorErrors, message, durationMs)
    return { slug, status: 'failed', discovered: 0, saved: 0, durationMs, error: message }
  }

  let saved = 0
  for (const prop of discovered) {
    try {
      const insert = toPropertyInsert(prop)
      const { error } = await supabase
        .from('properties')
        .upsert(insert, { onConflict: 'address,zip_code', ignoreDuplicates: false })
      if (!error) saved++
      else console.error(`[discover/${slug}] upsert failed for ${prop.address}:`, error.message)
    } catch (err) {
      console.error(`[discover/${slug}] map error for ${prop.address}:`, err)
    }
  }

  const durationMs = Date.now() - start

  if (syncId) {
    await supabase
      .from('lead_source_syncs')
      .update({
        status: 'success',
        count: saved,
        duration_ms: durationMs,
        finished_at: new Date().toISOString(),
        metadata: { discovered: discovered.length, saved },
      })
      .eq('id', syncId)
  }

  await supabase
    .from('lead_sources')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: 'success',
      last_sync_count: saved,
      last_sync_duration_ms: durationMs,
      last_error: null,
      total_synced_count: priorSynced + saved,
    })
    .eq('slug', slug)

  return { slug, status: 'success', discovered: discovered.length, saved, durationMs }
}

async function finalizeFailure(
  supabase: ReturnType<typeof createServerClient>,
  syncId: string | undefined,
  slug: string,
  priorErrors: number,
  message: string,
  durationMs: number,
) {
  if (syncId) {
    await supabase
      .from('lead_source_syncs')
      .update({
        status: 'failed',
        duration_ms: durationMs,
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', syncId)
  }

  await supabase
    .from('lead_sources')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: 'failed',
      last_sync_duration_ms: durationMs,
      last_error: message,
      total_errors_count: priorErrors + 1,
    })
    .eq('slug', slug)
}

/**
 * Map a DiscoveredProperty into the full PropertyInsert shape, pulling the
 * adapter's `_agent_*` / `_listing_status` / `_brokerage` side-channel fields
 * out of rawData into first-class columns.
 */
function toPropertyInsert(prop: DiscoveredProperty): PropertyInsert {
  const raw = prop.rawData as Record<string, unknown>
  const listingStatus = (raw._listing_status as string | undefined) ?? 'Active'
  const licensingTag = (raw._licensing_tag as string | undefined) ?? null

  return {
    address: prop.address,
    city: prop.city,
    state: prop.state,
    zip_code: prop.zipCode,
    county: prop.county ?? null,
    lat: prop.lat ?? null,
    lng: prop.lng ?? null,
    beds: prop.beds ?? null,
    baths: prop.baths ?? null,
    sqft: prop.sqft ?? null,
    lot_size: prop.lotSize ?? null,
    year_built: prop.yearBuilt ?? null,
    property_type: prop.propertyType ?? null,
    list_type: prop.listType ?? null,
    source: prop.source,
    source_id: prop.sourceId,
    asking_price: prop.askingPrice ?? null,
    zestimate: prop.estimatedValue ?? null,
    tax_assessed_value: prop.taxAssessedValue ?? null,
    last_sale_price: prop.lastSalePrice ?? null,
    last_sale_date: prop.lastSaleDate ?? null,
    days_on_market: prop.daysOnMarket ?? null,
    link: prop.link ?? null,
    photos: prop.photos ?? null,
    agent_name: (raw._agent_name as string | null | undefined) ?? null,
    agent_phone: (raw._agent_phone as string | null | undefined) ?? null,
    agent_email: (raw._agent_email as string | null | undefined) ?? null,
    listing_status: isValidListingStatus(listingStatus) ? listingStatus : 'Unknown',
    licensing_tag: licensingTag,
    raw_data: JSON.parse(JSON.stringify(raw)),
  }
}

function isValidListingStatus(s: string): s is 'Active' | 'Pending' | 'Closed' | 'Expired' | 'Unknown' {
  return ['Active', 'Pending', 'Closed', 'Expired', 'Unknown'].includes(s)
}
