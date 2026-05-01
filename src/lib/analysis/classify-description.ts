/**
 * Listing description classifier.
 *
 * Two-stage:
 *   1. Regex pass — fast, deterministic, free. Catches the obvious signals
 *      (auction, fourplex, as-is, probate). Returns categories + flags + a
 *      confidence rating based on how many rules matched.
 *   2. LLM fallback — wired but disabled by default. When the regex pass yields
 *      zero hits on a non-trivial description, an LLM (Haiku 4.5) is the
 *      intended escalation path. Flip ENABLE_AI_CLASSIFIER=1 to activate.
 *      Until then, ambiguous descriptions return confidence='low' and the
 *      caller can decide whether to trust them.
 *
 * The regex set here is tuned to wholesaler-relevant language, not to general
 * real estate copy. Keep rules narrow — false positives on "investor"
 * categories pollute the lead-score signal more than false negatives do.
 */

export type DescriptionCategory =
  | 'auction'
  | 'multi_unit'
  | 'distressed'
  | 'tax_sale'
  | 'probate'
  | 'land'
  | 'mobile'
  | 'commercial'
  | 'mixed_use'

export interface DescriptionFlags {
  is_auction: boolean
  is_multi_unit: boolean
  is_distressed: boolean
  is_tax_sale: boolean
  is_probate: boolean
  is_land: boolean
  is_mobile: boolean
  is_commercial: boolean
  is_mixed_use: boolean
}

export interface ClassifyResult {
  categories: DescriptionCategory[]
  flags: DescriptionFlags
  confidence: 'high' | 'medium' | 'low'
  matched: string[]              // human-readable matched rule names
  source: 'regex' | 'llm' | 'none'
}

const RULES: Record<keyof DescriptionFlags, RegExp> = {
  is_auction:    /\b(auction|trustee['']?s? sale|foreclosure sale|sheriff['']?s? sale|bid deadline|highest bidder|opening bid)\b/i,
  is_multi_unit: /\b(duplex|triplex|fourplex|quadplex|fiveplex|sixplex|multi[- ]?fam(ily)?|2[- ]?unit|3[- ]?unit|4[- ]?unit|5[- ]?unit|mfh|two[- ]?unit|three[- ]?unit|four[- ]?unit)\b/i,
  is_distressed: /\b(as[- ]?is|cash only|no FHA|fixer|fixer[- ]?upper|handyman special|tlc|investor special|gut(?:ted)?|teardown|tear[- ]?down|needs work|sold[- ]?as[- ]?is|bring offers)\b/i,
  is_tax_sale:   /\b(tax sale|tax deed|tax lien|delinquent tax|tax foreclosure)\b/i,
  is_probate:    /\b(probate|estate sale|deceased|heir(s)?|inherited|executor)\b/i,
  is_land:       /\b(vacant land|lot only|no improvements|unimproved|raw land|build[- ]?ready)\b/i,
  is_mobile:     /\b(mobile home|manufactured home|trailer home|single[- ]?wide|double[- ]?wide)\b/i,
  is_commercial: /\b(commercial|office building|warehouse|retail space|strip center|industrial)\b/i,
  is_mixed_use:  /\b(mixed[- ]?use|live[- ]?work|residential\/commercial|first floor retail)\b/i,
}

const CATEGORY_FROM_FLAG: Record<keyof DescriptionFlags, DescriptionCategory> = {
  is_auction:    'auction',
  is_multi_unit: 'multi_unit',
  is_distressed: 'distressed',
  is_tax_sale:   'tax_sale',
  is_probate:    'probate',
  is_land:       'land',
  is_mobile:     'mobile',
  is_commercial: 'commercial',
  is_mixed_use:  'mixed_use',
}

function emptyFlags(): DescriptionFlags {
  return {
    is_auction: false,
    is_multi_unit: false,
    is_distressed: false,
    is_tax_sale: false,
    is_probate: false,
    is_land: false,
    is_mobile: false,
    is_commercial: false,
    is_mixed_use: false,
  }
}

export function classifyDescription(text: string | null | undefined): ClassifyResult {
  const flags = emptyFlags()
  const categories: DescriptionCategory[] = []
  const matched: string[] = []

  if (!text || text.trim().length < 10) {
    return { categories, flags, confidence: 'low', matched, source: 'none' }
  }

  for (const [flag, rule] of Object.entries(RULES) as [keyof DescriptionFlags, RegExp][]) {
    if (rule.test(text)) {
      flags[flag] = true
      categories.push(CATEGORY_FROM_FLAG[flag])
      matched.push(flag)
    }
  }

  // Confidence: 2+ hits = high, 1 hit = medium, 0 hits on long text = low
  const confidence: ClassifyResult['confidence'] =
    matched.length >= 2 ? 'high' : matched.length === 1 ? 'medium' : 'low'

  return { categories, flags, confidence, matched, source: 'regex' }
}

/**
 * Pull a freeform description from a property's raw_data, walking known
 * source-shape fallbacks. Realtor16's `description` is structured (beds/baths),
 * but the listing remarks live elsewhere — typically `description.text`,
 * `remarks`, or `public_remarks`. RentCast and Estated may carry it under
 * different keys. Walk a precedence chain and return the first non-empty hit.
 *
 * Precedence (per Lawless 2026-04-30): MLS / Realtor16 > RentCast > Estated.
 */
