/**
 * Deal Analyzer
 * Main analysis engine that ports all spreadsheet formulas.
 * Takes a property + optional overrides, produces a full deal analysis.
 */

import type { Property, AnalysisInsert } from '@/lib/supabase/types'
import { estimateRehab, type RehabEstimate, type RehabLevel } from './rehab-estimator'
import { calculateFinance, calculateSellingCosts, calculateMAO, DEFAULT_FINANCE, type FinanceDefaults } from './finance-calculator'
import { scoreDeal, type ScoreResult } from './deal-scorer'
import { type CompAnalysis } from './comps'
import { scoreToBadge, type DealBadge } from './badge'
import { classifyUnitType, isParcelMismatchLikely } from './property-classifier'

export interface DealAnalysisInput {
  property: Property
  arv?: number                    // Override: after repair value
  rehabOverride?: Partial<RehabEstimate>
  rehabLevel?: RehabLevel
  offerPrice?: number             // Override: if not using asking price
  financeDefaults?: FinanceDefaults
  compAnalysis?: CompAnalysis
  distressSignal?: string
  /** Nbhd avg $/sqft for this property's zip — ARV fallback + Discount% anchor */
  zipAvgPerSqft?: number
}

export interface DealAnalysisResult {
  // Offer Analysis
  offerPrice: number
  offerPerSqft: number
  arv: number
  arvPerSqft: number
  diff: number

  // Rehab
  rehab: RehabEstimate

  // Cost Analysis
  sellingCosts: number
  totalCost: number

  // Profit Analysis
  estProfit: number

  // Finance Analysis
  finance: {
    ltv: number
    loanAmount: number
    pointsPct: number
    interestPct: number
    monthsHeld: number
    monthlyPayment: number
    totalInterest: number
    totalPoints: number
    totalFinanceCost: number
  }
  profitWithFinance: number
  roi: number

  // Wholesale Analysis
  mao: number
  wholesaleProfit: number

  // Scoring
  score: ScoreResult
  badge: DealBadge | null

  // Kelly 36-col fields
  discountPct: number | null
  totalIn: number
  grossProfit: number
  verified: boolean

  // Comp data
  compAddresses: string[]
  compPrices: number[]
  compDistances: number[]
  compAvgPerSqft: number
}

/**
 * Run full deal analysis on a property.
 * This is the core brain - every formula from the Cedar Capital spreadsheet.
 *
 * Spreadsheet columns mapped:
 *   J: Offer Price     K: Offer $/sqft    L: ARV    M: ARV $/sqft
 *   N: Diff (ARV-Offer)   O-U: Rehab items   V: Rehab Total
 *   W: Selling Costs (7% ARV)   X: Total Cost   Y: Est Profit
 *   Z-AF: Finance Analysis   AG: Profit w/ Finance   AH: ROI
 *   AI: MAO   AJ: Wholesale Profit
 */
