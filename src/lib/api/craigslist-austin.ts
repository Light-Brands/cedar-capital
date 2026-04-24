/**
 * Craigslist Austin FSBO adapter
 *
 * Pulls the Austin "real estate for sale by owner" RSS feed
 * (https://austin.craigslist.org/search/reo?format=rss) once per discover
 * cron fire. RSS is Craigslist's explicitly-published automation surface —
 * lower ToS risk than HTML scraping, but we still tag every row with
 * licensing='scraped_tos_risk' so it's clear these rows came from a scrape
 * channel and should stay internal-only.
 *
 * Legal posture (informed by 3Taps v. Craigslist precedent):
 *   - Single HTTP call per run (no hammering)
 *   - User-Agent identifies Cedar Capital
 *   - Only matched Austin-metro zips land in the DB
 *   - Source row stays disabled by default in lead_sources
 *   - Feature flag: flip enabled=true from /dashboard/sources when ready
 *   - Never re-sold or republished externally
 *
 * No API key needed.
 */

import type { DiscoveredProperty, DiscoveryQuery } from './types'
import type { ListingsAdapter, ConnectionTestResult, SourceKind } from './source-adapter'

const RSS_URL = 'https://austin.craigslist.org/search/reo?format=rss'
const USER_AGENT = 'Cedar-Capital/1.0 (+https://cedar-capital.vercel.app; austin fsbo feed)'

// ============================================================
// Connection test
// ============================================================

export async function testConnection(): Promise<ConnectionTestResult> {
  const start = Date.now()
  try {
    const res = await fetch(RSS_URL, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) {
      return {
        ok: false,
        status: 'failing',
        message: `Craigslist RSS HTTP ${res.status}`,
        latencyMs: Date.now() - start,
      }
    }
    const text = await res.text()
    const itemCount = (text.match(/<item[\s>]/g) ?? []).length
    return {
      ok: true,
      status: 'connected',
      message: `Reachable · ${itemCount} items in current RSS window`,
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    return {
      ok: false,
      status: 'failing',
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    }
  }
}

// ============================================================
// Discover
// ============================================================

export async function discover(query: DiscoveryQuery): Promise<DiscoveredProperty[]> {
  let xml: string
  try {
    const res = await fetch(RSS_URL, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) {
      console.error(`[craigslist] RSS HTTP ${res.status}`)
      return []
    }
    xml = await res.text()
  } catch (err) {
    console.error('[craigslist] fetch error:', err)
    return []
  }

  const items = parseRssItems(xml)
  const allowedZips = new Set(query.zipCodes)
  const out: DiscoveredProperty[] = []

  for (const item of items) {
    const zip = extractZip(item.description) ?? extractZip(item.title)
    if (!zip || !allowedZips.has(zip)) continue

    const price = extractPrice(item.title)
    const address = buildAddress(item, zip)

    out.push({
      address,
      city: 'Austin',
      state: 'TX',
      zipCode: zip,
      propertyType: 'SFR',
      listType: 'FSBO',
      source: 'craigslist_austin',
      sourceId: item.id,
      askingPrice: price,
      link: item.link,
      rawData: {
        ...item,
        _listing_status: 'Active',
        _licensing_tag: 'scraped_tos_risk',
      },
    })
  }

  return out
}

// ============================================================
// Helpers — use matchAll so we avoid RegExp.exec patterns
// ============================================================

interface RssItem {
  id: string
  title: string
  link: string
  description: string
  date: string
}

function extractTag(body: string, tag: string): string {
  const patterns = [
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  ]
  for (const re of patterns) {
    const matches = Array.from(body.matchAll(new RegExp(re.source, re.flags + 'g')))
    if (matches.length > 0 && matches[0][1]) {
      return decodeEntities(
        matches[0][1]
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
          .replace(/<[^>]+>/g, ' ')
          .trim(),
      )
    }
  }
  return ''
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = []
  const matches = Array.from(xml.matchAll(/<item[\s\S]*?>([\s\S]*?)<\/item>/g))
  for (const match of matches) {
    const body = match[1]
    const title = extractTag(body, 'title')
    if (!title) continue
    const aboutMatch = Array.from(body.matchAll(/rdf:about\s*=\s*"([^"]+)"/g))
    const link = extractTag(body, 'link') || (aboutMatch[0]?.[1] ?? '')
    const idMatch = Array.from(link.matchAll(/\/(\d+)\.html/g))
    const id = idMatch[0]?.[1] ?? link
    items.push({
      id,
      title,
      link,
      description: extractTag(body, 'description'),
      date: extractTag(body, 'pubDate') || extractTag(body, 'dc:date'),
    })
  }
  return items
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractZip(s: string): string | null {
  const matches = Array.from(s.matchAll(/\b(78\d{3}|787\d{2})\b/g))
  return matches[0]?.[1] ?? null
}

function extractPrice(title: string): number | undefined {
  const matches = Array.from(title.matchAll(/\$\s*([\d,]+)(?:k\b)?/gi))
  if (matches.length === 0) return undefined
  const m = matches[0]
  const digits = m[1].replace(/,/g, '')
  const n = parseInt(digits, 10)
  if (!Number.isFinite(n)) return undefined
  return /k\b/i.test(m[0]) ? n * 1000 : n
}

function buildAddress(item: RssItem, zip: string): string {
  const full = `${item.title} ${item.description}`
  const streetMatches = Array.from(
    full.matchAll(
      /(\d{1,6}\s+[\w .-]+?\s+\b(?:St|Ave|Blvd|Rd|Dr|Ln|Cir|Ct|Pl|Ter|Trl|Pkwy|Way|Hwy|Loop|Cv|Xing)\b[\w .-]*?)(?=[,.]|$)/gi,
    ),
  )
  if (streetMatches.length > 0) {
    return `${streetMatches[0][1].trim()}, Austin, TX ${zip}`
  }
  const titleShort = item.title.slice(0, 80).replace(/[^\w\s$-]/g, '').trim() || 'CL listing'
  return `${titleShort} [CL#${item.id}], Austin, TX ${zip}`
}

// ============================================================
// Adapter export
// ============================================================

export const craigslistAustinAdapter: ListingsAdapter = {
  slug: 'craigslist_austin',
  kind: 'listings' satisfies SourceKind,
  requiredEnvKeys: [],
  testConnection,
  discover,
}
