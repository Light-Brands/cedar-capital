'use client'

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase/client'

/**
 * Reno % slider — operator-set rehab budget as % of ARV.
 * Range 5-30. Tier labels:
 *   5-10%  Low Reno     (cosmetic refresh)
 *   10-15% Med Reno     (kitchen + bath + paint + flooring)
 *   15-20% High Reno    (mechanicals + roof + windows on top of med)
 *   20-30% Gut Reno     (full interior + exterior, structural touch-ups)
 *
 * Persists to properties.reno_override_pct. The deal_analyzer reads this
 * column and overrides line-item rehab estimates when set.
 *
 * Triggers a re-analyze on commit so all the downstream numbers (rehab
 * total, MAO, ROI, est profit, deal score) update inline.
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
    const { error: e1 } = await supabase
      .from('properties')
      .update({ reno_override_pct: value })
      .eq('id', propertyId)
    if (e1) {
      setFeedback(`save failed: ${e1.message}`)
      setCommitting(false)
      return
    }
    // Trigger re-analyze on the server so all derived fields update
    try {
      const res = await fetch(`/api/properties/${propertyId}/analyze`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFeedback(`reno set to ${value}% but re-analyze failed: ${data.error ?? res.status}`)
      } else {
        setFeedback(`Reno set to ${value}% · re-analyzed`)
      }
    } catch (err) {
      setFeedback(`reno set to ${value}% but re-analyze threw: ${err instanceof Error ? err.message : err}`)
    }
    setCommitting(false)
    onCommit?.()
    setTimeout(() => setFeedback(null), 3000)
  }

  function handleSlide(value: number) {
    setPct(value)
    // Debounce DB writes — only commit 400ms after user stops dragging
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => commit(value), 400)
  }

  async function clear() {
    setPct(10)
    const { error } = await supabase
      .from('properties')
      .update({ reno_override_pct: null })
      .eq('id', propertyId)
    if (!error) {
      setFeedback('Reno override cleared · using auto-estimate')
      try { await fetch(`/api/properties/${propertyId}/analyze`, { method: 'POST' }) } catch { /* swallow */ }
      onCommit?.()
      setTimeout(() => setFeedback(null), 3000)
    }
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
