'use client'

import { clsx } from 'clsx'
import {
  classifyLeadPlays,
  LEAD_PLAY_LABEL,
  LEAD_PLAY_TONE,
  LEAD_PLAY_DESCRIPTION,
  type LeadPlay,
} from '@/lib/lead-plays'

interface BadgeProps {
  property: Parameters<typeof classifyLeadPlays>[0]
  /** Show only the highest-priority play (compact mode for table rows) */
  compact?: boolean
  /** Limit number of badges shown */
  max?: number
}

export default function LeadPlayBadges({ property, compact = false, max }: BadgeProps) {
  const { plays, primary, reoClass } = classifyLeadPlays(property)
  if (plays.length === 0) return null

  const display = compact && primary
    ? [primary]
    : (max ? plays.slice(0, max) : plays)

  return (
    <div className="flex flex-wrap gap-1">
      {display.map((play) => (
        <span
          key={play}
          title={LEAD_PLAY_DESCRIPTION[play]}
          className={clsx(
            'text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wide whitespace-nowrap',
            LEAD_PLAY_TONE[play],
          )}
        >
          {play === 'reo' && reoClass ? reoClass.toUpperCase() : LEAD_PLAY_LABEL[play]}
        </span>
      ))}
      {!compact && max && plays.length > max && (
        <span className="text-[9px] px-1.5 py-0.5 rounded border bg-stone-100 text-stone-600 border-stone-300 font-semibold">
          +{plays.length - max}
        </span>
      )}
    </div>
  )
}

export function LeadPlayChip({ play, count }: { play: LeadPlay; count?: number }) {
  return (
    <span
      title={LEAD_PLAY_DESCRIPTION[play]}
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-semibold text-xs',
        LEAD_PLAY_TONE[play],
      )}
    >
      <span>{LEAD_PLAY_LABEL[play]}</span>
      {count !== undefined && (
        <span className="text-[10px] opacity-70">{count}</span>
      )}
    </span>
  )
}
