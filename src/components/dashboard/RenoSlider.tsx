'use client'

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'

/**
 * Reno % slider — operator-set rehab budget as % of ARV.
 * Range 5-30. Tier labels:
 *   5-10%  Low Reno     (cosmetic refresh)
 *   10-15% Med Reno     (kitchen + bath + paint + flooring)
 *   15-20% High Reno    (mechanicals + roof + windows on top of med)
 *   20-30% Gut Reno     (full interior + exterior, structural touch-ups)
 *
 * Routes through POST /api/properties/:id/reno (server endpoint that
 * persists the override AND re-runs the deal analyzer in one shot).
 * Client-side Supabase writes were silently failing due to RLS — using
 * the server route bypasses that with the service-role client.
 */

const TIERS: Array<{ label: string; min: number; max: number; tone: string }> = [
  { label: 'Low Reno',  min: 5,  max: 10, tone: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  { label: 'Med Reno',  min: 10, max: 15, tone: 'bg-amber-50 text-amber-800 border-amber-300' },
  { label: 'High Reno', min: 15, max: 20, tone: 'bg-orange-50 text-orange-800 border-orange-300' },
  { label: 'Gut Reno',  min: 20, max: 30, tone: 'bg-red-50 text-red-800 border-red-300' },
]

function tierFor(pct: number): typeof TIERS[number] {
  return TIERS.find((t) => pct >= t.min && pct < t.max) ?? TIERS[TIERS.length - 1]
}

export default function RenoSlider({
  propertyId,
  initial,
  arv,
  onCommit,
}: {
  propertyId: string
  initial: number | null
  arv: number | null
  onCommit?: () => void
}) {
  const [pct, setPct] = useState<number>(initial ?? 10)
  const [committing, setCommitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (initial != null) setPct(initial)
  }, [initial])

  const tier = tierFor(pct)
  const estRehab = arv && arv > 0 ? Math.round(arv * (pct / 100)) : null

  async function commit(value: number) {
    setCommitting(true)
    setFeedback(null)
    try {
      // Single server call: persists the override AND re-runs the analyzer
      // so the response carries the fresh rehab_total + analysis row.
      const res = await fetch(`/api/properties/${propertyId}/reno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pct: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFeedback(`save failed: ${data.error ?? res.status}`)
      } else {
        const total = data.rehab_total ? `≈ $${Math.round(data.rehab_total).toLocaleString()}` : ''
        setFeedback(`Reno set to ${value}% · re-analyzed ${total}`)
      }
    } catch (err) {
      setFeedback(`reno commit failed: ${err instanceof Error ? err.message : err}`)
    }
    setCommitting(false)
    onCommit?.()
    setTimeout(() => setFeedback(null), 4000)
  }

  function handleSlide(value: number) {
    setPct(value)
    // Debounce DB writes — only commit 400ms after user stops dragging
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => commit(value), 400)
  }

  async function clear() {
    setPct(10)
    setCommitting(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/reno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pct: null }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setFeedback('Reno override cleared · using auto-estimate')
        onCommit?.()
        setTimeout(() => setFeedback(null), 4000)
      } else {
        setFeedback(`clear failed: ${data.error ?? res.status}`)
      }
    } catch (err) {
      setFeedback(`clear failed: ${err instanceof Error ? err.message : err}`)
    }
    setCommitting(false)
  }

  return (
    <div className="bg-white border border-stone/30 rounded-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-semibold text-cedar-green">Reno Budget</h3>
        <span className={clsx(
          'text-xs px-2 py-0.5 rounded border font-bold uppercase tracking-wide',
          tier.tone,
        )}>
          {tier.label}
        </span>
      </div>

      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-3xl font-bold text-cedar-green">{pct}%</span>
        <span className="text-sm text-charcoal/60">of ARV</span>
        {estRehab !== null && (
          <span className="text-sm text-charcoal/70 ml-auto">
            ≈ <span className="font-medium">${estRehab.toLocaleString()}</span>
          </span>
        )}
      </div>

      {/* Slider track */}
      <div className="relative">
        <input
          type="range"
          min={5}
          max={30}
          step={1}
          value={pct}
          onChange={(e) => handleSlide(Number(e.target.value))}
          className="w-full accent-cedar-green cursor-pointer"
        />
        {/* Tier markers under the slider */}
        <div className="grid grid-cols-4 gap-0 mt-1 text-[10px] uppercase tracking-wide font-semibold">
          {TIERS.map((t) => (
            <button
              key={t.label}
              onClick={() => handleSlide(t.min)}
              className={clsx(
                'py-1 border-r border-stone/20 last:border-r-0 transition-colors',
                pct >= t.min && pct < t.max
                  ? 'text-cedar-green'
                  : 'text-charcoal/40 hover:text-charcoal/70',
              )}
              title={`${t.label} — ${t.min}-${t.max}% of ARV`}
            >
              <div>{t.label.split(' ')[0]}</div>
              <div className="font-normal opacity-70">{t.min}-{t.max}%</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 text-[11px]">
        {initial !== null && (
          <button onClick={clear} className="text-charcoal/50 hover:text-cedar-green hover:underline">
            Clear override (use auto-estimate)
          </button>
        )}
        <span className={clsx(
          'ml-auto',
          feedback ? 'text-cedar-green' : 'text-charcoal/40',
          committing && 'animate-pulse',
        )}>
          {committing ? 'Saving…' : feedback ?? (initial !== null ? '' : 'Auto-estimate active')}
        </span>
      </div>
    </div>
  )
}
