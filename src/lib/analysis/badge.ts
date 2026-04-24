/**
 * Deal Badge Mapper
 * Maps 0-100 deal score → human-readable action badge.
 *
 * Tiers:
 *   90-100  Perfect Fit      → Call the owner today
 *   75-89   Strong Match     → Queue for outreach this week
 *   60-74   Could Work       → Second look, verify comps
 *   40-59   Needs a Reason   → Only if FSBO, distressed, or unique feature
 *    0-39   Pass             → Archive
 */

export type DealBadge = 'Perfect Fit' | 'Strong Match' | 'Could Work' | 'Needs a Reason' | 'Pass'

export interface BadgeMeta {
  badge: DealBadge
  action: string
  /** Tailwind classes for chip rendering */
  colorClass: string
  /** Lower bound of the score tier (inclusive) */
  minScore: number
}

/**
 * Ordered descending by minScore so lookups scan from highest to lowest.
 */
export const BADGE_LADDER: readonly BadgeMeta[] = [
  {
    badge: 'Perfect Fit',
    action: 'Call the owner today',
    colorClass: 'bg-emerald-100 text-emerald-900 border-emerald-400',
    minScore: 90,
  },
  {
    badge: 'Strong Match',
    action: 'Queue for outreach this week',
    colorClass: 'bg-green-50 text-green-900 border-green-300',
    minScore: 75,
  },
  {
    badge: 'Could Work',
    action: 'Second look — verify comps',
    colorClass: 'bg-amber-50 text-amber-900 border-amber-300',
    minScore: 60,
  },
  {
    badge: 'Needs a Reason',
    action: 'Only if FSBO, distressed, or unique feature',
    colorClass: 'bg-orange-50 text-orange-900 border-orange-300',
    minScore: 40,
  },
  {
    badge: 'Pass',
    action: 'Archive',
    colorClass: 'bg-stone-100 text-stone-600 border-stone-300',
    minScore: 0,
  },
] as const

/**
 * Map a 0-100 score to a badge. Scores outside the range clamp to the nearest tier.
 * Returns null if the input is null/undefined/NaN.
 */
export function scoreToBadge(score: number | null | undefined): DealBadge | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null
  return scoreToBadgeMeta(score).badge
}

/**
 * Get full badge metadata (action copy + color class) from a score.
 * Never returns null: negative scores clamp to 'Pass'.
 */
export function scoreToBadgeMeta(score: number | null | undefined): BadgeMeta {
  const s = score === null || score === undefined || Number.isNaN(score) ? 0 : score
  for (const meta of BADGE_LADDER) {
    if (s >= meta.minScore) return meta
  }
  return BADGE_LADDER[BADGE_LADDER.length - 1]
}

/**
 * Look up metadata by badge name (for rendering without a score).
 */
export function badgeMeta(badge: DealBadge): BadgeMeta {
  const found = BADGE_LADDER.find(m => m.badge === badge)
  return found ?? BADGE_LADDER[BADGE_LADDER.length - 1]
}
