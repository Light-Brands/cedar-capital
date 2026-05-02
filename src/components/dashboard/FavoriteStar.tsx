'use client'

import { useState } from 'react'
import { clsx } from 'clsx'

/**
 * Favorite-star toggle. Routes through POST /api/properties/:id/favorite
 * because RLS blocks anon-key writes to the properties table from the
 * browser. The server endpoint uses the service-role client.
 */
export default function FavoriteStar({
  propertyId,
  initial,
  size = 'md',
  onChange,
}: {
  propertyId: string
  initial: boolean
  size?: 'sm' | 'md' | 'lg'
  onChange?: (next: boolean) => void
}) {
  const [favorited, setFavorited] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    const next = !favorited
    setFavorited(next) // optimistic
    onChange?.(next)
    try {
      const res = await fetch(`/api/properties/${propertyId}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorited: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `${res.status}`)
      }
    } catch (err) {
      setFavorited(!next)
      onChange?.(!next)
      console.error('[favorite] toggle failed:', err)
    }
    setBusy(false)
  }

  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5'

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={favorited ? 'Remove from favorites' : 'Add to favorites'}
      className={clsx(
        'inline-flex items-center justify-center transition-colors',
        favorited ? 'text-capital-gold hover:text-capital-gold/80' : 'text-charcoal/30 hover:text-capital-gold',
        busy && 'opacity-50',
      )}
    >
      <svg className={sizeClass} viewBox="0 0 24 24" fill={favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    </button>
  )
}
