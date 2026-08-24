import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function failure(stage: string, error: unknown, status = 500) {
  const detail = error instanceof Error ? { name: error.name, message: error.message } : error
  console.error('[waypoint] delete-account failure', { stage, detail })
  return json({ error: 'Unable to complete account deletion.' }, status)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }
  if (request.method !== 'POST') return json({ error: 'Only POST is supported.' }, 405)

  const authorization = request.headers.get('Authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return json({ error: 'You must be signed in to delete your account.' }, 401)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceRoleKey) {
    return json({ error: 'Account deletion is not configured on this project.' }, 500)
  }

  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userData, error: userError } = await anon.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Your session is invalid or expired. Please sign in again.' }, 401)

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const userId = userData.user.id
  const { data: adminRows, error: adminRowsError } = await admin
    .from('trip_members')
    .select('trip_id, trips(name)')
    .eq('user_id', userId)
    .eq('role', 'admin')
  if (adminRowsError) return failure('load administrator memberships', adminRowsError)

  const soleAdminTrips: string[] = []
  for (const row of adminRows ?? []) {
    const { data: admins, error: adminsError } = await admin
      .from('trip_members')
      .select('user_id')
      .eq('trip_id', row.trip_id)
      .eq('role', 'admin')
    if (adminsError) return failure('load trip administrators', adminsError)
    const trip = Array.isArray(row.trips) ? row.trips[0] : row.trips
    const name = (trip as { name?: string } | null)?.name || 'Unnamed trip'
    const remaining = (admins ?? []).find((member) => member.user_id !== userId)
    if (!remaining) soleAdminTrips.push(name)
  }

  if (soleAdminTrips.length) {
    return json({
      error: 'You are the only admin for one or more trips. Add another admin before deleting your account.',
      trips: soleAdminTrips,
    }, 409)
  }

  const { error: preserveMasterError } = await admin
    .from('events')
    .update({ owner_id: null })
    .eq('owner_id', userId)
    .eq('type', 'master')
  if (preserveMasterError) return failure('clear deleted owner from master events', preserveMasterError)

  const { error: personalEventsError } = await admin
    .from('events')
    .delete()
    .eq('owner_id', userId)
    .eq('type', 'personal')
  if (personalEventsError) return failure('remove personal events', personalEventsError)

  const { error: participantError } = await admin.from('event_participants').delete().eq('user_id', userId)
  if (participantError) return failure('remove event participation', participantError)

  const { error: membershipError } = await admin.from('trip_members').delete().eq('user_id', userId)
  if (membershipError) return failure('remove trip memberships', membershipError)

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId)
  if (deleteUserError) return failure('delete auth user', deleteUserError)

  return json({ success: true })
})
