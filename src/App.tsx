import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Clock3,
  Globe2, LayoutGrid, LockKeyhole, MapPin, Menu, Plus, Settings,
  Share2, Sparkles, UserRound, Users, X, LogOut
} from 'lucide-react'
import {
  createEvent, createTrip, deleteEvent, getCurrentUser, getTripData, joinTrip,
  inviteParticipant, listTrips, replaceInvitedParticipants, signIn, signOut, signUp, toggleParticipation, updateEvent, updateTrip
} from './lib/data'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { EventRow, MemberRow, TripRow } from './lib/types'

type EventKind = 'master' | 'personal'
type Visibility = 'open' | 'invite' | 'private'
type Member = { id: string; name: string; initials: string; color: string; role?: string }
type EventItem = {
  id: string; date: string; endDate?: string; start: string; end: string; title: string; location?: string
  description?: string; kind: EventKind; owner: string; visibility: Visibility
  participants: string[]; invitedIds?: string[]; capacity?: number | null; allDay?: boolean
}
type EventDraft = Omit<EventItem, 'id' | 'participants' | 'owner'> & { owner?: string; invitedIds?: string[] }
const MASTER_COLOR = '#2f7668'

const demoTrip: TripRow = {
  id: 'demo-trip', name: 'Chicago Friends Trip', destination: 'Chicago, Illinois',
  start_date: '2026-10-14', end_date: '2026-10-20', timezone: 'America/Chicago',
  description: 'A week together in Chicago.', invite_code: 'CHI26'
}
const demoMembers: Member[] = [
  { id: 'me', name: 'You', initials: 'YO', color: '#d87549', role: 'admin' },
  { id: 'alex', name: 'Alex Morgan', initials: 'AM', color: '#718f82', role: 'member' },
  { id: 'jordan', name: 'Jordan Lee', initials: 'JL', color: '#9b82b1', role: 'member' },
  { id: 'taylor', name: 'Taylor Kim', initials: 'TK', color: '#d3a852', role: 'member' },
  { id: 'morgan', name: 'Morgan Chen', initials: 'MC', color: '#6798a3', role: 'member' },
]
const seedEvents: EventItem[] = [
  { id: 'm1', date: '2026-10-14', start: '15:00', end: '16:00', title: 'Hotel check-in', location: 'The Hoxton Chicago', kind: 'master', owner: 'Waypoint', visibility: 'open', participants: [] },
  { id: 'm2', date: '2026-10-14', start: '19:00', end: '21:00', title: 'Group dinner', location: 'Rose Mary', kind: 'master', owner: 'Waypoint', visibility: 'open', participants: [] },
  { id: 'm3', date: '2026-10-15', start: '10:00', end: '12:30', title: 'Architecture boat tour', location: 'Chicago Riverwalk', kind: 'master', owner: 'Waypoint', visibility: 'open', participants: [] },
  { id: 'p1', date: '2026-10-14', start: '08:30', end: '09:30', title: 'Coffee at Sawada', location: 'Sawada Coffee', kind: 'personal', owner: 'alex', visibility: 'open', participants: ['alex', 'me'] },
  { id: 'p2', date: '2026-10-15', start: '13:00', end: '15:00', title: 'Art Institute', location: '111 S Michigan Ave', kind: 'personal', owner: 'taylor', visibility: 'open', participants: ['taylor'] },
  { id: 'p3', date: '2026-10-15', start: '14:00', end: '16:00', title: 'Solo shopping', location: 'Wicker Park', kind: 'personal', owner: 'jordan', visibility: 'private', participants: ['jordan'] },
  { id: 'p4', date: '2026-10-16', start: '09:00', end: '10:00', title: 'Morning run', location: 'Lakefront Trail', kind: 'personal', owner: 'me', visibility: 'open', participants: ['me'] },
  { id: 'p5', date: '2026-10-17', start: '12:00', end: '13:30', title: 'Deep dish lunch', location: 'Lou Malnati’s', kind: 'personal', owner: 'me', visibility: 'invite', participants: ['me', 'alex'], capacity: 4 },
]
const hourHeight = 64
const hours = Array.from({ length: 25 }, (_, i) => i)

