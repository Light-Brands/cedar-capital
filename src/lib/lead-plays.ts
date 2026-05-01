/**
 * Lead-play classification — Cedar Capital
 *
 * Six wholesale archetypes derived from ATTOM owner + mortgage data. Each
 * play has a distinct outreach playbook. The classifier here mirrors the SQL
 * views in scripts/build-lead-categorization-views.sql so a property's
 * displayed plays match what the SQL views surface.
 *
 * Add a property to multiple plays freely — they're not mutually exclusive.
 */

export type LeadPlay =
  | 'reo'             // Fannie/Freddie/bank/trust REO
  | 'short_sale'      // asking < mortgage = bank willing to take a loss
  | 'equity_rich'     // 15+yr-old mortgage, owner has paid down
  | 'free_and_clear'  // no mortgage of record + ARV upside
  | 'corporate_owner' // LLC/Inc./Trust holding, non-REO
  | 'multi_unit'      // duplex/triplex/fourplex
  | 'distressed'      // foreclosure/short-sale flag from listing
  | 'absentee'        // out-of-area owner

export interface LeadPlayClassification {
  plays: LeadPlay[]
  primary: LeadPlay | null   // highest-priority play for badge display
  reoClass: string | null     // 'Fannie Mae' / 'Freddie Mac' / 'Bank REO' / etc.
}

interface PropertyForClassification {
  attom_owner_name?: string | null
  attom_mortgage_amount?: number | null
  attom_mortgage_origination_date?: string | null
  attom_absentee_ind?: string | null
  asking_price?: number | null
  arv_mid?: number | null
  description_categories?: string[] | null
  is_absentee?: boolean | null
}

const REO_PATTERNS: Array<[RegExp, string]> = [
  [/FANNIE|FEDERAL NATIONAL/i,        'Fannie Mae'],
  [/FREDDIE|FEDERAL HOME LOAN/i,      'Freddie Mac'],
  [/VETERANS/i,                       'VA REO'],
  [/MORTGAGE TRUST|MORTGAGE ASSET/i,  'Mortgage Trust'],
  [/REVERSE/i,                        'Reverse Mtg'],
  [/(MIDFIRST|FREEDOM|NATIONSTAR|CARRINGTON|WELLS FARGO|TRUIST|CITIBANK|FIRST UNITED|SEATTLE|NORTHPOINTE)/i, 'Bank REO'],
]

export function classifyLeadPlays(p: PropertyForClassification): LeadPlayClassification {
  const plays = new Set<LeadPlay>()
  let reoClass: string | null = null
  const owner = (p.attom_owner_name ?? '').toUpperCase()

  // REO check (high priority — overrides corporate_owner)
  for (const [pattern, label] of REO_PATTERNS) {
    if (pattern.test(owner)) {
      plays.add('reo')
      reoClass = label
      break
    }
  }

  // Corporate owner (non-REO)
  if (!plays.has('reo') && /LLC|INC$|INC |CORP$|CORP |CORPORATION|TRUST|\bLP$|\bLP |LLP|HOLDINGS/i.test(owner)) {
    plays.add('corporate_owner')
  }

  // Short sale: mortgage > asking by 10%+
  if (
    p.attom_mortgage_amount && p.asking_price &&
    p.attom_mortgage_amount > p.asking_price * 1.10 &&
    p.attom_mortgage_amount > 100_000
  ) {
    plays.add('short_sale')
  }

  // Equity rich: 15+yr mortgage with ARV upside
  if (
    p.attom_mortgage_origination_date &&
    p.asking_price && p.arv_mid &&
    p.arv_mid > p.asking_price * 1.10
  ) {
    const ageYears = (Date.now() - new Date(p.attom_mortgage_origination_date).getTime()) / (365.25 * 86400 * 1000)
    if (ageYears >= 15) plays.add('equity_rich')
  }

  // Free-and-clear: no mortgage + ARV upside
  if (
    (p.attom_mortgage_amount === 0 || p.attom_mortgage_amount === null || p.attom_mortgage_amount === undefined) &&
    p.asking_price && p.arv_mid &&
    p.arv_mid > p.asking_price * 1.20
  ) {
    plays.add('free_and_clear')
  }

  // Description-derived plays
  const cats = p.description_categories ?? []
  if (cats.includes('multi_unit')) plays.add('multi_unit')
  if (cats.includes('distressed')) plays.add('distressed')

  // Absentee
  if (p.attom_absentee_ind === 'ABSENTEE' || /ABSENTEE/i.test(p.attom_absentee_ind ?? '') || p.is_absentee === true) {
    plays.add('absentee')
  }

  // Primary play priority: REO > short_sale > equity_rich > free_and_clear > distressed > multi_unit > corporate > absentee
  const priority: LeadPlay[] = ['reo', 'short_sale', 'equity_rich', 'free_and_clear', 'distressed', 'multi_unit', 'corporate_owner', 'absentee']
  const primary = priority.find((p) => plays.has(p)) ?? null

  return { plays: Array.from(plays), primary, reoClass }
}

export const LEAD_PLAY_LABEL: Record<LeadPlay, string> = {
  reo:             'REO',
  short_sale:      'SHORT SALE',
  equity_rich:     'EQUITY RICH',
  free_and_clear:  'FREE & CLEAR',
  corporate_owner: 'CORP OWNER',
  multi_unit:      'MULTI-UNIT',
  distressed:      'DISTRESSED',
  absentee:        'ABSENTEE',
}

export const LEAD_PLAY_TONE: Record<LeadPlay, string> = {
  reo:             'bg-red-50 text-red-800 border-red-300',
  short_sale:      'bg-orange-50 text-orange-800 border-orange-300',
  equity_rich:     'bg-emerald-50 text-emerald-800 border-emerald-300',
  free_and_clear:  'bg-emerald-50 text-emerald-800 border-emerald-300',
  corporate_owner: 'bg-blue-50 text-blue-800 border-blue-300',
  multi_unit:      'bg-amber-50 text-amber-800 border-amber-300',
  distressed:      'bg-orange-50 text-orange-800 border-orange-300',
  absentee:        'bg-purple-50 text-purple-800 border-purple-300',
}

export const LEAD_PLAY_DESCRIPTION: Record<LeadPlay, string> = {
  reo:             'Bank/Fannie/Freddie/Trust owns it. Often listed below ARV for fast disposal.',
  short_sale:      'Mortgage exceeds asking price. Bank willing to take a loss.',
  equity_rich:     '15+ year mortgage. Owner has paid down most principal — flexible on price.',
  free_and_clear:  'No mortgage of record. Owner can move fast, no lien-payoff math.',
  corporate_owner: 'LLC/Inc./Trust holds it. Investor-to-investor negotiation.',
  multi_unit:      'Duplex/triplex/fourplex. Cap-rate-driven valuation.',
  distressed:      'Foreclosure or short-sale flagged on the listing.',
  absentee:        'Owner mailing address differs from property address. Often less attached.',
}
