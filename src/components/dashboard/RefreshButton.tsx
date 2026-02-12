'use client'

import { useState } from 'react'

export default function RefreshButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleRefresh() {
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/properties/refresh', { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        setResult(`Found ${data.discovered} properties, saved ${data.saved} new, enriched ${data.enriched}, analyzed ${data.analyzed}`)
      } else {
        setResult(`Error: ${data.error}`)
      }
    } catch {
      setResult('Refresh failed - check console')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleRefresh}
        disabled={loading}
        className="btn btn-primary flex items-center gap-2"
      >
        <svg
          className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        {loading ? 'Refreshing...' : 'Refresh'}
      </button>
      {result && (
        <span className="text-sm text-charcoal/70">{result}</span>
      )}
    </div>
  )
}
