'use client'

import { clsx } from 'clsx'
import { scoreToBadgeMeta, badgeMeta, type DealBadge } from '@/lib/analysis/badge'

interface ScoreBadgeProps {
  /** Preferred: map from score */
  score?: number | null
  /** Preferred: explicit badge (e.g. from DB column) */
  badge?: DealBadge | null
  /** Legacy A-F grade — still rendered if provided */
  grade?: string
  size?: 'sm' | 'md' | 'lg'
  /** Show action language ("Call the owner today") inline after the badge */
  showAction?: boolean
}

const legacyGradeColors: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  B: 'bg-blue-100 text-blue-800 border-blue-300',
  C: 'bg-amber-100 text-amber-800 border-amber-300',
  D: 'bg-orange-100 text-orange-800 border-orange-300',
  F: 'bg-red-100 text-red-800 border-red-300',
}

const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-1.5 text-base',
}

export default function ScoreBadge({
  score,
  badge,
  grade,
  size = 'md',
  showAction = false,
}: ScoreBadgeProps) {
  // Resolve the badge + color from whichever signal was passed.
  // Priority: explicit badge prop → score → legacy grade fallback.
  if (badge) {
    const meta = badgeMeta(badge)
    return (
      <span className={clsx('inline-flex items-center gap-2', sizeClasses[size])}>
        <span
          className={clsx(
            'inline-flex items-center font-heading font-semibold border rounded-lg',
            meta.colorClass,
            sizeClasses[size],
          )}
        >
          {meta.badge}
          {score !== undefined && score !== null && (
            <span className="ml-1.5 font-normal opacity-70">{score}</span>
          )}
        </span>
        {showAction && <span className="text-stone-600 text-xs">{meta.action}</span>}
      </span>
    )
  }

  if (score !== undefined && score !== null) {
    const meta = scoreToBadgeMeta(score)
    return (
      <span className={clsx('inline-flex items-center gap-2')}>
        <span
          className={clsx(
            'inline-flex items-center font-heading font-semibold border rounded-lg',
            meta.colorClass,
            sizeClasses[size],
          )}
        >
          {meta.badge}
          <span className="ml-1.5 font-normal opacity-70">{score}</span>
        </span>
        {showAction && <span className="text-stone-600 text-xs">{meta.action}</span>}
      </span>
    )
  }

  // Legacy path: if only a grade is provided, keep old behavior.
  if (grade) {
    return (
      <span
        className={clsx(
          'inline-flex items-center font-heading font-bold border rounded-lg',
          legacyGradeColors[grade] ?? 'bg-gray-100 text-gray-800 border-gray-300',
          sizeClasses[size],
        )}
      >
        {grade}
      </span>
    )
  }

  return null
}
