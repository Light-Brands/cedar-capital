/**
 * Shared contract for lead-source adapters.
 * Every listings/enrichment/skip-trace source implements this.
 */

import type { DiscoveredProperty, DiscoveryQuery, OwnerInfo } from './types'

export type SourceKind = 'listings' | 'enrichment' | 'skip_trace'

export type SyncStatus = 'success' | 'partial' | 'failed' | 'needs_config'

export interface SourceSyncResult {
  status: SyncStatus
  count: number
  durationMs: number
  errorMessage?: string
  metadata?: Record<string, unknown>
}

export type ConnectionStatus = 'connected' | 'needs_config' | 'failing'

export interface ConnectionTestResult {
  ok: boolean
  status: ConnectionStatus
  message: string
  latencyMs?: number
}

interface BaseAdapter {
  slug: string
  kind: SourceKind
  requiredEnvKeys: string[]
  testConnection(): Promise<ConnectionTestResult>
}

export interface ListingsAdapter extends BaseAdapter {
  kind: 'listings'
  discover(query: DiscoveryQuery): Promise<DiscoveredProperty[]>
}

export interface EnrichmentAdapter extends BaseAdapter {
  kind: 'enrichment'
  getValuation(address: string, city: string, state: string, zip: string): Promise<unknown>
}

export interface SkipTraceAdapter extends BaseAdapter {
  kind: 'skip_trace'
  skipTrace(address: string, city: string, state: string, zip: string): Promise<OwnerInfo | null>
}

export type LeadSourceAdapter = ListingsAdapter | EnrichmentAdapter | SkipTraceAdapter

/**
 * Helper: check if all required env keys are set.
 * Returns the missing keys, or empty array if all present.
 */
export function missingEnvKeys(keys: string[]): string[] {
  return keys.filter(k => !process.env[k] || process.env[k] === '')
}
