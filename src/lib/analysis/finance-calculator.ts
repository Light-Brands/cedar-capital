/**
 * Finance Calculator
 * Ports the Cedar Capital spreadsheet's finance analysis section.
 *
 * Spreadsheet defaults:
 *   LTV: 90%, Points: 2%, Interest: 10% annual, Hold: 6 months
 */

export interface FinanceDefaults {
  ltv: number           // Loan-to-value ratio (0.90 = 90%)
  pointsPct: number     // Points percentage (0.02 = 2%)
  interestPct: number   // Annual interest rate (0.10 = 10%)
  monthsHeld: number    // Number of months holding the property
}

export const DEFAULT_FINANCE: FinanceDefaults = {
  ltv: 0.90,
  pointsPct: 0.02,
  interestPct: 0.10,
  monthsHeld: 6,
}

export interface FinanceResult {
  loanAmount: number
  monthlyPayment: number
  totalInterest: number
  totalPoints: number
  totalFinanceCost: number
}

/**
 * Calculate hard money loan financing costs.
 *
 * From the spreadsheet:
 *   Loan Amount = LTV * Offer Price
 *   Total Interest = (Loan Amount + Rehab) * Annual Rate / 12 * Months
 *   Total Points = (Loan Amount + Rehab) * Points %
 *   Total Finance Cost = Total Interest + Total Points
 *   Monthly Payment = Total Finance Cost / Months Held
 */
export function calculateFinance(
  offerPrice: number,
  rehabCost: number,
  defaults: FinanceDefaults = DEFAULT_FINANCE
): FinanceResult {
  const loanAmount = defaults.ltv * offerPrice
  const totalBasis = loanAmount + rehabCost

  const totalInterest = totalBasis * defaults.interestPct / 12 * defaults.monthsHeld
  const totalPoints = totalBasis * defaults.pointsPct
  const totalFinanceCost = totalInterest + totalPoints
  const monthlyPayment = defaults.monthsHeld > 0
    ? totalFinanceCost / defaults.monthsHeld
    : 0

  return {
    loanAmount: Math.round(loanAmount * 100) / 100,
    monthlyPayment: Math.round(monthlyPayment * 100) / 100,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPoints: Math.round(totalPoints * 100) / 100,
    totalFinanceCost: Math.round(totalFinanceCost * 100) / 100,
  }
}

/**
 * Calculate selling costs (agent commission + closing costs).
 * Spreadsheet uses 7% of ARV.
 */
export function calculateSellingCosts(arv: number, pct: number = 0.07): number {
  return Math.round(arv * pct * 100) / 100
}

/**
 * Calculate Maximum Allowable Offer for wholesale.
 * MAO = (ARV * 75%) - Repairs
 */
export function calculateMAO(arv: number, rehabCost: number, arvPct: number = 0.75): number {
  return Math.round((arv * arvPct - rehabCost) * 100) / 100
}