export function analyzeDeal(input: DealAnalysisInput): DealAnalysisResult {
  const { property, financeDefaults = DEFAULT_FINANCE, compAnalysis } = input
  const sqft = property.sqft ?? 1500

  // Step 1: Determine ARV
  // Fallback chain (best → worst signal):
  //   explicit → real sold comps → TCAD market_value (if not parcel-mismatch)
  //   → zestimate → tax-assessed × 1.1 → zip avg × sqft
  //
  // Parcel-mismatch check protects condos/townhomes from TCAD's whole-building
  // market_value. 200 Congress Ave #26C listed at $1.7M had a $7.56M TCAD
  // market value (the whole tower), producing nonsense ARVs before this guard.
  const unitType = classifyUnitType({
    property_type: property.property_type,
    address: property.address,
    lot_size: property.lot_size,
    sqft: property.sqft,
    beds: property.beds,
  })
  const parcelMismatch = isParcelMismatchLikely(unitType, property.market_value, property.asking_price)

  let arv = input.arv ?? 0
  if (!arv && compAnalysis?.estimatedARV) {
    arv = compAnalysis.estimatedARV
  }
  if (!arv && property.market_value && property.market_value > 0 && !parcelMismatch) {
    arv = property.market_value
  }
  if (!arv && property.zestimate) {
    arv = property.zestimate
  }
  if (!arv && property.tax_assessed_value && !parcelMismatch) {
    arv = Math.round(property.tax_assessed_value * 1.1)
  }
  if (!arv && input.zipAvgPerSqft && sqft > 0) {
    arv = Math.round(input.zipAvgPerSqft * sqft)
  }

  // Step 2: Estimate rehab (apply overrides if provided)
  let rehab = estimateRehab(property, input.rehabLevel)
  if (input.rehabOverride) {
    const overrides = input.rehabOverride
    rehab = { ...rehab, ...overrides }
    // Recalculate total if any line items were overridden
    rehab.total =
      rehab.kitchen + rehab.bath + rehab.interiorPaint +
      rehab.exteriorPaint + rehab.flooring + rehab.windows +
      rehab.misc + rehab.roof + rehab.sheetrock + rehab.framing +
      rehab.electrical + rehab.plumbing + rehab.hvac +
      rehab.landscape + rehab.foundation + rehab.other
  }

  // Step 3: Calculate offer price
  // If not overridden, use asking price; fallback to MAO
  let offerPrice = input.offerPrice ?? property.asking_price ?? 0
  if (!offerPrice && arv > 0) {
    offerPrice = calculateMAO(arv, rehab.total)
  }

  // Step 4: Core calculations (spreadsheet formulas)
  const offerPerSqft = sqft > 0 ? Math.round(offerPrice / sqft * 100) / 100 : 0
  const arvPerSqft = sqft > 0 ? Math.round(arv / sqft * 100) / 100 : 0
  const diff = arv - offerPrice                                    // N = L - J
  const sellingCosts = calculateSellingCosts(arv)                  // W = L * 7%
  const totalCost = offerPrice + rehab.total + sellingCosts        // X = J + V + W
  const estProfit = diff - rehab.total - sellingCosts              // Y = N - V - W

  // Step 5: Finance analysis
  const financeResult = calculateFinance(offerPrice, rehab.total, financeDefaults)
  const profitWithFinance = estProfit - financeResult.totalFinanceCost   // AG = Y - AF
  const roi = totalCost > 0
    ? Math.round(profitWithFinance / totalCost * 10000) / 100           // AH = AG / X (as %)
    : 0

  // Step 6: Wholesale analysis
  const mao = calculateMAO(arv, rehab.total)                      // AI = (L * 75%) - V
  const wholesaleProfit = mao - offerPrice                         // AJ = AI - J

  // Step 7: Score the deal
  const score = scoreDeal({
    roi,
    wholesaleSpread: wholesaleProfit,
    compCount: compAnalysis?.compCount ?? 0,
    estimatedEquity: property.tax_assessed_value && property.asking_price
      ? (property.tax_assessed_value - property.asking_price) / property.tax_assessed_value
      : 0,
    distressSignal: input.distressSignal ?? property.list_type ?? undefined,
    daysOnMarket: property.days_on_market ?? undefined,
    zipCode: property.zip_code ?? undefined,
  })

  // Step 8: Kelly 36-col derived fields
  const nbhdAvg = compAnalysis?.avgPricePerSqft ?? input.zipAvgPerSqft ?? 0
  const listPerSqft = sqft > 0 && property.asking_price ? property.asking_price / sqft : 0
  const discountPct = nbhdAvg > 0 && listPerSqft > 0
    ? Math.round(((nbhdAvg - listPerSqft) / nbhdAvg) * 10000) / 100
    : null
  const totalIn = (property.asking_price ?? offerPrice) + rehab.total
  const grossProfit = arv - totalIn
  // Verified requires 3+ real sold comps; zip-stats-only analyses stay unverified.
  const verified = (compAnalysis?.compCount ?? 0) >= 3
  const badge = scoreToBadge(score.totalScore)

  return {
    offerPrice,
    offerPerSqft,
    arv,
    arvPerSqft,
    diff,
    rehab,
    sellingCosts,
    totalCost,
    estProfit,
    finance: {
      ltv: financeDefaults.ltv,
      loanAmount: financeResult.loanAmount,
      pointsPct: financeDefaults.pointsPct,
      interestPct: financeDefaults.interestPct,
      monthsHeld: financeDefaults.monthsHeld,
      monthlyPayment: financeResult.monthlyPayment,
      totalInterest: financeResult.totalInterest,
      totalPoints: financeResult.totalPoints,
      totalFinanceCost: financeResult.totalFinanceCost,
    },
    profitWithFinance,
    roi,
    mao,
    wholesaleProfit,
    score,
    badge,
    discountPct,
    totalIn,
    grossProfit,
    verified,
    compAddresses: compAnalysis?.compAddresses ?? [],
    compPrices: compAnalysis?.compPrices ?? [],
    compDistances: compAnalysis?.compDistances ?? [],
    compAvgPerSqft: compAnalysis?.avgPricePerSqft ?? input.zipAvgPerSqft ?? 0,
  }
}

