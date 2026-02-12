/**
 * Deal Scorer
 * Automated A-F rating based on weighted factors.
 *
 * Score (0-100) → Grade (A/B/C/D/F)
 *
 * Factors & Weights:
 *   ROI (25%)              → >30% = 25pts, >20% = 20pts, >10% = 15pts, >0% = 5pts
 *   Wholesale Spread (20%) → >$15K = 20pts, >$10K = 15pts, >$5K = 10pts
 *   ARV Confidence (15%)   → 3+ comps = 15pts, 2 comps = 10pts, AVM only = 5pts
 *   Equity Position (15%)  → >50% equity = 15pts, >30% = 10pts, >10% = 5pts
 *   Distress Signal (10%)  → Pre-foreclosure = 10pts, Tax delinq = 8pts, Vacant = 6pts
 *   Location Quality (10%) → Based on Austin submarket desirability
 *   Days on Market (5%)    → Fresh (<7d) = 5pts, Recent (<30d) = 3pts
 *
 * Grades:
 *   A = 80-100  B = 60-79  C = 40-59  D = 20-39  F = 0-19
 */

export type DealGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface ScoreFactors {
  roi: number
  wholesaleSpread: number
  arvConfidence: number
  equityPosition: number
  distressSignal: number
  locationQuality: number
  daysOnMarket: number
}

export interface ScoreResult {
  totalScore: number
  grade: DealGrade
  factors: ScoreFactors
}

export interface ScoreInput {
  roi: number                     // ROI percentage (e.g., 28.44)
  wholesaleSpread: number         // MAO - Offer price in dollars
  compCount: number               // Number of usable comps
  estimatedEquity: number         // Equity as decimal (0.50 = 50%)
  distressSignal?: string         // e.g., 'Pre-foreclosure', 'Tax delinquent', 'Vacant'
  daysOnMarket?: number
  zipCode?: string                // For location scoring
}

// Premium Austin zip codes (high desirability)
const PREMIUM_ZIPS = new Set([
  '78701', '78702', '78703', '78704', '78705',
  '78731', '78746', '78751', '78756', '78757',
])

// Good Austin zip codes (above average)
const GOOD_ZIPS = new Set([
  '78722', '78723', '78727', '78729', '78735',
  '78739', '78745', '78748', '78749', '78750',
  '78759', '78613', '78681',
])

function scoreROI(roi: number): number {
  if (roi > 30) return 25
  if (roi > 20) return 20
  if (roi > 10) return 15
  if (roi > 0) return 5
  return 0
}

function scoreWholesaleSpread(spread: number): number {
  if (spread > 15000) return 20
  if (spread > 10000) return 15
  if (spread > 5000) return 10
  if (spread > 0) return 3
  return 0
}

function scoreARVConfidence(compCount: number): number {
  if (compCount >= 3) return 15
  if (compCount >= 2) return 10
  if (compCount >= 1) return 5
  return 2 // AVM only
}

function scoreEquityPosition(equity: number): number {
  if (equity > 0.50) return 15
  if (equity > 0.30) return 10
  if (equity > 0.10) return 5
  return 0
}

function scoreDistressSignal(signal?: string): number {
  if (!signal) return 0
  const normalized = signal.toLowerCase()
  if (normalized.includes('pre-foreclosure') || normalized.includes('lis pendens')) return 10
  if (normalized.includes('tax') && normalized.includes('delinq')) return 8
  if (normalized.includes('auction')) return 8
  if (normalized.includes('vacant')) return 6
  if (normalized.includes('reo') || normalized.includes('bank')) return 7
  if (normalized.includes('probate') || normalized.includes('inherit')) return 7
  if (normalized.includes('absentee')) return 5
  if (normalized.includes('code violation')) return 6
  if (normalized.includes('fsbo')) return 4
  return 2
}

function scoreLocation(zipCode?: string): number {
  if (!zipCode) return 5
  if (PREMIUM_ZIPS.has(zipCode)) return 10
  if (GOOD_ZIPS.has(zipCode)) return 7
  return 4
}

function scoreDaysOnMarket(dom?: number): number {
  if (dom === undefined || dom === null) return 2
  if (dom <= 7) return 5
  if (dom <= 30) return 3
  if (dom <= 90) return 1
  return 0
}

function gradeFromScore(score: number): DealGrade {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}

/**
 * Score a deal and return the grade + factor breakdown.
 */
export function scoreDeal(input: ScoreInput): ScoreResult {
  const factors: ScoreFactors = {
    roi: scoreROI(input.roi),
    wholesaleSpread: scoreWholesaleSpread(input.wholesaleSpread),
    arvConfidence: scoreARVConfidence(input.compCount),
    equityPosition: scoreEquityPosition(input.estimatedEquity),
    distressSignal: scoreDistressSignal(input.distressSignal),
    locationQuality: scoreLocation(input.zipCode),
    daysOnMarket: scoreDaysOnMarket(input.daysOnMarket),
  }

  const totalScore =
    factors.roi +
    factors.wholesaleSpread +
    factors.arvConfidence +
    factors.equityPosition +
    factors.distressSignal +
    factors.locationQuality +
    factors.daysOnMarket

  return {
    totalScore,
    grade: gradeFromScore(totalScore),
    factors,
  }
}