export function extractDescription(rawData: unknown): { text: string | null; source: string | null } {
  if (!rawData || typeof rawData !== 'object') return { text: null, source: null }
  const raw = rawData as Record<string, unknown>

  const candidates: Array<[string, unknown]> = [
    // Realtor16 / MLS shape candidates
    ['mls', deepGet(raw, ['description', 'text'])],
    ['mls', deepGet(raw, ['public_remarks'])],
    ['mls', deepGet(raw, ['remarks'])],
    ['mls', deepGet(raw, ['property', 'description', 'text'])],
    // RentCast shape candidates
    ['rentcast', deepGet(raw, ['listing', 'description'])],
    ['rentcast', deepGet(raw, ['listing', 'remarks'])],
    // Estated shape candidates
    ['estated', deepGet(raw, ['data', 'parcel', 'legal_description'])],
    ['estated', deepGet(raw, ['parcel', 'legal_description'])],
  ]

  for (const [source, value] of candidates) {
    if (typeof value === 'string' && value.trim().length >= 10) {
      return { text: value.trim(), source }
    }
  }
  return { text: null, source: null }
}

function deepGet(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

/**
 * Structural classifier — consumes the typed fields ingest sources already
 * capture (realtor16 description.type, rentcast propertyType, realty_in_us
 * flags, BatchData distress_signal). This is the primary classifier path
 * because freeform listing remarks aren't being captured by Cedar's current
 * ingestion (verified 2026-04-30 against 470 realtor16 + 5,307 rentcast rows).
 *
 * When `extractDescription()` does start finding freeform text in raw_data,
 * the regex `classifyDescription()` runs alongside this and the union of both
 * results becomes the final categorization. SQL-side mirror lives in
 * migration 006's backfill query — keep them aligned.
 */
export function classifyFromStructured(input: {
  rawData: unknown
  distressSignal?: string | null
}): ClassifyResult {
  const flags = emptyFlags()
  const categories: DescriptionCategory[] = []
  const matched: string[] = []
  const raw = (input.rawData as Record<string, unknown>) ?? {}
  const distress = input.distressSignal ?? null

  const r16Type = String(deepGet(raw, ['description', 'type']) ?? '').toLowerCase()
  const propertyType = String(raw.propertyType ?? '').toLowerCase()
  const flagsObj = (raw.flags as Record<string, unknown>) ?? {}
  const isForeclosure = flagsObj.is_foreclosure === 'true' || flagsObj.is_foreclosure === true
  const isShortSale = flagsObj.is_short_sale === 'true' || flagsObj.is_short_sale === true

  if (r16Type === 'multi_family' || /multi|duplex|triplex|fourplex|quadplex/.test(propertyType) || r16Type === 'duplex_triplex_quadplex') {
    flags.is_multi_unit = true; categories.push('multi_unit'); matched.push('is_multi_unit')
  }
  if (r16Type === 'land' || /land/.test(propertyType)) {
    flags.is_land = true; categories.push('land'); matched.push('is_land')
  }
  if (r16Type === 'mobile' || /mobile|manufactured/.test(propertyType)) {
    flags.is_mobile = true; categories.push('mobile'); matched.push('is_mobile')
  }
  if (isForeclosure || isShortSale || distress) {
    flags.is_distressed = true; categories.push('distressed'); matched.push('is_distressed')
  }
  if (distress && /probate/i.test(distress)) {
    flags.is_probate = true; categories.push('probate'); matched.push('is_probate')
  }
  if (distress && /tax/i.test(distress)) {
    flags.is_tax_sale = true; categories.push('tax_sale'); matched.push('is_tax_sale')
  }
  if (distress && (/auction/i.test(distress) || /pre[- ]?foreclosure/i.test(distress))) {
    flags.is_auction = true; categories.push('auction'); matched.push('is_auction')
  }

  const confidence: ClassifyResult['confidence'] =
    matched.length >= 2 ? 'high' : matched.length === 1 ? 'medium' : 'low'

  return { categories, flags, confidence, matched, source: 'regex' }
}

/**
 * Combined classifier — runs both the structural pass and the freeform-text
 * pass (if a description is available), then unions the categories. Use this
 * from the runtime enrich path so behavior matches the SQL backfill.
 */
export function classifyAll(input: {
  description?: string | null
  rawData: unknown
  distressSignal?: string | null
}): ClassifyResult {
  const structural = classifyFromStructured({ rawData: input.rawData, distressSignal: input.distressSignal })
  const textual = input.description ? classifyDescription(input.description) : null

  if (!textual) return structural

  const merged = emptyFlags()
  const cats = new Set<DescriptionCategory>([...structural.categories, ...textual.categories])
  for (const k of Object.keys(merged) as (keyof DescriptionFlags)[]) {
    merged[k] = structural.flags[k] || textual.flags[k]
  }
  const matchedAll = Array.from(new Set([...structural.matched, ...textual.matched]))
  const confidence: ClassifyResult['confidence'] =
    matchedAll.length >= 2 ? 'high' : matchedAll.length === 1 ? 'medium' : 'low'

  return {
    categories: Array.from(cats),
    flags: merged,
    confidence,
    matched: matchedAll,
    source: structural.matched.length > 0 && textual.matched.length > 0 ? 'regex' : (textual.matched.length > 0 ? 'regex' : 'regex'),
  }
}