/**
 * Convert a DealAnalysisResult into a database-ready AnalysisInsert object.
 */
export function toAnalysisInsert(
  propertyId: string,
  result: DealAnalysisResult
): AnalysisInsert {
  return {
    property_id: propertyId,
    offer_price: result.offerPrice,
    offer_per_sqft: result.offerPerSqft,
    arv: result.arv,
    arv_per_sqft: result.arvPerSqft,
    diff: result.diff,
    rehab_total: result.rehab.total,
    rehab_kitchen: result.rehab.kitchen,
    rehab_bath: result.rehab.bath,
    rehab_interior_paint: result.rehab.interiorPaint,
    rehab_exterior_paint: result.rehab.exteriorPaint,
    rehab_flooring: result.rehab.flooring,
    rehab_windows: result.rehab.windows,
    rehab_misc: result.rehab.misc,
    rehab_roof: result.rehab.roof,
    rehab_sheetrock: result.rehab.sheetrock,
    rehab_framing: result.rehab.framing,
    rehab_electrical: result.rehab.electrical,
    rehab_plumbing: result.rehab.plumbing,
    rehab_hvac: result.rehab.hvac,
    rehab_landscape: result.rehab.landscape,
    rehab_foundation: result.rehab.foundation,
    rehab_other: result.rehab.other,
    selling_costs: result.sellingCosts,
    total_cost: result.totalCost,
    est_profit: result.estProfit,
    ltv: result.finance.ltv,
    loan_amount: result.finance.loanAmount,
    points_pct: result.finance.pointsPct,
    interest_pct: result.finance.interestPct,
    months_held: result.finance.monthsHeld,
    monthly_payment: result.finance.monthlyPayment,
    total_interest: result.finance.totalInterest,
    total_points: result.finance.totalPoints,
    total_finance_cost: result.finance.totalFinanceCost,
    profit_with_finance: result.profitWithFinance,
    roi: result.roi,
    mao: result.mao,
    wholesale_profit: result.wholesaleProfit,
    deal_score: result.score.grade,
    deal_score_numeric: result.score.totalScore,
    score_factors: JSON.parse(JSON.stringify(result.score.factors)),
    comp_addresses: result.compAddresses,
    comp_prices: result.compPrices,
    comp_distances: result.compDistances,
    comp_avg_per_sqft: result.compAvgPerSqft,
    // Kelly 36-col fields (added by migration 001)
    discount_pct: result.discountPct,
    total_in: result.totalIn,
    gross_profit: result.grossProfit,
    verified: result.verified,
    badge: result.badge,
  } as AnalysisInsert
}
