'use client'

import { clsx } from 'clsx'

interface ScoreBadgeProps {
  grade: string
  score?: number
  size?: 'sm' | 'md' | 'lg'
}

const gradeColors: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  B: 'bg-blue-100 text-blue-800 border-blue-300',
  C: 'bg-amber-100 text-amber-800 border-amber-300',
  D: 'bg-orange-100 text-orange-800 border-orange-300',
  F: 'bg-red-100 text-red-800 border-red-300',
}

export default function ScoreBadge({ grade, score, size = 'md' }: ScoreBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center font-heading font-bold border rounded-lg',
        gradeColors[grade] ?? 'bg-gray-100 text-gray-800 border-gray-300',
        {
          'px-2 py-0.5 text-xs': size === 'sm',
          'px-3 py-1 text-sm': size === 'md',
          'px-4 py-1.5 text-base': size === 'lg',
        }
      )}
    >
      {grade}
      {score !== undefined && (
        <span className="ml-1 font-normal opacity-70">({score})</span>
      )}
    </span>
  )
}
