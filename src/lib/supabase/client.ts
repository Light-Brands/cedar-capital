import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy-initialized client-side Supabase client
let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error('Supabase URL and anon key are required. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
    }
    _supabase = createClient(url, key)
  }
  return _supabase
}

// For backwards compat in client components
export const supabase = typeof window !== 'undefined'
  ? (() => {
      try { return getSupabase() } catch { return null as unknown as SupabaseClient }
    })()
  : (null as unknown as SupabaseClient)

// Server-side Supabase client (uses service role key, bypasses RLS)
export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase URL and service role key are required.')
  }
  return createClient(url, serviceRoleKey)
}
