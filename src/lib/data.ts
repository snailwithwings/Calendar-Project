import { supabase } from './supabase'
import type { EventRow, MemberRow, TripRow } from './types'

type SanitizedEvent = {
  id: string
  trip_id: string
  owner_id: string
  type: 'master' | 'personal'
  title: string
  description: string | null
  location: string | null
  start_time: string
  end_time: string
  visibility: 'open' | 'invite' | 'private'
  capacity: number | null
  is_all_day: boolean
  owner_name: string
  participants: { user_id: string; status: 'joined' | 'invited' }[]
}

export async function getCurrentUser() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session?.user ?? null
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured. Copy .env.example to .env.local first.')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUp(email: string, password: string, displayName: string) {
  if (!supabase) throw new Error('Supabase is not configured. Copy .env.example to .env.local first.')
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  })
  if (error) throw error
  return data
}

export async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function listTrips(userId: string) {
  if (!supabase) return [] as TripRow[]
  const { data, error } = await supabase
    .from('trip_members')
    .select('trips!inner(id,name,destination,start_date,end_date,timezone,description,invite_code)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => {
    const trip = row.trips as unknown as TripRow | TripRow[]
    return Array.isArray(trip) ? trip[0] : trip
  }).filter(Boolean)
}

export async function getTripData(tripId: string) {
  if (!supabase) return { trip: null, members: [], events: [] as EventRow[] }
  const [tripResult, memberResult, eventResult] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).single(),
    supabase.from('trip_members').select('trip_id,user_id,role,joined_at,profiles(id,display_name,avatar_url)').eq('trip_id', tripId).order('joined_at'),
    supabase.rpc('get_trip_events', { target_trip: tripId }),
  ])
  if (tripResult.error) throw tripResult.error
  if (memberResult.error) throw memberResult.error
  if (eventResult.error) throw eventResult.error
  return {
    trip: tripResult.data as TripRow,
    members: (memberResult.data ?? []) as MemberRow[],
    events: (eventResult.data as SanitizedEvent[] ?? []).map((event) => ({
      ...event,
      profiles: event.owner_name ? [{ id: event.owner_id, display_name: event.owner_name, avatar_url: null }] : null,
      event_participants: event.participants ?? [],
    })) as EventRow[],
  }
}

export async function createTrip(input: Pick<TripRow, 'name' | 'destination' | 'start_date' | 'end_date' | 'timezone' | 'description'>) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('create_trip', {
    trip_name: input.name,
    trip_destination: input.destination,
    trip_start_date: input.start_date,
    trip_end_date: input.end_date,
    trip_timezone: input.timezone,
    trip_description: input.description,
  })
  if (error) throw error
  return data as string
}

export async function joinTrip(inviteCode: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('join_trip', { code: inviteCode.trim().toUpperCase() })
  if (error) throw error
  return data as string
}

export async function createEvent(input: {
  trip_id: string; type: 'master' | 'personal'; title: string; description?: string
  location?: string; start_time: string; end_time: string; visibility?: 'open' | 'invite' | 'private'
  capacity?: number | null; owner_id?: string; is_all_day?: boolean
}): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')
  const id = crypto.randomUUID()
  const payload = {
    id,
    ...input,
    owner_id: input.owner_id ?? user.id,
    visibility: input.visibility ?? 'open',
    is_all_day: input.is_all_day ?? false,
  }
  const { error } = await supabase.from('events').insert(payload)
  if (error) throw error
  return id
}

export async function updateEvent(id: string, input: Partial<Parameters<typeof createEvent>[0]>) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('events').update(input).eq('id', id).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Event was not updated. You may no longer have permission to edit it.')
}

export async function deleteEvent(id: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('events').delete().eq('id', id).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Event was not deleted. You may no longer have permission to delete it.')
}

export async function toggleParticipation(eventId: string, joined: boolean, invited = false) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')
  if (joined) {
    const { error } = await supabase.from('event_participants')
      .delete().eq('event_id', eventId).eq('user_id', user.id)
    if (error) throw error
  } else {
    const { error } = invited
      ? await supabase.from('event_participants')
        .update({ status: 'joined' }).eq('event_id', eventId).eq('user_id', user.id).eq('status', 'invited')
      : await supabase.from('event_participants')
        .insert({ event_id: eventId, user_id: user.id, status: 'joined' })
    if (error) throw error
  }
}

export async function inviteParticipant(eventId: string, userId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('event_participants').insert(
    { event_id: eventId, user_id: userId, status: 'invited' },
  )
  if (error) throw error
}

export async function replaceInvitedParticipants(eventId: string, userIds: string[]) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')
  const { error: deleteError } = await supabase.from('event_participants')
    .delete().eq('event_id', eventId).neq('user_id', user.id)
  if (deleteError) throw deleteError
  if (userIds.length === 0) return
  const { error } = await supabase.from('event_participants').insert(
    userIds.map((userId) => ({ event_id: eventId, user_id: userId, status: 'invited' as const })),
  )
  if (error) throw error
}

export async function updateTrip(tripId: string, input: Partial<Pick<TripRow, 'name' | 'destination' | 'start_date' | 'end_date' | 'timezone' | 'description'>>) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('trips').update(input).eq('id', tripId)
  if (error) throw error
}
