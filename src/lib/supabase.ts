import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const hasUrl = typeof url === 'string' && url.trim().length > 0
const hasAnonKey = typeof anonKey === 'string' && anonKey.trim().length > 0
export const isSupabaseConfigured = hasUrl && hasAnonKey
export const supabaseConfigStatus = {
  supabaseUrlPresent: hasUrl,
  supabasePublishableKeyPresent: hasAnonKey,
}
if (import.meta.env.DEV && (!hasUrl || !hasAnonKey)) {
  console.error('[waypoint] SUPABASE CONFIGURATION', supabaseConfigStatus)
}
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    global: { headers: { apikey: anonKey } },
  })
  : null

export type ProfileRow = {
  id: string
  display_name: string
  avatar_url: string | null
}