function dateOnly(value: string) {
  return value.slice(0, 10)
}
function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}
function addMonths(value: string, amount: number) {
  const date = new Date(`${monthStart(value)}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + amount)
  return date.toISOString().slice(0, 10)
}
function clampDate(value: string, min: string, max: string) {
  return value < min ? min : value > max ? max : value
}
function localParts(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}
function storageTime(date: string, time: string, timeZone: string) {
  const localGuess = Date.parse(`${date}T${time}:00Z`)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(localGuess))
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  const zonedGuess = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00Z`)
  return new Date(localGuess + (localGuess - zonedGuess)).toISOString()
}
function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}
function formatTime(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  const displayHour = hour % 12 || 12
  return `${displayHour}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}
function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
function formatRange(trip: TripRow) {
  return `${formatDate(trip.start_date)}–${formatDate(trip.end_date)}, ${trip.start_date.slice(0, 4)}`
}
function attendanceErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const response = error as { code?: string; message?: string; details?: string; hint?: string }
    const parts = [response.code, response.message, response.details, response.hint].filter(Boolean)
    if (parts.length) return `Unable to update attendance: ${parts.join(' — ')}`
  }
  return `Unable to update attendance: ${error instanceof Error ? error.message : 'Unknown database error'}`
}
function weekdayLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  return `${date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }).toUpperCase()} ${date.getUTCDate()}`
}
function startOfWeek(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - date.getUTCDay())
  return date.toISOString().slice(0, 10)
}
function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`
}
function monthLabel(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function dateLabel(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
function profileName(row: MemberRow) {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  return profile?.display_name || `Traveler ${row.user_id.slice(0, 6)}`
}
const travelerPalette = ['#b85c38', '#76549a', '#9a6a16', '#347b8b', '#a04468', '#52733d', '#5967a3', '#a05a78']
function toMember(row: MemberRow, index: number): Member {
  const name = profileName(row)
  return { id: row.user_id, name, initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), color: travelerPalette[index % travelerPalette.length], role: row.role }
}
function fromEvent(row: EventRow, trip: TripRow): EventItem {
  const start = localParts(row.start_time, trip.timezone)
  const end = localParts(row.end_time, trip.timezone)
  return {
    id: row.id, date: start.date, endDate: end.date, start: start.time, end: end.time,
    title: row.title, description: row.description || undefined, location: row.location || undefined,
    kind: row.type, owner: row.owner_id, visibility: row.visibility, capacity: row.capacity,
    allDay: row.is_all_day,
    participants: (row.event_participants || []).filter((p) => p.status === 'joined').map((p) => p.user_id),
    invitedIds: (row.event_participants || []).filter((p) => p.status === 'invited').map((p) => p.user_id),
  }
}

function App() {
  const [authed, setAuthed] = useState(() => !isSupabaseConfigured && localStorage.getItem('waypoint-auth') === 'true')
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [userId, setUserId] = useState(isSupabaseConfigured ? '' : 'me')
  const [userEmail, setUserEmail] = useState(isSupabaseConfigured ? '' : 'demo@example.com')
  const [userName, setUserName] = useState(isSupabaseConfigured ? '' : 'You')
  const [trips, setTrips] = useState<TripRow[]>(isSupabaseConfigured ? [] : [demoTrip])
  const [selectedTripId, setSelectedTripId] = useState(isSupabaseConfigured ? '' : demoTrip.id)
  const [trip, setTrip] = useState<TripRow | null>(isSupabaseConfigured ? null : demoTrip)
  const [members, setMembers] = useState<Member[]>(isSupabaseConfigured ? [] : demoMembers)
  const [events, setEvents] = useState<EventItem[]>(isSupabaseConfigured ? [] : seedEvents)
  const [view, setView] = useState<'calendar' | 'trips'>('trips')
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<EventItem | null>(null)
  const [editing, setEditing] = useState<EventItem | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [eventError, setEventError] = useState('')
  const [attendancePending, setAttendancePending] = useState(false)
  const [calendarDate, setCalendarDate] = useState(demoTrip.start_date)
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('week')
  const [visible, setVisible] = useState<Record<string, boolean>>({ master: true, me: true, alex: true, jordan: true, taylor: true, morgan: false })

  const loadTrips = async (id = userId) => {
    if (!isSupabaseConfigured || !id) return
    setDataError('')
    const nextTrips = await listTrips(id)
    setTrips(nextTrips)
    if (!selectedTripId && nextTrips[0]) setSelectedTripId(nextTrips[0].id)
  }
  const loadTrip = async (id: string) => {
    if (!isSupabaseConfigured) return
    setDataLoading(true)
    setDataError('')
    try {
      const result = await getTripData(id)
      if (!result.trip) throw new Error('Trip not found')
      setTrip(result.trip)
      const loadedMembers = [...result.members]
        .sort((a, b) => a.user_id.localeCompare(b.user_id))
        .map((row, index) => toMember(row, index))
      if (userId && !loadedMembers.some((member) => member.id === userId)) {
        const name = userName || userEmail.split('@')[0] || 'You'
        loadedMembers.unshift({ id: userId, name, initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), color: '#d87549', role: 'member' })
      }
      loadedMembers.sort((a, b) => {
        if (a.id === userId) return -1
        if (b.id === userId) return 1
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      })
      setMembers(loadedMembers)
      setEvents(result.events.map((event) => fromEvent(event, result.trip as TripRow)))
      setCalendarDate(result.trip.start_date)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load this trip')
    } finally {
      setDataLoading(false)
    }
  }
  const refreshTrip = () => selectedTripId && loadTrip(selectedTripId)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthLoading(false)
      return
    }
    let active = true
    const applySession = async (session: { user?: { id: string; email?: string; user_metadata?: Record<string, unknown> } } | null) => {
      if (!active) return
      const user = session?.user
      if (!user) {
        setAuthed(false)
        setUserId('')
        setUserEmail('')
        setUserName('')
        return
      }
      setAuthed(true)
      setUserId(user.id)
      setUserEmail(user.email || '')
      setUserName(String(user.user_metadata?.display_name || user.email?.split('@')[0] || 'Traveler'))
      try {
        await loadTrips(user.id)
      } catch (error) {
        if (active) setDataError(error instanceof Error ? error.message : 'Unable to load trips')
      }
    }
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) throw error
      await applySession(data.session)
    }).catch((error: Error) => {
      if (active) setAuthError(error.message)
    }).finally(() => {
      if (active) setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])
  useEffect(() => {
    if (selectedTripId && !isSupabaseConfigured) {
      const nextTrip = trips.find((item) => item.id === selectedTripId) || null
      setTrip(nextTrip)
      if (nextTrip) setCalendarDate(nextTrip.start_date)
    } else if (selectedTripId && isSupabaseConfigured) {
      loadTrip(selectedTripId)
    }
  }, [selectedTripId])
  useEffect(() => {
    if (trip) setCalendarDate((current) => current || trip.start_date)
  }, [trip])
  useEffect(() => {
    setVisible((current) => {
      const next = { ...current, master: true, [userId]: current[userId] ?? true }
      members.forEach((member) => { next[member.id] = current[member.id] ?? true })
      return next
    })
  }, [members, userId])

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }
  const saveErrorMessage = (error: unknown) => {
    if (typeof error === 'object' && error !== null) {
      const response = error as { message?: string; code?: string }
      if (response.code === '23514' || /end.?time.*(start|after)|check constraint/i.test(response.message || '')) {
        return 'End time must be after start time.'
      }
      if (response.message && /capacity|full/i.test(response.message)) {
        return 'Unable to save event because this activity is at capacity.'
      }
    }
    return 'Unable to save event. Please check the event details and try again.'
  }
  const login = async (event: FormEvent<HTMLFormElement>, mode: 'signin' | 'signup' = 'signin') => {
    event.preventDefault()
    setAuthError('')
    setAuthNotice('')
    const form = new FormData(event.currentTarget)
    try {
      if (!isSupabaseConfigured) {
        localStorage.setItem('waypoint-auth', 'true')
        setUserId('me')
        setUserName('You')
        setUserEmail(String(form.get('email')))
        setView('calendar')
      } else if (mode === 'signup') {
        const result = await signUp(String(form.get('email')), String(form.get('password')), String(form.get('displayName')))
        if (!result.session) {
          setAuthNotice('If this email can be registered, you will receive a confirmation email shortly. If you already have an account, try signing in instead.')
          return
        }
        const id = result.user?.id || ''
        setUserId(id)
        setUserEmail(result.user?.email || '')
        setUserName(String(result.user?.user_metadata?.display_name || result.user?.email?.split('@')[0] || 'Traveler'))
        setAuthed(true)
        setView('trips')
        try { await loadTrips(id) } catch (error) { setDataError(error instanceof Error ? error.message : 'Unable to load trips') }
      } else {
        const result = await signIn(String(form.get('email')), String(form.get('password')))
        const id = result.user?.id || ''
        setUserId(id)
        setUserEmail(result.user?.email || '')
        setUserName(String(result.user?.user_metadata?.display_name || result.user?.email?.split('@')[0] || 'Traveler'))
        setAuthed(true)
        setView('trips')
        try { await loadTrips(id) } catch (error) { setDataError(error instanceof Error ? error.message : 'Unable to load trips') }
      }
      setAuthed(true)
      if (isSupabaseConfigured) setView('trips')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to authenticate')
    }
  }
  const logout = async () => {
    try {
      await signOut()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign out')
      return
    }
    if (!isSupabaseConfigured) localStorage.removeItem('waypoint-auth')
    setAuthed(false)
    setUserId(isSupabaseConfigured ? '' : 'me')
    setUserName(isSupabaseConfigured ? '' : 'You')
    setUserEmail(isSupabaseConfigured ? '' : 'demo@example.com')
    setTrip(null)
    setTrips([])
    setSelectedTripId('')
    setEvents([])
    setMembers([])
    setProfileOpen(false)
  }
  const selectTrip = (id: string) => {
    setSelectedTripId(id)
    setView('calendar')
  }
  const createNewTrip = async (input: Pick<TripRow, 'name' | 'destination' | 'start_date' | 'end_date' | 'timezone' | 'description'>) => {
    if (!isSupabaseConfigured) {
      const next = { ...demoTrip, ...input, id: `demo-${Date.now()}`, invite_code: 'DEMO26' }
      setTrips((current) => [...current, next])
      setSelectedTripId(next.id)
      setTrip(next)
      setView('calendar')
      notify('Trip created')
      return
    }
    try {
      const id = await createTrip(input)
      await loadTrips()
      await loadTrip(id)
      setSelectedTripId(id)
      setView('calendar')
      notify('Trip created')
    } catch (error) {
      throw error
    }
  }
  const joinExistingTrip = async (code: string) => {
    if (!isSupabaseConfigured) {
      notify(code.trim().toUpperCase() === demoTrip.invite_code ? 'You are already in this trip' : 'Invite code not found')
      return
    }
    const id = await joinTrip(code)
    await loadTrips()
    await loadTrip(id)
    setSelectedTripId(id)
    setView('calendar')
    notify('Trip joined')
  }
  const saveEvent = async (draft: EventDraft) => {
    if (!trip) return
    setEventError('')
    if (!draft.allDay && minutes(draft.end) <= minutes(draft.start)) {
      const message = 'End time must be after start time.'
      setEventError(message)
      notify(message)
      return
    }
    const startDate = draft.date
    const endDate = draft.date
    const conflict = events.some((item) => item.id !== editing?.id && item.date === draft.date &&
      minutes(item.start) < minutes(draft.end) &&
      minutes(item.end) > minutes(draft.start) &&
      (item.kind === 'master' || item.owner === userId || item.participants.includes(userId)))
    try {
      if (!isSupabaseConfigured) {
        const localEvent: EventItem = {
          id: editing?.id || `demo-event-${Date.now()}`, date: draft.date, start: draft.start, end: draft.end,
          title: draft.title, location: draft.location, description: draft.description, kind: draft.kind,
          owner: editing?.owner || userId, visibility: draft.visibility, capacity: draft.capacity,
          allDay: draft.allDay, participants: editing?.participants || [userId], invitedIds: draft.invitedIds,
        }
        setEvents((current) => editing ? current.map((item) => item.id === editing.id ? localEvent : item) : [...current, localEvent])
      } else if (editing) {
        await updateEvent(editing.id, {
          type: draft.kind, title: draft.title, description: draft.description, location: draft.location,
          start_time: storageTime(startDate, draft.start, trip.timezone), end_time: storageTime(endDate, draft.end, trip.timezone),
          visibility: draft.kind === 'master' ? 'open' : draft.visibility, capacity: draft.capacity, is_all_day: draft.allDay,
        })
        if (draft.kind === 'personal') {
          await replaceInvitedParticipants(editing.id, draft.visibility === 'invite' ? (draft.invitedIds || []) : [])
        }
        await refreshTrip()
      } else {
        const createdId = await createEvent({
          trip_id: trip.id, type: draft.kind, title: draft.title, description: draft.description,
          location: draft.location, start_time: storageTime(startDate, draft.start, trip.timezone), end_time: storageTime(endDate, draft.end, trip.timezone),
          visibility: draft.kind === 'master' ? 'open' : draft.visibility, capacity: draft.capacity, is_all_day: draft.allDay,
        })
        if (createdId && draft.visibility === 'invite' && draft.invitedIds) {
          await Promise.all(draft.invitedIds.map((memberId) => inviteParticipant(createdId, memberId)))
        }
        await refreshTrip()
      }
      setShowCreate(false)
      setEditing(null)
      setSelected(null)
      notify(conflict ? 'Saved — this overlaps another event' : editing ? 'Event updated' : 'Event added to the trip')
    } catch (error) {
      const message = saveErrorMessage(error)
      setEventError(message)
      notify(message)
    }
  }
  const removeEvent = async (id: string) => {
    try {
      if (isSupabaseConfigured) await deleteEvent(id)
      else setEvents((current) => current.filter((item) => item.id !== id))
      setSelected(null)
      await refreshTrip()
      notify('Event deleted')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to delete event')
    }
  }
  const joinEvent = async (event: EventItem) => {
    const invited = event.visibility === 'invite' && event.invitedIds?.includes(userId)
    if ((event.visibility !== 'open' && !invited) || event.owner === userId) return
    if (event.capacity && event.participants.length >= event.capacity && !event.participants.includes(userId)) {
      notify('This event is at capacity')
      return
    }
    const leaving = event.participants.includes(userId)
    setAttendancePending(true)
    try {
      if (isSupabaseConfigured) await toggleParticipation(event.id, event.participants.includes(userId), Boolean(invited))
      else setEvents((current) => current.map((item) => item.id === event.id ? {
        ...item, participants: item.participants.includes(userId)
          ? item.participants.filter((id) => id !== userId)
          : [...item.participants, userId],
        invitedIds: item.invitedIds?.filter((id) => id !== userId),
      } : item))
      await refreshTrip()
      notify(leaving ? 'You left the event' : 'You joined the event')
    } catch (error) {
      notify(attendanceErrorMessage(error))
    } finally {
      setAttendancePending(false)
    }
  }
  const saveTrip = async (input: Partial<Pick<TripRow, 'name' | 'destination' | 'start_date' | 'end_date' | 'timezone' | 'description'>>) => {
    if (!trip) return
    try {
      if (isSupabaseConfigured) {
        await updateTrip(trip.id, input)
        await loadTrips()
        await loadTrip(trip.id)
      } else {
        const next = { ...trip, ...input }
        setTrip(next)
        setTrips((current) => current.map((item) => item.id === trip.id ? next : item))
      }
      setShowSettings(false)
      notify('Trip settings saved')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to save trip settings')
    }
  }

  if (authLoading) return <Loading message="Loading your trips…" />
  if (!authed) return <AuthScreen onSubmit={login} error={authError} notice={authNotice} />
  if (view === 'trips') return <Dashboard trips={trips} loading={dataLoading} error={dataError} onOpen={selectTrip} onCreate={createNewTrip} onJoin={joinExistingTrip} onLogout={logout} />
  if (!trip) return <Loading message="Choose a trip to continue" />
  const weekStart = startOfWeek(calendarDate)
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const monthStartDate = monthStart(calendarDate)
  const monthGridStart = startOfWeek(monthStartDate)
  const monthDates = Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index))
  const visibleEvents = events.filter((event) => {
    if (event.kind === 'master') return visible.master
    return visible[event.owner] ?? false
  })
  const currentMember = members.find((member) => member.id === userId)
  const canManageMaster = currentMember?.role === 'admin' || !isSupabaseConfigured
  const moveCalendar = (amount: number) => setCalendarDate((current) => calendarView === 'week' ? addDays(current, amount * 7) : addMonths(current, amount))
  const goToday = () => setCalendarDate(new Date().toISOString().slice(0, 10))
  const shareTrip = async () => {
    const text = `Join ${trip.name} with invite code ${trip.invite_code}`
    const canShare = 'share' in navigator
    try {
      if (canShare) await navigator.share({ title: trip.name, text })
      else await navigator.clipboard.writeText(text)
      notify(canShare ? 'Invite shared' : 'Invite copied')
    } catch {
      notify(`Invite code: ${trip.invite_code}`)
    }
  }
  const profileLabel = members.find((member) => member.id === userId)?.name || userName || 'Traveler'
  const profileColor = currentMember?.color || travelerPalette[0]
  const initials = profileLabel.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Sparkles size={17} /></span><span>waypoint</span></div>
      <div className="topbar-actions"><button className="icon-button mobile-only" onClick={() => setShowSidebar(true)}><Menu size={20} /></button><div className="profile-wrap"><button className="profile-chip" onClick={() => setProfileOpen((open) => !open)}><span className="avatar avatar-me" style={{ background: profileColor }}>{initials}</span><span className="profile-name">{profileLabel}</span><ChevronDown size={15} /></button>{profileOpen && <div className="profile-menu"><strong>{profileLabel}</strong><span>{userEmail || 'Demo account'}</span>{currentMember?.role && <small>{currentMember.role === 'admin' ? 'Trip admin' : 'Traveler'}</small>}<button onClick={logout}><LogOut size={14} /> Sign out</button></div>}</div></div>
    </header>
    <div className="workspace">
      <aside className={`sidebar ${showSidebar ? 'open' : ''}`}>
        <div className="sidebar-header"><div><div className="eyebrow">YOUR TRIPS</div><button className="trip-select" onClick={() => setView('trips')}><span className="trip-dot" /> {trip.name} <ChevronDown size={15} /></button></div><button className="close-sidebar mobile-only" onClick={() => setShowSidebar(false)}><X size={18} /></button></div>
        <div className="trip-card"><div className="trip-cover"><span>{trip.destination.slice(0, 3).toUpperCase()}</span><div className="trip-card-actions"><button onClick={shareTrip} aria-label="Share invite"><Share2 size={15} /></button><button onClick={() => setShowSettings(true)} aria-label="Trip settings"><Settings size={15} /></button></div></div><div className="trip-card-body"><strong>{trip.name}</strong><span>{trip.destination} · {formatRange(trip)}</span><span className="timezone"><Globe2 size={13} /> {trip.timezone}</span></div></div>
        <div className="sidebar-section"><div className="section-label">CALENDARS <button className="tiny-plus" onClick={() => setShowCreate(true)}><Plus size={15} /></button></div><Toggle label="Master itinerary" icon={<span style={{ color: MASTER_COLOR }}><CalendarDays size={16} /></span>} checked={visible.master} onChange={() => setVisible({ ...visible, master: !visible.master })} tone="master" /><div className="section-label member-label">TRAVELERS</div>{members.map((member) => <Toggle key={member.id} label={`${member.name}${member.id === userId ? ' · You' : ''}${member.role === 'admin' ? ' · Admin' : ''}`} icon={<span className="avatar mini" style={{ background: member.color }}>{member.initials}</span>} checked={visible[member.id] ?? true} onChange={() => setVisible({ ...visible, [member.id]: !(visible[member.id] ?? true) })} />)}</div>
        <div className="sidebar-bottom"><button className="sidebar-link" onClick={() => setView('trips')}><LayoutGrid size={17} /> All trips</button><button className="sidebar-link" onClick={() => setShowSettings(true)}><Settings size={17} /> Trip settings</button><button className="sidebar-link" onClick={logout}><LogOut size={17} /> Sign out</button></div>
      </aside>
      {showSidebar && <div className="scrim mobile-only" onClick={() => setShowSidebar(false)} />}
      <main className="main-content">
        <div className="content-header"><div><div className="breadcrumb">TRIPS <span>/</span> {trip.name.toUpperCase()}</div><h1>{trip.name}</h1><p className="subtitle">{formatRange(trip)} <span>·</span> {members.length} travelers</p></div><div className="header-actions"><button className="button secondary" onClick={() => setShowSettings(true)}><Settings size={16} /> <span className="desktop-label">Manage trip</span></button><button className="button primary" onClick={() => setShowCreate(true)}><Plus size={18} /> Add event</button></div></div>
        {dataError && <div className="error-note">{dataError}</div>}
        {dataLoading ? <Loading message="Loading this trip…" /> : <><div className="calendar-toolbar"><div className="toolbar-left"><button className="today-button" onClick={goToday}>Today</button><div className="nav-buttons"><button aria-label="Previous period" onClick={() => moveCalendar(-1)}><ArrowLeft size={17} /></button><button aria-label="Next period" onClick={() => moveCalendar(1)}><ArrowRight size={17} /></button></div><strong className="month-title">{calendarView === 'week' ? monthLabel(weekStart) : monthLabel(monthStartDate)}</strong></div><div className="view-switcher"><button className={calendarView === 'week' ? 'active' : ''} onClick={() => setCalendarView('week')}>Week</button><button className={calendarView === 'month' ? 'active' : ''} onClick={() => setCalendarView('month')}>Month</button></div></div><div className="mobile-filter"><button className="button secondary" onClick={() => setShowSidebar(true)}><CalendarDays size={16} /> Calendars <span className="count-badge">{Object.values(visible).filter(Boolean).length}</span></button></div>{events.length ? calendarView === 'week' ? <CalendarGrid events={visibleEvents} members={members} dates={weekDates} currentUserId={userId} onSelect={setSelected} /> : <MonthGrid events={visibleEvents} members={members} dates={monthDates} currentUserId={userId} onSelect={setSelected} /> : <div className="empty-state"><strong>No events yet</strong><span>Add the first plan for this trip.</span><button className="button primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Add event</button></div>}<div className="calendar-footer"><span><span className="legend-line" /> Master itinerary</span><span><span className="legend-dot" /> Personal events</span><span><LockKeyhole size={13} /> Trip members can view event details</span></div></>}
      </main>
    </div>
    {(showCreate || editing) && <EventModal event={editing || undefined} initialDate={calendarDate} members={members} canCreateMaster={canManageMaster} events={events} currentUserId={userId} trip={trip} error={eventError} onClose={() => { setShowCreate(false); setEditing(null); setEventError('') }} onSave={saveEvent} />}
    {selected && <EventDetail event={selected} members={members} currentUserId={userId} canEdit={selected.kind === 'master' ? canManageMaster : selected.owner === userId} attendancePending={attendancePending} onClose={() => setSelected(null)} onJoin={() => joinEvent(selected)} onEdit={() => { setEditing(selected); setSelected(null) }} onDelete={() => removeEvent(selected.id)} />}
    {showSettings && <SettingsModal trip={trip} members={members} canEdit={canManageMaster} onClose={() => setShowSettings(false)} onSave={saveTrip} />}
    {toast && <div className="toast"><Check size={16} /> {toast}</div>}
  </div>
}

function Loading({ message }: { message: string }) {
  return <div className="loading-screen"><span className="brand-mark"><Sparkles size={17} /></span><p>{message}</p></div>
}

function AuthScreen({ onSubmit, error, notice }: { onSubmit: (e: FormEvent<HTMLFormElement>, mode?: 'signin' | 'signup') => void; error: string; notice: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  return <div className="auth-page"><div className="auth-visual"><div className="brand inverse"><span className="brand-mark"><Sparkles size={17} /></span><span>waypoint</span></div><div className="visual-copy"><p className="eyebrow light">TRAVEL TOGETHER, BETTER</p><h1>Every trip has a story. <em>Plan yours together.</em></h1><p>One shared itinerary for the group. Space for everyone’s own adventure.</p></div><div className="quote-card"><span className="quote-mark">“</span><p>The best trips are the ones where the plan leaves room for the unexpected.</p><small>— Waypoint philosophy</small></div></div><div className="auth-form-wrap"><div className="auth-form"><div className="mobile-auth-brand brand"><span className="brand-mark"><Sparkles size={17} /></span><span>waypoint</span></div><p className="eyebrow">{mode === 'signin' ? 'WELCOME BACK' : 'JOIN WAYPOINT'}</p><h2>Make room for good times.</h2><p className="auth-subtitle">{mode === 'signin' ? 'Sign in to pick up where you left off.' : 'Create an account and start planning together.'}</p><form onSubmit={(event) => onSubmit(event, mode)}>{mode === 'signup' && <label>Your name<input required name="displayName" placeholder="Alex Morgan" /></label>}<label>Email address<input required name="email" type="email" placeholder="you@example.com" /></label><label>Password<input required name="password" type="password" minLength={6} placeholder="••••••••" /></label>{error && <div className="error-note">{error}</div>}{notice && <div className="neutral-note">{notice}</div>}<button className="button primary wide">{mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={17} /></button></form><p className="signup-copy">{mode === 'signin' ? 'New to Waypoint?' : 'Already have an account?'} <button type="button" className="text-button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></p><small className="demo-hint">{isSupabaseConfigured ? 'Powered by Supabase Auth' : 'Demo mode: use any email and password'}</small></div></div></div>
}

function Dashboard({ trips, loading, error, onOpen, onCreate, onJoin, onLogout }: { trips: TripRow[]; loading: boolean; error: string; onOpen: (id: string) => void; onCreate: (input: Pick<TripRow, 'name' | 'destination' | 'start_date' | 'end_date' | 'timezone' | 'description'>) => Promise<void>; onJoin: (code: string) => Promise<void>; onLogout: () => void }) {
  const [modal, setModal] = useState<'create' | 'join' | null>(null)
  const [formError, setFormError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError(''); setActionMessage(''); setActionLoading(true)
    const form = new FormData(event.currentTarget)
    try {
      await onCreate({ name: String(form.get('name')), destination: String(form.get('destination')), start_date: String(form.get('start_date')), end_date: String(form.get('end_date')), timezone: String(form.get('timezone')), description: String(form.get('description') || '') })
      setActionMessage('Trip created')
      setModal(null)
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Unable to create trip') } finally { setActionLoading(false) }
  }
  const submitJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError(''); setActionMessage(''); setActionLoading(true)
    try { await onJoin(String(new FormData(event.currentTarget).get('code'))); setActionMessage('Trip joined'); setModal(null) } catch (error) { setFormError(error instanceof Error ? error.message : 'Unable to join trip') } finally { setActionLoading(false) }
  }
  return <div className="dashboard"><header className="topbar"><div className="brand"><span className="brand-mark"><Sparkles size={17} /></span><span>waypoint</span></div><button className="text-button" onClick={onLogout}>Sign out</button></header><main className="dashboard-content"><div className="dashboard-heading"><div><h1>Your trips</h1><p className="subtitle">The plans worth looking forward to.</p></div><div className="dashboard-actions"><button className="button primary" onClick={() => setModal('create')}><Plus size={18} /> Create a trip</button><button className="button secondary" onClick={() => setModal('join')}><Users size={16} /> Join a trip</button></div></div>{error && <div className="error-note">{error}</div>}{actionMessage && <div className="success-note">{actionMessage}</div>}{loading ? <Loading message="Loading your trips…" /> : trips.length === 0 ? <div className="empty-state"><strong>No trips yet</strong><span>Create a trip or join one with an invite code.</span><div className="empty-actions"><button className="button primary" onClick={() => setModal('create')}><Plus size={17} /> Create a trip</button><button className="button secondary" onClick={() => setModal('join')}><Users size={16} /> Join a trip</button></div></div> : <div className="trip-grid">{trips.map((item) => <button className="dashboard-trip-card" key={item.id} onClick={() => onOpen(item.id)}><div className="dashboard-cover">{item.destination.slice(0, 3).toUpperCase()} <span>{formatRange(item)}</span></div><div className="dashboard-trip-info"><div><strong>{item.name}</strong><span>{item.destination}</span></div><ArrowRight size={18} /></div></button>)}<button className="new-trip-card" onClick={() => setModal('join')}><span><Plus size={21} /></span><strong>Join a trip</strong><small>Use an invite code to join friends</small></button></div>}{modal === 'create' && <TripCreateModal error={formError} loading={actionLoading} onClose={() => setModal(null)} onSubmit={submitCreate} />}{modal === 'join' && <div className="modal-backdrop"><form className="modal" onSubmit={submitJoin}><ModalHeader title="Join a trip" onClose={() => setModal(null)} /><p className="modal-intro">Enter the invite code shared by your trip admin.</p><label>Invite code<input autoFocus required name="code" placeholder="e.g. CHI26" /></label>{formError && <div className="error-note">{formError}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancel</button><button disabled={actionLoading} className="button primary">{actionLoading ? 'Joining…' : 'Join trip'}</button></div></form></div>}</main></div>
}

function TripCreateModal({ error, loading, onClose, onSubmit }: { error: string; loading: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-backdrop"><form className="modal" onSubmit={onSubmit}><ModalHeader title="Create a trip" onClose={onClose} /><p className="modal-intro">Set up the shared space for your travelers.</p><label>Trip name<input autoFocus required name="name" placeholder="Chicago Friends Trip" /></label><label>Destination<input required name="destination" placeholder="Chicago, Illinois" /></label><div className="form-row"><label>Start date<input required type="date" name="start_date" /></label><label>End date<input required type="date" name="end_date" /></label></div><label>Trip timezone<select name="timezone" defaultValue="America/Chicago"><option>America/Chicago</option><option>America/New_York</option><option>America/Los_Angeles</option><option>UTC</option></select></label><label>Description<textarea name="description" rows={3} placeholder="Optional notes for the group" /></label>{error && <div className="error-note">{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button disabled={loading} className="button primary">{loading ? 'Creating…' : 'Create trip'}</button></div></form></div>
}

function Toggle({ label, icon, checked, onChange, tone }: { label: string; icon: ReactNode; checked: boolean; onChange: () => void; tone?: string }) {
  return <button className={`calendar-toggle ${checked ? 'checked' : ''}`} onClick={onChange}><span className={`toggle-icon ${tone || ''}`}>{icon}</span><span>{label}</span><span className={`toggle-box ${checked ? 'on' : ''}`}>{checked && <Check size={12} strokeWidth={3} />}</span></button>
}

function eventSegment(event: EventItem, date: string) {
  const startDate = event.date
  const endDate = event.endDate && event.endDate >= startDate ? event.endDate : startDate
  if (date < startDate || date > endDate) return null
  const start = date === startDate ? Math.max(0, Math.min(1440, minutes(event.start))) : 0
  let end = date === endDate ? Math.max(0, Math.min(1440, minutes(event.end))) : 1440
  if (startDate === endDate && end <= start) end = 1440
  return end > start ? { start, end } : null
}

function eventLabel(event: EventItem, members: Member[], currentUserId?: string) {
  return event.kind === 'master' ? 'MASTER' : event.owner === currentUserId
    ? 'MY EVENT'
    : members.find((member) => member.id === event.owner)?.name.split(' ')[0].toUpperCase() || 'TRAVELER'
}

type LaidOutEvent = { event: EventItem; segment: { start: number; end: number }; column: number; columns: number }

function layoutDayEvents(events: EventItem[], date: string): LaidOutEvent[] {
  const items = events.flatMap((event) => {
    const segment = eventSegment(event, date)
    return segment ? [{ event, segment }] : []
  }).sort((a, b) => a.segment.start - b.segment.start || a.segment.end - b.segment.end)
  const result: LaidOutEvent[] = []
  let group: typeof items = []
  let groupEnd = -1
  const flush = () => {
    if (!group.length) return
    const ends: number[] = []
    group.forEach((item) => {
      let column = ends.findIndex((end) => end <= item.segment.start)
      if (column < 0) {
        column = ends.length
        ends.push(item.segment.end)
      } else {
        ends[column] = item.segment.end
      }
      result.push({ ...item, column, columns: 0 })
    })
    const columns = ends.length
    result.forEach((item) => {
      if (group.some((groupItem) => groupItem.event.id === item.event.id && groupItem.segment === item.segment)) item.columns = columns
    })
    group = []
    groupEnd = -1
  }
  items.forEach((item) => {
    if (group.length && item.segment.start >= groupEnd) flush()
    group.push(item)
    groupEnd = Math.max(groupEnd, item.segment.end)
  })
  flush()
  return result
}

function CalendarGrid({ events, members, dates, currentUserId, onSelect }: { events: EventItem[]; members: Member[]; dates: string[]; currentUserId?: string; onSelect: (event: EventItem) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [])
  const allDayEvents = events.filter((event) => event.allDay)
  const timedEvents = events.filter((event) => !event.allDay)
  const timeLabel = (hour: number) => {
    const displayHour = hour % 12 || 12
    return `${displayHour} ${hour >= 12 && hour < 24 ? 'PM' : 'AM'}`
  }
  const eventButton = (event: EventItem, segment: { start: number; end: number }, key: string, column = 0, columns = 1) => {
    const top = segment.start / 60 * hourHeight
    const height = Math.min(Math.max((segment.end - segment.start) / 60 * hourHeight - 4, 12), 1536 - top)
    const member = members.find((item) => item.id === event.owner)
    const left = column * (100 / columns)
    const width = 100 / columns
    return <button key={key} className={`event-card ${event.kind} ${event.visibility}`} style={{ top: `${top}px`, height: `${height}px`, left: `calc(${left}% + 5px)`, width: `calc(${width}% - 10px)`, right: 'auto', '--event-color': event.kind === 'master' ? MASTER_COLOR : member?.color || travelerPalette[0] } as React.CSSProperties} onClick={() => onSelect(event)}>
      <span className="event-type">{eventLabel(event, members, currentUserId)}</span>
      <strong>{event.title}</strong>
      <span className="event-time">{formatTime(event.start)} – {formatTime(event.end)}</span>
      {event.location && <span className="event-location"><MapPin size={11} /> {event.location}</span>}
      {event.kind !== 'master' && event.participants.length > 1 && <span className="attendee-count"><Users size={11} /> {event.participants.length}</span>}
    </button>
  }
  return <div className="calendar"><div className="calendar-head"><div className="time-gutter" />{dates.map((date) => <div className={`day-head ${date === new Date().toISOString().slice(0, 10) ? 'today' : ''}`} key={date}><span>{weekdayLabel(date).split(' ')[0]}</span><b>{date.slice(8, 10)}</b></div>)}</div><div className="all-day-row"><div className="all-day-label">ALL DAY</div>{dates.map((date) => <div className="all-day-column" key={date}>{allDayEvents.filter((event) => date >= event.date && date <= (event.endDate && event.endDate >= event.date ? event.endDate : event.date)).map((event) => <button key={event.id} className={`all-day-event ${event.kind}`} onClick={() => onSelect(event)}>{event.title}</button>)}</div>)}</div><div className="calendar-body" ref={scrollRef}><div className="calendar-body-inner"><div className="time-column">{hours.map((hour) => <span key={hour}>{timeLabel(hour)}</span>)}</div><div className="day-columns">{dates.map((date) => <div className="day-column" key={date}>{hours.slice(0, -1).map((hour) => <div className="hour-line" key={hour} />)}{layoutDayEvents(timedEvents, date).map(({ event, segment, column, columns }) => eventButton(event, segment, `${event.id}-${date}`, column, columns))}</div>)}</div></div></div></div>
}

function MonthGrid({ events, members, dates, currentUserId, onSelect }: { events: EventItem[]; members: Member[]; dates: string[]; currentUserId?: string; onSelect: (event: EventItem) => void }) {
  return <div className="month-calendar"><div className="month-weekdays">{['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{dates.map((date) => <div className={`month-day ${date.slice(0, 7) !== dates[15].slice(0, 7) ? 'outside' : ''}`} key={date}><b>{date.slice(8, 10)}</b><div className="month-events">{events.filter((event) => event.date === date).map((event) => { const member = members.find((item) => item.id === event.owner); return <button key={event.id} className={`month-event ${event.kind}`} style={{ '--event-color': event.kind === 'master' ? MASTER_COLOR : member?.color || travelerPalette[0] } as React.CSSProperties} onClick={() => onSelect(event)}><span>{event.start} {event.title}</span></button> })}</div></div>)}</div></div>
}

function EventModal({ event, initialDate, members, canCreateMaster, events, currentUserId, trip, error, onClose, onSave }: { event?: EventItem; initialDate: string; members: Member[]; canCreateMaster: boolean; events: EventItem[]; currentUserId: string; trip: TripRow; error: string; onClose: () => void; onSave: (event: EventDraft) => void }) {
  const [title, setTitle] = useState(event?.title || '')
  const [date, setDate] = useState(clampDate(event?.date || initialDate, trip.start_date, trip.end_date))
  const [start, setStart] = useState(event?.start || '12:00')
  const [end, setEnd] = useState(event?.end || '13:00')
  const [location, setLocation] = useState(event?.location || '')
  const [visibility, setVisibility] = useState<Visibility>(event?.visibility || 'open')
  const [kind, setKind] = useState<EventKind>(event?.kind || 'personal')
  const [allDay, setAllDay] = useState(event?.allDay || false)
  const [invitedIds, setInvitedIds] = useState<string[]>(event?.invitedIds || [])
  const [validationError, setValidationError] = useState('')
  const conflict = useMemo(() => events.some((item) => item.id !== event?.id && item.date === date && minutes(item.start) < minutes(end) && minutes(item.end) > minutes(start) && (item.kind === 'master' || item.owner === currentUserId || item.participants.includes(currentUserId))), [events, event, date, start, end, currentUserId])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!allDay && minutes(end) <= minutes(start)) {
      setValidationError('End time must be after start time.')
      return
    }
    setValidationError('')
    onSave({ date, start, end, title: title || 'New activity', location, kind: canCreateMaster ? kind : 'personal', owner: event?.owner || currentUserId, visibility: kind === 'master' ? 'open' : visibility, capacity: event?.capacity || null, allDay, invitedIds })
  }
  return <div className="modal-backdrop"><form className="modal event-modal" onSubmit={submit}><ModalHeader title={event ? 'Edit event' : 'Add an activity'} onClose={onClose} /><p className="modal-intro">{event ? 'Update the plan for everyone who is tracking this trip.' : 'Add your own plans around the shared itinerary.'}</p>{canCreateMaster && <label>Event type<select value={kind} onChange={(e) => setKind(e.target.value as EventKind)}><option value="personal">Personal event</option><option value="master">Master itinerary event</option></select></label>}<label>Title<input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Beach afternoon" /></label><div className="form-row"><label>Date<input required type="date" min={trip.start_date} max={trip.end_date} value={date} onChange={(e) => setDate(e.target.value)} /></label><label>Location<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Add a place" /></label></div><label className="check-label"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All-day event</label><div className="form-row"><label>Starts<input disabled={allDay} required type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label><label>Ends<input disabled={allDay} required type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>{kind !== 'master' && <label>Who can join?<select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}><option value="open">Open to join · Anyone can join</option><option value="invite">Invite only · Invited travelers</option><option value="private">Private / solo · Just me</option></select></label>}{visibility === 'invite' && kind !== 'master' && <div className="invite-picker"><span className="field-label">Invite travelers</span>{members.filter((member) => member.id !== currentUserId).map((member) => <label className="invite-option" key={member.id}><input type="checkbox" checked={invitedIds.includes(member.id)} onChange={() => setInvitedIds((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])} /><span className="avatar mini" style={{ background: member.color }}>{member.initials}</span>{member.name}</label>)}</div>}{conflict && <div className="warning-note"><Clock3 size={15} /> This overlaps a master event or an event you own or joined. You can still save it.</div>}{visibility === 'open' && kind !== 'master' && <div className="info-note"><Users size={15} /> Your travelers will be able to see and join this activity.</div>}{(validationError || error) && <div className="error-note">{validationError || error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{event ? 'Save changes' : 'Create event'}</button></div></form></div>
}

function EventDetail({ event, members, currentUserId, canEdit, attendancePending, onClose, onJoin, onEdit, onDelete }: { event: EventItem; members: Member[]; currentUserId: string; canEdit: boolean; attendancePending: boolean; onClose: () => void; onJoin: () => void; onEdit: () => void; onDelete: () => void }) {
  const isOwner = event.owner === currentUserId
  const isMaster = event.kind === 'master'
  const member = members.find((m) => m.id === event.owner)
  const attending = event.participants.includes(currentUserId)
  const canJoin = !isMaster && !isOwner && (
    event.visibility === 'open'
    || (event.visibility === 'invite' && (event.invitedIds?.includes(currentUserId) || attending))
  )
  return <div className="modal-backdrop"><div className="modal detail-modal"><ModalHeader title={isMaster ? 'Master itinerary' : event.title} onClose={onClose} /><div className={`detail-banner ${isMaster ? 'master' : ''}`}><span className="event-type">{isMaster ? 'OFFICIAL GROUP EVENT' : event.visibility === 'private' ? 'PRIVATE EVENT' : event.visibility === 'invite' ? 'INVITE-ONLY EVENT' : 'PERSONAL EVENT'}</span>{!isMaster && <h2>{event.title}</h2>}</div>{isMaster && <h2 className="detail-title">{event.title}</h2>}<div className="detail-meta"><div><Clock3 size={17} /><span><strong>{dateLabel(event.date)}</strong>{event.allDay ? 'All day' : `${formatTime(event.start)} – ${formatTime(event.end)}`}</span></div>{event.location && <div><MapPin size={17} /><span>{event.location}</span></div>}<div><UserRound size={17} /><span>{isMaster ? 'Everyone in the trip' : `Organized by ${member?.name || 'you'}`}</span></div></div>{event.description && <p className="detail-description">{event.description}</p>}{!isMaster && <div className="attending"><div className="attending-heading"><strong>{event.participants.length} attending</strong>{event.capacity && <span>{Math.max(0, event.capacity - event.participants.length)} spots left</span>}</div><div className="attendee-list">{event.participants.map((id) => { const person = members.find((m) => m.id === id); return person && <span key={id} className="attendee"><span className="avatar mini" style={{ background: person.color }}>{person.initials}</span>{person.name === 'You' || id === currentUserId ? 'You' : person.name.split(' ')[0]}</span> })}</div></div>}{isMaster ? <div className="locked-note"><LockKeyhole size={16} /><span><strong>{canEdit ? 'You can manage this master event.' : 'This event is part of the master itinerary.'}</strong> {canEdit ? 'Changes are visible to the whole trip.' : 'Only trip admins can make changes.'}</span></div> : <div className="modal-actions detail-actions">{canJoin && <button disabled={attendancePending} className={`button ${attending ? 'secondary' : 'primary'}`} onClick={onJoin}>{attendancePending ? 'Updating…' : attending ? <><Check size={16} /> Leave event</> : <>Join event <ArrowRight size={16} /></>}</button>}{!isOwner && event.visibility === 'invite' && !canJoin && <div className="locked-note"><LockKeyhole size={16} /><span>You can view this invite-only event, but only invited travelers can join.</span></div>}{canEdit && <><button className="button secondary" onClick={onEdit}>Edit event</button><button className="button danger" onClick={onDelete}>Delete</button></>}</div>}{isMaster && canEdit && <div className="modal-actions detail-actions"><button className="button secondary" onClick={onEdit}>Edit event</button><button className="button danger" onClick={onDelete}>Delete</button></div>}</div></div>
}
function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) { return <div className="modal-header"><div><p className="eyebrow">TRIP CALENDAR</p><h3>{title}</h3></div><button className="icon-button" type="button" onClick={onClose}><X size={19} /></button></div> }
function SettingsModal({ trip, members, canEdit, onClose, onSave }: { trip: TripRow; members: Member[]; canEdit: boolean; onClose: () => void; onSave: (input: Partial<Pick<TripRow, 'name' | 'destination' | 'start_date' | 'end_date' | 'timezone' | 'description'>>) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ name: String(form.get('name')), destination: String(form.get('destination')), start_date: String(form.get('start_date')), end_date: String(form.get('end_date')), timezone: String(form.get('timezone')), description: String(form.get('description') || '') }) }
  return <div className="modal-backdrop"><form className="modal settings-modal" onSubmit={submit}><ModalHeader title="Trip settings" onClose={onClose} /><label>Trip name<input disabled={!canEdit} name="name" defaultValue={trip.name} /></label><label>Destination<input disabled={!canEdit} name="destination" defaultValue={trip.destination} /></label><div className="form-row"><label>Start date<input disabled={!canEdit} type="date" name="start_date" defaultValue={trip.start_date} /></label><label>End date<input disabled={!canEdit} type="date" name="end_date" defaultValue={trip.end_date} /></label></div><label>Trip timezone<select disabled={!canEdit} name="timezone" defaultValue={trip.timezone}><option>America/Chicago</option><option>America/New_York</option><option>America/Los_Angeles</option><option>UTC</option></select></label><label>Description<textarea disabled={!canEdit} name="description" defaultValue={trip.description || ''} rows={3} /></label><label>Invite code<input readOnly value={trip.invite_code} /></label><div className="members-settings"><strong>Travelers · {members.length}</strong>{members.map((m) => <div key={m.id}><span className="avatar mini" style={{ background: m.color }}>{m.initials}</span><span>{m.name}</span>{m.role && <small>{m.role}</small>}</div>)}</div>{!canEdit && <div className="locked-note"><LockKeyhole size={16} /> Only trip admins can update trip details.</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Close</button>{canEdit && <button className="button primary">Save changes</button>}</div></form></div>
}

export default App
