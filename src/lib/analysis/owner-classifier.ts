/**
 * Owner-name classifier
 *
 * Distinguishes real people from LLCs / builders / trusts / gov't on owner_name
 * from TCAD. For wholesalers the question is "who can I actually call?" — an
 * Individual owner with a personal mailing address is an order of magnitude
 * more workable than a Delaware LLC with a registered-agent address.
 *
 * Signal strength (for Kelly's cold outreach):
 *   Individual  — cold call / text works, skip-trace delivers a mobile
 *   Trust       — often estate/inheritance, high motivation but trustee gate
 *   Entity      — registered-agent lookup required, usually only profitable for
 *                 distressed corporates (single-asset LLCs, pre-foreclosure)
 *   Government  — never
 */

export type OwnerType = 'Individual' | 'Entity' | 'Trust' | 'Government' | 'Unknown'

const ENTITY = /\b(LLC|L\.L\.C|INC\b|INCORPORATED|CORP|CORPORATION|LTD|LP\b|LLP|PLLC|HOMES\b|BUILDERS|HOMEBUILDERS|DEVELOPMENT|DEVELOPERS|CONSTRUCTION|PROPERTIES|HOLDINGS|GROUP\b|COMPANY|ENTERPRISES|REALTY|REAL ESTATE|INVESTMENTS|CAPITAL\b|PARTNERS|VENTURES|FUND\b|ASSOCIATION)\b/
const TRUST = /\b(TRUST|TRUSTEE|REV\s*TR|LIV\s*TR|REVOCABLE|IRREVOCABLE|FAMILY\s*TR|LIVING\s*TRUST|FAMILY\s*TRUST)\b/
const GOV = /\b(CITY OF|COUNTY OF|STATE OF|UNITED STATES|USA|TRAVIS COUNTY|FEDERAL|PUBLIC)\b/
const INDIVIDUAL = /^[A-Z][A-Z\s&/\-\.']{2,}$/

export function classifyOwner(name: string | null | undefined): OwnerType {
  if (!name) return 'Unknown'
  const upper = name.toUpperCase()
  if (ENTITY.test(upper)) return 'Entity'
  if (TRUST.test(upper)) return 'Trust'
  if (GOV.test(upper)) return 'Government'
  if (INDIVIDUAL.test(upper)) return 'Individual'
  return 'Unknown'
}

/**
 * Heuristic "reach score" for an owner — how workable is cold outreach?
 * 1.0 = slam dunk (Individual, absentee, decade-plus hold — high motivation)
 * 0.0 = ignore (government, big entity)
 */
export function ownerReachScore(opts: {
  type: OwnerType
  isAbsentee?: boolean | null
  ownershipLengthYears?: number | null
  hasHomesteadExemption?: boolean | null
  distressSignal?: string | null
}): number {
  let s = 0
  switch (opts.type) {
    case 'Individual': s += 0.5; break
    case 'Trust':      s += 0.4; break
    case 'Entity':     s += 0.15; break // possible if distressed single-asset LLC
    case 'Government': return 0
    case 'Unknown':    s += 0.1; break
  }
  if (opts.isAbsentee) s += 0.15
  if (opts.hasHomesteadExemption === false) s += 0.1
  if (opts.ownershipLengthYears && opts.ownershipLengthYears > 10) s += 0.1
  if (opts.distressSignal) s += 0.25
  return Math.min(1, s)
}
