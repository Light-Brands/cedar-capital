/**
 * Lead Source Adapter Registry
 * Central lookup of every source by slug. Used by:
 *   - /api/sources/[slug]/test to resolve testConnection()
 *   - The discover cron to iterate enabled listings adapters
 *
 * When adding a new source:
 *   1. Create the adapter file (e.g. src/lib/api/foo.ts exporting fooAdapter)
 *   2. Import it here and add to the ADAPTERS record
 *   3. Insert a row into lead_sources (migration or seed)
 */

import type { LeadSourceAdapter } from './source-adapter'
import { rentcastAdapter } from './rentcast'
import { realtyInUsAdapter } from './realty-in-us'
import { realtor16Adapter } from './realtor16'

export const ADAPTERS: Record<string, LeadSourceAdapter> = {
  [rentcastAdapter.slug]: rentcastAdapter,
  [realtyInUsAdapter.slug]: realtyInUsAdapter,
  [realtor16Adapter.slug]: realtor16Adapter,
  // redfin_rapidapi: redfinAdapter — URL schema needs Austin city ID tuning
  // loopnet: loopnetAdapter — commercial, disabled by default
  // craigslist_austin: craigslistAdapter — pending ToS decision
  // attom / batchdata / estated are existing modules not yet wrapped as adapters
}

export function getAdapter(slug: string): LeadSourceAdapter | null {
  return ADAPTERS[slug] ?? null
}

export function listAdapters(): LeadSourceAdapter[] {
  return Object.values(ADAPTERS)
}

export function listListingsAdapters() {
  return listAdapters().filter(a => a.kind === 'listings')
}
