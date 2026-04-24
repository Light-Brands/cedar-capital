/**
 * useLocalStorage — persistent state across sessions, per browser.
 *
 * Safe against SSR (no window during prerender) and corrupted JSON (falls
 * back to the provided default). Writes are debounced to the next tick via
 * useEffect so we don't block renders.
 *
 * Usage:
 *   const [filters, setFilters] = useLocalStorage('cedar.filters', defaultFilters)
 */

import { useEffect, useRef, useState } from 'react'

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(defaultValue)
  const hydrated = useRef(false)

  // Load once on mount (client-only)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) setValue(JSON.parse(raw) as T)
    } catch (err) {
      console.warn(`[useLocalStorage] failed to load ${key}:`, err)
    }
    hydrated.current = true
  }, [key])

  // Save whenever value changes, but not on the initial hydrate
  useEffect(() => {
    if (!hydrated.current || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (err) {
      console.warn(`[useLocalStorage] failed to save ${key}:`, err)
    }
  }, [key, value])

  return [value, setValue]
}
