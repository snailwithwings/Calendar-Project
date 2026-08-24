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

export async function updateDisplayName(userId: string, displayName: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const name = displayName.trim()
  if (!name) throw new Error('Username cannot be empty.')
  if (name.length > 50) throw new Error('Username must be 50 characters or fewer.')
  const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', userId)
  if (error) throw error
  return name
}

export async function getDisplayName(userId: string) {
  if (!supabase) return null
  const { data, error } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle()
  if (error) throw error
  return data?.display_name || null
}

export async function updatePassword(password: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

export async function requestPasswordReset(email: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  })
  if (error) throw error
}

export async function listTrips(userId: string) {
  if (!supabase) return [] as TripRow[]
  const { data, error } = await supabase
    .from('trip_members')
    .select('trips!inner(id,name,destination,start_date,end_date,timezone,description,invite_code,banner_image_path,banner_position_x,banner_position_y)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
  if (error) throw error
  const trips = (data ?? []).map((row) => {
    const trip = row.trips as unknown as TripRow | TripRow[]
    return Array.isArray(trip) ? trip[0] : trip
  }).filter(Boolean) as TripRow[]
  return Promise.all(trips.map(async (trip) => ({
    ...trip,
    banner_image_url: trip.banner_image_path ? await getTripBannerUrl(trip.banner_image_path) : null,
  })))
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
  const trip = tripResult.data as TripRow
  return {
    trip: {
      ...trip,
      banner_image_url: trip.banner_image_path ? await getTripBannerUrl(trip.banner_image_path) : null,
    },
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

const TRIP_IMAGE_BUCKET = 'trip-images'
const MAX_TRIP_IMAGE_SIZE = 5 * 1024 * 1024
const TRIP_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function validateTripBanner(file: File) {
  if (!TRIP_IMAGE_TYPES.has(file.type)) throw new Error('Banner image must be a JPG, PNG, or WebP file.')
  if (file.size > MAX_TRIP_IMAGE_SIZE) throw new Error('Banner image must be 5 MB or smaller.')
}

export async function updateTripBannerPath(tripId: string, path: string | null) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('trips').update({ banner_image_path: path, banner_position_x: 50, banner_position_y: 50 }).eq('id', tripId).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Trip banner was not updated. You may no longer have admin permission.')
}

export async function updateTripBannerPosition(tripId: string, x: number, y: number) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('trips').update({
    banner_position_x: Math.max(0, Math.min(100, Math.round(x))),
    banner_position_y: Math.max(0, Math.min(100, Math.round(y))),
  }).eq('id', tripId)
  if (error) throw error
}
export async function getTripBannerUrl(path: string) {
  if (!supabase) return null
  const { data, error } = await supabase.storage.from(TRIP_IMAGE_BUCKET).createSignedUrl(path, 60 * 60)
  if (error) return null
  return data.signedUrl
}

export async function uploadTripBanner(tripId: string, file: File, previousPath?: string | null) {
  if (!supabase) throw new Error('Supabase is not configured.')
  validateTripBanner(file)
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
  const path = `${tripId}/${crypto.randomUUID()}.${extension}`
  const storage = supabase.storage.from(TRIP_IMAGE_BUCKET)
  const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError
  try {
    await updateTripBannerPath(tripId, path)
  } catch (updateError) {
    await storage.remove([path])
    throw updateError
  }
  if (previousPath && previousPath !== path) await storage.remove([previousPath])
  return path
}

export async function removeTripBanner(tripId: string, previousPath?: string | null) {
  if (!supabase) throw new Error('Supabase is not configured.')
  await updateTripBannerPath(tripId, null)
  if (previousPath) await supabase.storage.from(TRIP_IMAGE_BUCKET).remove([previousPath])
}

export async function deleteTrip(tripId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc('delete_trip', { target_trip: tripId })
  if (error) throw error
}

export async function leaveTrip(tripId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc('leave_trip', { target_trip: tripId })
  if (error) throw error
}

export async function promoteTripAdmin(tripId: string, userId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc('promote_trip_admin', {
    target_trip: tripId,
    target_user: userId,
  })
  if (error) throw error
}

export async function deleteAccount() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const functionName = 'delete-account'
  const { data: sessionResult } = await supabase.auth.getSession()
  const session = sessionResult.session
  const diagnostic = {
    functionName,
    sessionExists: Boolean(session),
    userId: session?.user.id || null,
    accessTokenPresent: Boolean(session?.access_token),
  }
  const { data, error } = await supabase.functions.invoke(functionName, { body: {} })
  if (!error) return data

  let message = 'We couldn’t delete your account. Please try again.'
  const context = (error as unknown as { context?: Response }).context
  let responseBody: unknown = null
  if (context) {
    try {
      responseBody = await context.clone().json()
      const body = responseBody as { error?: string; trips?: string[] }
      if (context.status === 409 && body.trips?.length) {
        message = `You are the only admin of ${body.trips[0]}. Promote another traveler to Admin or delete the trip before deleting your account.`
      } else if (context.status !== 404 && body.error) message = body.error
    } catch {
    }
    if (context.status === 404) message = 'Account deletion service is currently unavailable. Please try again.'
  }
  if (import.meta.env.DEV) console.error('[waypoint] DELETE ACCOUNT FAILURE', {
    ...diagnostic,
    errorName: error.name,
    errorType: error.constructor?.name,
    errorMessage: error.message,
    httpStatus: context?.status ?? null,
    responseStatusText: context?.statusText ?? null,
    responseBody,
    responseContext: context ? { status: context.status, statusText: context.statusText, url: context.url } : null,
    responseReceived: Boolean(context),
  })
  throw new Error(message)
}
