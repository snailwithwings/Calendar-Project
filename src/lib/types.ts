export type Visibility = 'open' | 'invite' | 'private'
export type TripRole = 'admin' | 'member'

export type TripRow = {
  id: string
  name: string
  destination: string
  start_date: string
  end_date: string
  timezone: string
  description: string | null
  invite_code: string
}

export type MemberRow = {
  trip_id: string
  user_id: string
  role: TripRole
  joined_at: string
  profiles: { id: string; display_name: string; avatar_url: string | null }[] | null
}

export type EventRow = {
  id: string
  trip_id: string
  owner_id: string
  type: 'master' | 'personal'
  title: string
  description: string | null
  location: string | null
  start_time: string
  end_time: string
  visibility: Visibility
  capacity: number | null
  is_all_day: boolean
  profiles: { id: string; display_name: string; avatar_url: string | null }[] | null
  event_participants: { user_id: string; status: 'joined' | 'invited' }[]
}
