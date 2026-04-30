/**
 * ARV Engine — multi-signal After-Repair Value calculation.
 *
 * Inputs (any may be null):
 *   - ATTOM AVM mid/low/high + AVM score (0-100 confidence)
 *   - ATTOM building condition + quality + year-built-effective
 *   - RentCast comp $/sqft median + comp count
 *   - Subject sqft
 *   - TCAD market_value (assessed; weak ARV signal but useful as a sanity floor)
 *
 * Output:
 *   - arv_low / arv_mid / arv_high (range, not point)
 *   - arv_confidence ('high' | 'medium' | 'low')
 *   - arv_signals (jsonb provenance — every input that contributed and its weight)
 *
 * Why a range:
 *   ATTOM's AVM range-of-value is materially wide (32% on the test property we
 *   probed). A single-point ARV hides that uncertainty; in wholesale, that
 *   uncertainty is the difference between a profitable buy and a loser. We
 *   carry the range through to the deal scorer so downstream filters can
 *   treat low-confidence ranges differently (smaller offer ceiling, more DD).
 *
 * Why condition matters:
 *   The AVM is an as-is signal. ARV is post-rehab. A POOR-condition home with
 *   a $700K AVM is *worth* meaningfully more after rehab than the AVM implies
 *   because the AVM has already discounted for condition. The condition_factor
 *   reverses that discount.
 */

export type Condition = 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'FAIR' | 'POOR' | 'UNSOUND' | null

export interface ArvInput {
  attomAvmValue: number | null
  attomAvmLow: number | null
  attomAvmHigh: number | null
  attomAvmScore: number | null
  attomCondition: Condition
  rentcastCompPsf: number | null         // median $/sqft from RentCast comps
  rentcastCompCount: number | null
  subjectSqft: number | null
  tcadMarketValue: number | null         // sanity floor only
}

export interface ArvResult {
  arvLow: number | null
  arvMid: number | null
  arvHigh: number | null
  confidence: 'high' | 'medium' | 'low'
  signals: ArvSignals
}

export interface ArvSignals {
  conditionFactor: number
  attomContribution: { low: number; mid: number; high: number } | null
  compContribution: { low: number; mid: number; high: number; psf: number; count: number } | null
  tcadFloor: number | null
  notes: string[]
}

const CONDITION_FACTOR: Record<Exclude<Condition, null>, number> = {
  EXCELLENT: 1.00,
  GOOD:      1.05,
  AVERAGE:   1.12,
  FAIR:      1.20,
  POOR:      1.30,
  UNSOUND:   1.40,
}

export function calculateArv(input: ArvInput): ArvResult {
  const notes: string[] = []
  const conditionFactor = input.attomCondition
    ? CONDITION_FACTOR[input.attomCondition]
    : 1.10 // default mid-band when condition is unknown
  if (!input.attomCondition) notes.push('condition unknown, using default factor 1.10')

  // ATTOM AVM contribution (lifted by condition factor)
  let attomContribution: ArvSignals['attomContribution'] = null
  if (input.attomAvmValue && input.attomAvmValue > 0) {
    const mid = input.attomAvmValue * conditionFactor
    const low = (input.attomAvmLow ?? input.attomAvmValue * 0.90) * conditionFactor
    const high = (input.attomAvmHigh ?? input.attomAvmValue * 1.10) * conditionFactor
    attomContribution = { low, mid, high }
  } else {
    notes.push('no ATTOM AVM available')
  }

  // RentCast comp $/sqft × subject sqft (already an ARV-style signal — comps
  // are recently sold, in marketable condition; no condition lift needed)
  let compContribution: ArvSignals['compContribution'] = null
  if (
    input.rentcastCompPsf && input.rentcastCompPsf > 0 &&
    input.subjectSqft && input.subjectSqft > 0
  ) {
    const compMid = input.rentcastCompPsf * input.subjectSqft
    compContribution = {
      low: compMid * 0.92,
      mid: compMid,
      high: compMid * 1.08,
      psf: input.rentcastCompPsf,
      count: input.rentcastCompCount ?? 0,
    }
  } else {
    notes.push('no RentCast comp $/sqft available')
  }

  // Reconcile signals: blend if both present, otherwise fall back to whichever exists
  let arvLow: number | null = null
  let arvMid: number | null = null
  let arvHigh: number | null = null

  if (attomContribution && compContribution) {
    // Weight comps more heavily — they're the canonical wholesaler ARV signal.
    // ATTOM AVM contributes anchoring; comps contribute realized market.
    const compWeight = 0.65
    const attomWeight = 0.35
    arvLow  = compContribution.low  * compWeight + attomContribution.low  * attomWeight
    arvMid  = compContribution.mid  * compWeight + attomContribution.mid  * attomWeight
    arvHigh = compContribution.high * compWeight + attomContribution.high * attomWeight
    notes.push('blended: comps 65%, ATTOM AVM 35%')
  } else if (compContribution) {
    arvLow = compContribution.low; arvMid = compContribution.mid; arvHigh = compContribution.high
    notes.push('comps only')
  } else if (attomContribution) {
    arvLow = attomContribution.low; arvMid = attomContribution.mid; arvHigh = attomContribution.high
    notes.push('ATTOM AVM only')
  }

  // TCAD as sanity floor — ARV should never come in below assessed value
  const tcadFloor = input.tcadMarketValue && input.tcadMarketValue > 0 ? input.tcadMarketValue : null
  if (tcadFloor && arvLow !== null && arvLow < tcadFloor) {
    notes.push(`floored: arv_low ${Math.round(arvLow).toLocaleString()} < tcad ${Math.round(tcadFloor).toLocaleString()}`)
    arvLow = tcadFloor
  }

  // Confidence:
  //   high   = both signals present, comp count >= 3, AVM score >= 70
  //   medium = both signals present OR one strong signal
  //   low    = single signal, low strength, or missing
  const confidence: ArvResult['confidence'] = (() => {
    const haveBoth = !!attomContribution && !!compContribution
    const goodComps = (input.rentcastCompCount ?? 0) >= 3
    const goodAvm = (input.attomAvmScore ?? 0) >= 70
    if (haveBoth && goodComps && goodAvm) return 'high'
    if (haveBoth || (compContribution && goodComps) || (attomContribution && goodAvm)) return 'medium'
    return 'low'
  })()

  return {
    arvLow: round(arvLow),
    arvMid: round(arvMid),
    arvHigh: round(arvHigh),
    confidence,
    signals: { conditionFactor, attomContribution, compContribution, tcadFloor, notes },
  }
}

function round(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null
  return Math.round(n)
}
