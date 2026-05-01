/**
 * Austin zip allowlist.
 *
 * Source of truth is the `austin_zip_codes` table in Supabase (seeded by schema.sql).
 * This module is a thin cache + helper layer. Every external API call that costs
 * money (ATTOM, BatchData, etc.) gates through `isAustinZip` so a stray Houston
 * lookup cannot drain the trial budget.
 *
 * The cache TTL is short (60s) to keep behavior predictable when the table is
 * edited via the dashboard while the dev server is running.
 */

import { createServerClient } from '@/lib/supabase/client'

let cache: { zips: Set<string>; expiresAt: number } | null = null
const CACHE_TTL_MS = 60 * 1000

async function loadActiveZips(): Promise<Set<string>> {
  if (cache && cache.expiresAt > Date.now()) return cache.zips

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('austin_zip_codes')
    .select('zip_code')
    .eq('is_active', true)

  if (error) {
    console.error('[austin-zips] failed to load active zips:', error.message)
    if (cache) return cache.zips
    return new Set()
  }

  const zips = new Set((data ?? []).map((r) => r.zip_code))
  cache = { zips, expiresAt: Date.now() + CACHE_TTL_MS }
  return zips
}

export async function getAustinZips(): Promise<string[]> {
  const set = await loadActiveZips()
  return Array.from(set)
}

export async function isAustinZip(zip: string | null | undefined): Promise<boolean> {
  if (!zip) return false
  const set = await loadActiveZips()
  return set.has(zip.trim().slice(0, 5))
}

export function clearAustinZipCache(): void {
  cache = null
}
