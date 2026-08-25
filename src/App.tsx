import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Clock3,
  Globe2, LayoutGrid, LockKeyhole, MapPin, Menu, Plus, Settings,
  PanelLeftClose, PanelLeftOpen, Share2, Sparkles, UserRound, Users, X, LogOut, AlertTriangle
} from 'lucide-react'
import {
  createEvent, createTrip, deleteAccount as deleteAccountRequest, deleteEvent, deleteTrip, getCurrentUser, getDisplayName, getTripData, joinTrip,
  inviteParticipant, leaveTrip as leaveTripRequest, listTrips, promoteTripAdmin as promoteTripAdminRequest,
  replaceInvitedParticipants, removeTripBanner, requestPasswordReset, signIn, signOut, signUp, toggleParticipation, updateEvent,
  updateDisplayName, updatePassword, updateTrip, updateTripBannerPosition, uploadTripBanner, validateTripBanner
} from './lib/data'
import { getDisplayColors, getTripUserColors, getUserColors, MASTER_COLOR } from './lib/colors'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { getUserFriendlyError } from './lib/errors'
import { formatTripClock, getTripNow, humanTimeZone, isEventCurrent, isEventPast, type TripNow } from './lib/time'
import type { EventRow, MemberRow, TripRow } from './lib/types'

type EventKind = 'master' | 'personal'
type Visibility = 'open' | 'invite' | 'private'
type Member = { id: string; name: string; initials: string; color: string; role?: string }
type EventItem = {
  id: string; date: string; endDate?: string; start: string; end: string; title: string; location?: string
  description?: string; kind: EventKind; owner: string | null; visibility: Visibility
  participants: string[]; invitedIds?: string[]; capacity?: number | null; allDay?: boolean
}
type EventDraft = Omit<EventItem, 'id' | 'participants' | 'owner'> & { owner?: string; invitedIds?: string[] }
const TIMEZONE_OPTIONS = [
  { id: 'America/New_York', label: 'Eastern Time — America/New_York' },
  { id: 'America/Chicago', label: 'Central Time — America/Chicago' },
  { id: 'America/Denver', label: 'Mountain Time — America/Denver' },
  { id: 'America/Los_Angeles', label: 'Pacific Time — America/Los_Angeles' },
  { id: 'America/Phoenix', label: 'Arizona — America/Phoenix' },
  { id: 'America/Anchorage', label: 'Alaska Time — America/Anchorage' },
  { id: 'Pacific/Honolulu', label: 'Hawaii Time — Pacific/Honolulu' },
  { id: 'America/Toronto', label: 'Eastern Canada — America/Toronto' },
  { id: 'America/Vancouver', label: 'Pacific Canada — America/Vancouver' },
  { id: 'America/Mexico_City', label: 'Mexico City — America/Mexico_City' },
  { id: 'Europe/London', label: 'London — Europe/London' },
  { id: 'Europe/Paris', label: 'Central European Time — Europe/Paris' },
  { id: 'Europe/Berlin', label: 'Germany — Europe/Berlin' },
  { id: 'Europe/Rome', label: 'Italy — Europe/Rome' },
  { id: 'Europe/Madrid', label: 'Spain — Europe/Madrid' },
  { id: 'Europe/Amsterdam', label: 'Netherlands — Europe/Amsterdam' },
  { id: 'Europe/Athens', label: 'Greece — Europe/Athens' },
  { id: 'Asia/Tokyo', label: 'Japan Standard Time — Asia/Tokyo' },
  { id: 'Asia/Seoul', label: 'Korea — Asia/Seoul' },
  { id: 'Asia/Shanghai', label: 'China — Asia/Shanghai' },
  { id: 'Asia/Hong_Kong', label: 'Hong Kong — Asia/Hong_Kong' },
  { id: 'Asia/Singapore', label: 'Singapore — Asia/Singapore' },
  { id: 'Asia/Bangkok', label: 'Thailand — Asia/Bangkok' },
  { id: 'Asia/Dubai', label: 'Gulf Standard Time — Asia/Dubai' },
  { id: 'Asia/Kolkata', label: 'India — Asia/Kolkata' },
  { id: 'Australia/Sydney', label: 'Australian Eastern Time — Australia/Sydney' },
  { id: 'Australia/Melbourne', label: 'Melbourne — Australia/Melbourne' },
  { id: 'Australia/Brisbane', label: 'Brisbane — Australia/Brisbane' },
  { id: 'Australia/Perth', label: 'Perth — Australia/Perth' },
  { id: 'Pacific/Auckland', label: 'New Zealand — Pacific/Auckland' },
  { id: 'UTC', label: 'Coordinated Universal Time — UTC' },
]

const demoTrip: TripRow = {
  id: 'demo-trip', name: 'Chicago Friends Trip', destination: 'Chicago, Illinois',
  start_date: '2026-10-14', end_date: '2026-10-20', timezone: 'America/Chicago',
  description: 'A week together in Chicago.', invite_code: 'CHI26'
}
const demoMembers: Member[] = [
  { id: 'me', name: 'You', initials: 'YO', color: getUserColors('me').strong, role: 'admin' },
  { id: 'alex', name: 'Alex Morgan', initials: 'AM', color: getUserColors('alex').strong, role: 'member' },
  { id: 'jordan', name: 'Jordan Lee', initials: 'JL', color: getUserColors('jordan').strong, role: 'member' },
  { id: 'taylor', name: 'Taylor Kim', initials: 'TK', color: getUserColors('taylor').strong, role: 'member' },
  { id: 'morgan', name: 'Morgan Chen', initials: 'MC', color: getUserColors('morgan').strong, role: 'member' },
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
  return getUserFriendlyError(error, 'attendance')
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
function toMember(row: MemberRow): Member {
  const name = profileName(row)
  return { id: row.user_id, name, initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), color: getUserColors(row.user_id).strong, role: row.role }
}
function TripBanner({ trip, className = '', children }: { trip: TripRow; className?: string; children?: React.ReactNode }) {
  const position = `${trip.banner_position_x ?? 50}% ${trip.banner_position_y ?? 50}%`
  return <div className={className} style={trip.banner_image_url ? { backgroundImage: `linear-gradient(#26352b55,#26352b55), url("${trip.banner_image_url}")`, backgroundPosition: position } : undefined}>{children}</div>
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
  const [recoveryMode, setRecoveryMode] = useState(false)
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
  const [showAccountDelete, setShowAccountDelete] = useState(false)
  const [showAccountSettings, setShowAccountSettings] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [eventError, setEventError] = useState('')
  const [attendancePending, setAttendancePending] = useState(false)
  const [calendarDate, setCalendarDate] = useState(demoTrip.start_date)
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('week')
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [visible, setVisible] = useState<Record<string, boolean>>({ master: true, me: true, alex: true, jordan: true, taylor: true, morgan: false })
  const profileRef = useRef<HTMLDivElement>(null)

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
        .map((row) => toMember(row))
      if (userId && !loadedMembers.some((member) => member.id === userId)) {
        const name = userName || userEmail.split('@')[0] || 'You'
        loadedMembers.unshift({ id: userId, name, initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), color: getUserColors(userId).strong, role: 'member' })
      }
      loadedMembers.sort((a, b) => {
        if (a.id === userId) return -1
        if (b.id === userId) return 1
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      })
      const colorMap = getTripUserColors(loadedMembers.map((member) => member.id), userId)
      loadedMembers.forEach((member) => { member.color = colorMap[member.id].strong })
      setMembers(loadedMembers)
      setEvents(result.events.map((event) => fromEvent(event, result.trip as TripRow)))
      setCalendarDate(result.trip.start_date)
    } catch (error) {
      setDataError(getUserFriendlyError(error, 'trip loading'))
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
      const fallbackName = String(user.user_metadata?.display_name || user.email?.split('@')[0] || 'Traveler')
      try {
        const profileDisplayName = await getDisplayName(user.id)
        if (active) setUserName(profileDisplayName || fallbackName)
      } catch {
        if (active) setUserName(fallbackName)
      }
      try {
        await loadTrips(user.id)
      } catch (error) {
        if (active) setDataError(getUserFriendlyError(error, 'trip loading'))
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
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      void applySession(session)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(timer)
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
  useEffect(() => {
    if (!profileOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [profileOpen])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 680px)')
    const syncSidebarMode = () => setSidebarCollapsed(media.matches)
    syncSidebarMode()
    media.addEventListener('change', syncSidebarMode)
    return () => media.removeEventListener('change', syncSidebarMode)
  }, [])
  useEffect(() => {
    if (!showSidebar) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowSidebar(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showSidebar])

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }
  const saveErrorMessage = (error: unknown) => {
    if (typeof error === 'object' && error !== null) {
      const response = error as { message?: string; code?: string }
      if (response.code === '23514' || /end.?time.*(start|after)|check constraint/i.test(response.message || '')) return getUserFriendlyError(error, 'event')
      if (response.message && /capacity|full/i.test(response.message)) {
        return 'Unable to save event because this activity is at capacity.'
      }
    }
    return getUserFriendlyError(error, 'event')
  }
  const login = async (event: FormEvent<HTMLFormElement>, mode: 'signin' | 'signup' = 'signin') => {
    event.preventDefault()
    setAuthError('')
    setAuthNotice('')
    setRecoveryMode(false)
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
        try { await loadTrips(id) } catch (error) { setDataError(getUserFriendlyError(error, 'trip loading')) }
      } else {
        const result = await signIn(String(form.get('email')), String(form.get('password')))
        const id = result.user?.id || ''
        setUserId(id)
        setUserEmail(result.user?.email || '')
        setUserName(String(result.user?.user_metadata?.display_name || result.user?.email?.split('@')[0] || 'Traveler'))
        setAuthed(true)
        setView('trips')
        try { await loadTrips(id) } catch (error) { setDataError(getUserFriendlyError(error, 'trip loading')) }
      }
      setAuthed(true)
      if (isSupabaseConfigured) setView('trips')
    } catch (error) {
      setAuthError(getUserFriendlyError(error, mode === 'signin' ? 'login' : 'signup'))
    }
  }
  const requestRecovery = async (email: string) => {
    try {
      await requestPasswordReset(email)
      setAuthError('')
      setAuthNotice("If an account exists for that email, you'll receive a password reset link shortly.")
    } catch (error) {
      setAuthError(getUserFriendlyError(error, 'recovery'))
    }
  }
  const completeRecovery = async (password: string) => {
    try {
      await updatePassword(password)
      await signOut()
      resetAppState()
      setAuthNotice('Your password has been updated. You can now sign in.')
    } catch (error) {
      setAuthError(getUserFriendlyError(error, 'password'))
    }
  }
  const resetAppState = () => {
    if (!isSupabaseConfigured) localStorage.removeItem('waypoint-auth')
    setAuthed(false)
    setAuthError('')
    setAuthNotice('')
    setRecoveryMode(false)
    setDataError('')
    setToast('')
    setUserId(isSupabaseConfigured ? '' : 'me')
    setUserName(isSupabaseConfigured ? '' : 'You')
    setUserEmail(isSupabaseConfigured ? '' : 'demo@example.com')
    setTrip(null)
    setTrips([])
    setSelectedTripId('')
    setEvents([])
    setMembers([])
    setShowCreate(false)
    setSelected(null)
    setEditing(null)
    setShowSettings(false)
    setShowSidebar(false)
    setSidebarCollapsed(false)
    setEventError('')
    setProfileOpen(false)
    setShowAccountDelete(false)
    setShowAccountSettings(false)
  }
  const logout = async () => {
    try {
      await signOut()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign out')
      return
    }
    resetAppState()
  }
  const deleteAccount = async () => {
    if (!isSupabaseConfigured) throw new Error('Account deletion is only available with Supabase configured.')
    await deleteAccountRequest()
    try { await signOut() } catch { /* The account is already deleted; clear local state below. */ }
    resetAppState()
  }
  const saveAccountName = async (name: string) => {
    const nextName = isSupabaseConfigured ? await updateDisplayName(userId, name) : name.trim()
    setUserName(nextName)
    setMembers((current) => current.map((member) => member.id === userId ? { ...member, name: nextName, initials: nextName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() } : member))
    if (isSupabaseConfigured && selectedTripId) await loadTrip(selectedTripId)
  }
  const removeTrip = async () => {
    if (!trip) return
    if (isSupabaseConfigured) {
      await deleteTrip(trip.id)
      setTrips((current) => current.filter((item) => item.id !== trip.id))
    } else {
      setTrips((current) => current.filter((item) => item.id !== trip.id))
    }
    setTrip(null)
    setSelectedTripId('')
    setEvents([])
    setMembers([])
    setShowSettings(false)
    setView('trips')
    notify('Trip deleted')
  }
  const selectTrip = (id: string) => {
    setSelectedTripId(id)
    setView('calendar')
    setShowSidebar(false)
    setProfileOpen(false)
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
    if (!draft.allDay && minutes(draft.end) === minutes(draft.start)) {
      const message = 'Start and end time cannot be the same. Choose a different end time.'
      setEventError(message)
      notify(message)
      return
    }
    const startDate = draft.date
    const endDate = !draft.allDay && minutes(draft.end) < minutes(draft.start) ? addDays(draft.date, 1) : draft.date
    const conflict = events.some((item) => item.id !== editing?.id && item.date === draft.date &&
      minutes(item.start) < minutes(draft.end) &&
      minutes(item.end) > minutes(draft.start) &&
      (item.kind === 'master' || item.owner === userId || item.participants.includes(userId)))
    try {
      if (!isSupabaseConfigured) {
        const localEvent: EventItem = {
          id: editing?.id || `demo-event-${Date.now()}`, date: draft.date, endDate, start: draft.start, end: draft.end,
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
      notify(getUserFriendlyError(error, 'event deletion'))
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
      notify(getUserFriendlyError(error, 'trip settings'))
      throw error
    }
  }
  const saveTripBanner = async (file: File | null) => {
    if (!trip) return
    if (!isSupabaseConfigured) {
      if (file) {
        validateTripBanner(file)
        const next = { ...trip, banner_image_path: null, banner_image_url: URL.createObjectURL(file), banner_position_x: 50, banner_position_y: 50 }
        setTrip(next)
        setTrips((current) => current.map((item) => item.id === trip.id ? next : item))
      } else {
        const next = { ...trip, banner_image_path: null, banner_image_url: null }
        setTrip(next)
        setTrips((current) => current.map((item) => item.id === trip.id ? next : item))
      }
      notify(file ? 'Trip banner updated' : 'Trip banner removed')
      return
    }
    if (file) await uploadTripBanner(trip.id, file, trip.banner_image_path)
    else await removeTripBanner(trip.id, trip.banner_image_path)
    await loadTrips(userId)
    await loadTrip(trip.id)
    notify(file ? 'Trip banner updated' : 'Trip banner removed')
  }
  const saveTripBannerPosition = async (x: number, y: number) => {
    if (!trip) return
    if (!isSupabaseConfigured) {
      const next = { ...trip, banner_position_x: x, banner_position_y: y }
      setTrip(next)
      setTrips((current) => current.map((item) => item.id === trip.id ? next : item))
      return
    }
    await updateTripBannerPosition(trip.id, x, y)
    await loadTrips(userId)
    await loadTrip(trip.id)
    notify('Trip banner crop saved')
  }
  const leaveCurrentTrip = async () => {
    if (!trip) return
    const current = members.find((member) => member.id === userId)
    if (current?.role === 'admin' && members.filter((member) => member.role === 'admin').length <= 1) {
      throw new Error('The sole trip admin cannot leave. Promote another member first.')
    }
    if (isSupabaseConfigured) {
      await leaveTripRequest(trip.id)
      await loadTrips(userId)
    } else {
      setTrips((items) => items.filter((item) => item.id !== trip.id))
    }
    setTrip(null)
    setSelectedTripId('')
    setEvents([])
    setMembers([])
    setShowSettings(false)
    setView('trips')
    notify('You left the trip')
  }
  const promoteMember = async (targetUserId: string) => {
    if (!trip) return
    if (isSupabaseConfigured) {
      await promoteTripAdminRequest(trip.id, targetUserId)
      await Promise.all([loadTrips(userId), loadTrip(trip.id)])
    } else {
      setMembers((items) => items.map((member) => member.id === targetUserId ? { ...member, role: 'admin' } : member))
    }
    notify('Traveler promoted to admin')
  }

  if (authLoading) return <Loading message="Loading your trips…" />
  if (recoveryMode) return <PasswordRecoveryScreen error={authError} notice={authNotice} onSubmit={completeRecovery} />
  if (!authed) return <AuthScreen onSubmit={login} error={authError} notice={authNotice} onRecovery={requestRecovery} />
  if (view === 'trips') return <Dashboard trips={trips} loading={dataLoading} error={dataError} userId={userId} userName={userName} userEmail={userEmail} onOpen={selectTrip} onCreate={createNewTrip} onJoin={joinExistingTrip} onLogout={logout} onDeleteAccount={deleteAccount} onUpdateName={saveAccountName} />
  if (!trip) return <Loading message="Choose a trip to continue" />
  const weekStart = startOfWeek(calendarDate)
  const tripNow = getTripNow(trip.timezone, new Date(nowTick))
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const monthStartDate = monthStart(calendarDate)
  const monthGridStart = startOfWeek(monthStartDate)
  const monthDates = Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index))
  const visibleEvents = events.filter((event) => {
    if (event.kind === 'master') return visible.master
    if (event.owner && visible[event.owner]) return true
    return event.participants.includes(userId) && visible[userId] !== false
  })
  const currentMember = members.find((member) => member.id === userId)
  const canManageMaster = currentMember?.role === 'admin' || !isSupabaseConfigured
  const moveCalendar = (amount: number) => setCalendarDate((current) => calendarView === 'week' ? addDays(current, amount * 7) : addMonths(current, amount))
  const goToday = () => setCalendarDate(tripNow.date)
  const shareTrip = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(trip.invite_code)
      notify('Invite code copied')
    } catch {
      notify(`Copy unavailable — invite code: ${trip.invite_code}`)
    }
  }
  const profileLabel = members.find((member) => member.id === userId)?.name || userName || 'Traveler'
  const profileColor = currentMember?.color || getUserColors(userId || 'demo').strong
  const initials = profileLabel.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" type="button" onClick={() => { setView('trips'); setShowSettings(false); setShowSidebar(false) }}><span className="brand-mark"><Sparkles size={17} /></span><span>waypoint</span></button>
      <div className="topbar-actions"><button className="icon-button mobile-only" onClick={() => setShowSidebar(true)}><Menu size={20} /></button><div className="profile-wrap" ref={profileRef}><button className="profile-chip" onClick={() => setProfileOpen((open) => !open)}><span className="avatar avatar-me" style={{ background: profileColor }}>{initials}</span><span className="profile-name">{profileLabel}</span><ChevronDown size={15} /></button>{profileOpen && <div className="profile-menu"><strong>{profileLabel}</strong><span>{userEmail || 'Demo account'}</span>      {currentMember?.role && <small>{currentMember.role === 'admin' ? 'Trip admin' : 'Traveler'}</small>}<button onClick={() => { setProfileOpen(false); setShowAccountSettings(true) }}><Settings size={14} /> Account settings</button>{isSupabaseConfigured && <button className="profile-danger" onClick={() => { setProfileOpen(false); setShowAccountDelete(true) }}><AlertTriangle size={14} /> Delete account</button>}<button onClick={logout}><LogOut size={14} /> Sign out</button></div>}</div></div>
    </header>
    <div className="workspace">
      <aside className={`sidebar ${showSidebar ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header"><div><div className="eyebrow">YOUR TRIPS</div><button className="trip-select" onClick={() => { setView('trips'); setShowSidebar(false) }}><span className="trip-dot" /> {trip.name} <ChevronDown size={15} /></button></div><div className="sidebar-controls"><button className="sidebar-collapse desktop-only" title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}>{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button><button className="close-sidebar mobile-only" onClick={() => setShowSidebar(false)}><X size={18} /></button></div></div>
        <div className="trip-card"><TripBanner trip={trip} className="trip-cover"><span>{trip.destination.slice(0, 3).toUpperCase()}</span><div className="trip-card-actions"><button onClick={shareTrip} aria-label="Share invite"><Share2 size={15} /></button><button onClick={() => { setShowSettings(true); setShowSidebar(false) }} aria-label="Trip settings"><Settings size={15} /></button></div></TripBanner><div className="trip-card-body"><strong>{trip.name}</strong><span>{trip.destination} · {formatRange(trip)}</span><span className="timezone"><Globe2 size={13} /> {trip.timezone}</span></div></div>
        <div className="sidebar-section"><div className="section-label">CALENDARS <button className="tiny-plus" onClick={() => { setShowCreate(true); setShowSidebar(false) }}><Plus size={15} /></button></div><Toggle label="Master itinerary" icon={<span style={{ color: MASTER_COLOR }}><CalendarDays size={16} /></span>} checked={visible.master} onChange={() => setVisible({ ...visible, master: !visible.master })} tone="master" /><div className="section-label member-label">TRAVELERS</div>{members.map((member) => <Toggle key={member.id} label={`${member.name}${member.id === userId ? ' · You' : ''}${member.role === 'admin' ? ' · Admin' : ''}`} icon={<span className="avatar mini" style={{ background: member.color }}>{member.initials}</span>} checked={visible[member.id] ?? true} onChange={() => setVisible({ ...visible, [member.id]: !(visible[member.id] ?? true) })} />)}</div>
        <div className="sidebar-bottom"><button className="sidebar-link" onClick={() => { setView('trips'); setShowSidebar(false) }}><LayoutGrid size={17} /> All trips</button><button className="sidebar-link" onClick={() => { setShowSettings(true); setShowSidebar(false) }}><Settings size={17} /> Trip settings</button><button className="sidebar-link" onClick={logout}><LogOut size={17} /> Sign out</button></div>
      </aside>
      {showSidebar && <div className="scrim mobile-only" onClick={() => setShowSidebar(false)} />}
      <main className="main-content">
        <div className="content-header"><div><div className="breadcrumb">TRIPS <span>/</span> {trip.name.toUpperCase()}</div><h1>{trip.name}</h1><p className="subtitle">{formatRange(trip)} <span>·</span> {members.length} travelers <span>·</span> <span className="trip-clock">Trip time: {humanTimeZone(trip.timezone)} · {formatTripClock(trip.timezone, new Date(nowTick))}</span></p></div><div className="header-actions"><button className="button secondary" onClick={() => setShowSettings(true)}><Settings size={16} /> <span className="desktop-label">Manage trip</span></button><button className="button primary" onClick={() => setShowCreate(true)}><Plus size={18} /> Add event</button></div></div>
        {dataError && <div className="error-note">{dataError}</div>}
        {dataLoading ? <Loading message="Loading this trip…" /> : <><div className="calendar-toolbar"><div className="toolbar-left"><button className="today-button" onClick={goToday}>Today</button><div className="nav-buttons"><button aria-label="Previous period" onClick={() => moveCalendar(-1)}><ArrowLeft size={17} /></button><button aria-label="Next period" onClick={() => moveCalendar(1)}><ArrowRight size={17} /></button></div><strong className="month-title">{calendarView === 'week' ? monthLabel(weekStart) : monthLabel(monthStartDate)}</strong></div><div className="view-switcher"><button className={calendarView === 'week' ? 'active' : ''} onClick={() => setCalendarView('week')}>Week</button><button className={calendarView === 'month' ? 'active' : ''} onClick={() => setCalendarView('month')}>Month</button></div></div><div className="mobile-filter"><button className="button secondary" onClick={() => setShowSidebar(true)}><CalendarDays size={16} /> Calendars <span className="count-badge">{Object.values(visible).filter(Boolean).length}</span></button></div>{events.length ? calendarView === 'week' ? <CalendarGrid events={visibleEvents} members={members} dates={weekDates} currentUserId={userId} tripNow={tripNow} onSelect={setSelected} /> : <MonthGrid events={visibleEvents} members={members} dates={monthDates} tripNow={tripNow} onSelect={setSelected} /> : <div className="empty-state"><strong>No events yet</strong><span>Add the first plan for this trip.</span><button className="button primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Add event</button></div>}<div className="calendar-footer"><span><span className="legend-line" /> Master itinerary</span><span><span className="legend-dot" /> Personal events</span><span><LockKeyhole size={13} /> Trip members can view event details</span></div></>}
      </main>
    </div>
    {(showCreate || editing) && <EventModal event={editing || undefined} initialDate={calendarDate} members={members} canCreateMaster={canManageMaster} events={events} currentUserId={userId} trip={trip} error={eventError} onClose={() => { setShowCreate(false); setEditing(null); setEventError('') }} onSave={saveEvent} />}
    {selected && <EventDetail event={selected} members={members} currentUserId={userId} canEdit={selected.kind === 'master' ? canManageMaster : selected.owner === userId} attendancePending={attendancePending} onClose={() => setSelected(null)} onJoin={() => joinEvent(selected)} onEdit={() => { setEditing(selected); setSelected(null) }} onDelete={() => removeEvent(selected.id)} />}
    {showSettings && <SettingsModal trip={trip} members={members} currentUserId={userId} canEdit={canManageMaster} onClose={() => setShowSettings(false)} onSave={saveTrip} onBannerChange={saveTripBanner} onBannerPositionChange={saveTripBannerPosition} onDelete={removeTrip} onLeave={leaveCurrentTrip} onPromote={promoteMember} />}
    {showAccountDelete && <AccountDeleteModal userEmail={userEmail} onClose={() => setShowAccountDelete(false)} onDelete={deleteAccount} />}
    {showAccountSettings && <AccountSettingsModal userId={userId} userName={profileLabel} userEmail={userEmail} onClose={() => setShowAccountSettings(false)} onUpdateName={saveAccountName} onDeleteAccount={() => { setShowAccountSettings(false); setShowAccountDelete(true) }} />}
    {toast && <div className="toast"><Check size={16} /> {toast}</div>}
  </div>
}

function Loading({ message }: { message: string }) {
  return <div className="loading-screen"><span className="brand-mark"><Sparkles size={17} /></span><p>{message}</p></div>
}

function AuthScreen({ onSubmit, error, notice, onRecovery }: { onSubmit: (e: FormEvent<HTMLFormElement>, mode?: 'signin' | 'signup') => void; error: string; notice: string; onRecovery: (email: string) => Promise<void> }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'recovery'>('signin')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryPending, setRecoveryPending] = useState(false)
  const submitRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setRecoveryPending(true)
    try { await onRecovery(recoveryEmail) } finally { setRecoveryPending(false) }
  }
  if (mode === 'recovery') return <div className="auth-page"><div className="auth-form-wrap"><div className="auth-form"><div className="mobile-auth-brand brand"><span className="brand-mark"><Sparkles size={17} /></span><span>waypoint</span></div><p className="eyebrow">PASSWORD RECOVERY</p><h2>Reset your password.</h2><p className="auth-subtitle">Enter your email and we’ll send a secure recovery link.</p><form onSubmit={submitRecovery}><label>Email address<input required type="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="you@example.com" /></label>{error && <div className="error-note">{error}</div>}{notice && <div className="neutral-note">{notice}</div>}<button disabled={recoveryPending} className="button primary wide">{recoveryPending ? 'Sending…' : 'Send reset link'} <ArrowRight size={17} /></button></form><p className="signup-copy"><button type="button" className="text-button" onClick={() => setMode('signin')}>Back to sign in</button></p></div></div></div>
  return <div className="auth-page"><div className="auth-visual"><div className="brand inverse"><span className="brand-mark"><Sparkles size={17} /></span><span>waypoint</span></div><div className="visual-copy"><p className="eyebrow light">TRAVEL TOGETHER, BETTER</p><h1>Every trip has a story. <em>Plan yours together.</em></h1><p>One shared itinerary for the group. Space for everyone’s own adventure.</p></div><div className="quote-card"><span className="quote-mark">“</span><p>The best trips are the ones where the plan leaves room for the unexpected.</p><small>— Waypoint philosophy</small></div></div><div className="auth-form-wrap"><div className="auth-form"><div className="mobile-auth-brand brand"><span className="brand-mark"><Sparkles size={17} /></span><span>waypoint</span></div><p className="eyebrow">{mode === 'signin' ? 'WELCOME BACK' : 'JOIN WAYPOINT'}</p><h2>Make room for good times.</h2><p className="auth-subtitle">{mode === 'signin' ? 'Sign in to pick up where you left off.' : 'Create an account and start planning together.'}</p><form onSubmit={(event) => onSubmit(event, mode === 'signup' ? 'signup' : 'signin')}>{mode === 'signup' && <label>Your name<input required name="displayName" placeholder="Alex Morgan" /></label>}<label>Email address<input required name="email" type="email" placeholder="you@example.com" /></label><label>Password<input required name="password" type="password" minLength={6} placeholder="••••••••" /></label>{error && <div className="error-note">{error}</div>}{notice && <div className="neutral-note">{notice}</div>}<button className="button primary wide">{mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={17} /></button></form>{mode === 'signin' && <button type="button" className="text-button forgot-link" onClick={() => setMode('recovery')}>Forgot password?</button>}<p className="signup-copy">{mode === 'signin' ? 'New to Waypoint?' : 'Already have an account?'} <button type="button" className="text-button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></p><small className="demo-hint">{isSupabaseConfigured ? 'Powered by Supabase Auth' : 'Demo mode: use any email and password'}</small></div></div></div>
}

function PasswordRecoveryScreen({ error, notice, onSubmit }: { error: string; notice: string; onSubmit: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [validationError, setValidationError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!password) return setValidationError('Password cannot be blank.')
    if (password.length < 6) return setValidationError('Password must be at least 6 characters.')
    if (password !== confirmation) return setValidationError('Passwords do not match.')
    setValidationError('')
    setPending(true)
    try { await onSubmit(password) } finally { setPending(false) }
  }
  return <div className="auth-page"><div className="auth-form-wrap"><div className="auth-form"><div className="mobile-auth-brand brand"><span className="brand-mark"><Sparkles size={17} /></span><span>waypoint</span></div><p className="eyebrow">PASSWORD RECOVERY</p><h2>Choose a new password.</h2><p className="auth-subtitle">Your secure recovery session is ready.</p><form onSubmit={submit}><label>New password<input required type="password" autoComplete="new-password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm new password<input required type="password" autoComplete="new-password" minLength={6} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{(validationError || error) && <div className="error-note">{validationError || error}</div>}{notice && <div className="neutral-note">{notice}</div>}<button disabled={pending} className="button primary wide">{pending ? 'Updating…' : 'Update password'} <ArrowRight size={17} /></button></form></div></div></div>
}

function Dashboard({ trips, loading, error, userId, userName, userEmail, onOpen, onCreate, onJoin, onLogout, onDeleteAccount, onUpdateName }: { trips: TripRow[]; loading: boolean; error: string; userId: string; userName: string; userEmail: string; onOpen: (id: string) => void; onCreate: (input: Pick<TripRow, 'name' | 'destination' | 'start_date' | 'end_date' | 'timezone' | 'description'>) => Promise<void>; onJoin: (code: string) => Promise<void>; onLogout: () => void; onDeleteAccount: () => Promise<void>; onUpdateName: (name: string) => Promise<void> }) {
  const [modal, setModal] = useState<'create' | 'join' | null>(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [accountDeleteOpen, setAccountDeleteOpen] = useState(false)
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const profileRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!profileMenuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [profileMenuOpen])
  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError(''); setActionMessage(''); setActionLoading(true)
    const form = new FormData(event.currentTarget)
    try {
      await onCreate({ name: String(form.get('name')), destination: String(form.get('destination')), start_date: String(form.get('start_date')), end_date: String(form.get('end_date')), timezone: String(form.get('timezone')), description: String(form.get('description') || '') })
      setActionMessage('Trip created')
      setModal(null)
    } catch (error) { setFormError(getUserFriendlyError(error, 'trip creation')) } finally { setActionLoading(false) }
  }
  const submitJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError(''); setActionMessage(''); setActionLoading(true)
    try { await onJoin(String(new FormData(event.currentTarget).get('code'))); setActionMessage('Trip joined'); setModal(null) } catch (error) { setFormError(getUserFriendlyError(error, 'join trip')) } finally { setActionLoading(false) }
  }
  const profileLabel = userName || userEmail.split('@')[0] || 'Traveler'
  const initials = profileLabel.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const profileColor = getUserColors(userId || 'demo').strong
  return <div className="dashboard"><header className="topbar"><button className="brand" type="button" onClick={() => { setProfileMenuOpen(false); setModal(null) }}><span className="brand-mark"><Sparkles size={17} /></span><span>waypoint</span></button><div className="profile-wrap" ref={profileRef}><button className="profile-chip" onClick={() => setProfileMenuOpen((open) => !open)}><span className="avatar avatar-me" style={{ background: profileColor }}>{initials}</span><span className="profile-name">{profileLabel}</span><ChevronDown size={15} /></button>{profileMenuOpen && <div className="profile-menu"><strong>{profileLabel}</strong><span>{userEmail || 'Demo account'}</span><button onClick={() => { setProfileMenuOpen(false); setAccountSettingsOpen(true) }}><Settings size={14} /> Account settings</button>{isSupabaseConfigured && <button className="profile-danger" onClick={() => { setProfileMenuOpen(false); setAccountDeleteOpen(true) }}><AlertTriangle size={14} /> Delete account</button>}<button onClick={onLogout}><LogOut size={14} /> Sign out</button></div>}</div></header><main className="dashboard-content"><div className="dashboard-heading"><div><h1>Your trips</h1><p className="subtitle">The plans worth looking forward to.</p></div><div className="dashboard-actions"><button className="button primary" onClick={() => setModal('create')}><Plus size={18} /> Create a trip</button><button className="button secondary" onClick={() => setModal('join')}><Users size={16} /> Join a trip</button></div></div>{error && <div className="error-note">{error}</div>}{actionMessage && <div className="success-note">{actionMessage}</div>}{loading ? <Loading message="Loading your trips…" /> : trips.length === 0 ? <div className="empty-state"><strong>No trips yet</strong><span>Create a trip or join one with an invite code.</span><div className="empty-actions"><button className="button primary" onClick={() => setModal('create')}><Plus size={17} /> Create a trip</button><button className="button secondary" onClick={() => setModal('join')}><Users size={16} /> Join a trip</button></div></div> : <div className="trip-grid">{trips.map((item) => <button className="dashboard-trip-card" key={item.id} onClick={() => onOpen(item.id)}>  <TripBanner trip={item} className="dashboard-cover">{item.destination.slice(0, 3).toUpperCase()} <span>{formatRange(item)}</span></TripBanner><div className="dashboard-trip-info"><div><strong>{item.name}</strong><span>{item.destination}</span></div><ArrowRight size={18} /></div></button>)}<button className="new-trip-card" onClick={() => setModal('join')}><span><Plus size={21} /></span><strong>Join a trip</strong><small>Use an invite code to join friends</small></button></div>}{modal === 'create' && <TripCreateModal error={formError} loading={actionLoading} onClose={() => setModal(null)} onSubmit={submitCreate} />}{modal === 'join' && <div className="modal-backdrop"><form className="modal" onSubmit={submitJoin}><ModalHeader title="Join a trip" onClose={() => setModal(null)} /><p className="modal-intro">Enter the invite code shared by your trip admin.</p><label>Invite code<input autoFocus required name="code" placeholder="e.g. CHI26" /></label>{formError && <div className="error-note">{formError}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancel</button><button disabled={actionLoading} className="button primary">{actionLoading ? 'Joining…' : 'Join trip'}</button></div></form></div>  }{accountDeleteOpen && isSupabaseConfigured && <AccountDeleteModal userEmail={userEmail} onClose={() => setAccountDeleteOpen(false)} onDelete={onDeleteAccount} />}{accountSettingsOpen && <AccountSettingsModal userId={userId} userName={profileLabel} userEmail={userEmail} onClose={() => setAccountSettingsOpen(false)} onUpdateName={onUpdateName} onDeleteAccount={() => { setAccountSettingsOpen(false); setAccountDeleteOpen(true) }} />}</main></div>
}

function TripCreateModal({ error, loading, onClose, onSubmit }: { error: string; loading: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-backdrop"><form className="modal" onSubmit={onSubmit}><ModalHeader title="Create a trip" onClose={onClose} /><p className="modal-intro">Set up the shared space for your travelers.</p><label>Trip name<input autoFocus required name="name" placeholder="Chicago Friends Trip" /></label><label>Destination<input required name="destination" placeholder="Chicago, Illinois" /></label><div className="form-row"><label>Start date<input required type="date" name="start_date" /></label><label>End date<input required type="date" name="end_date" /></label></div><label>Trip timezone<select name="timezone" defaultValue="America/Chicago">{TIMEZONE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>Description<textarea name="description" rows={3} placeholder="Optional notes for the group" /></label>{error && <div className="error-note">{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button disabled={loading} className="button primary">{loading ? 'Creating…' : 'Create trip'}</button></div></form></div>
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

function CalendarGrid({ events, members, dates, currentUserId, tripNow, onSelect }: { events: EventItem[]; members: Member[]; dates: string[]; currentUserId?: string; tripNow: TripNow; onSelect: (event: EventItem) => void }) {
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
    const colors = getDisplayColors(event.owner || '', event.kind === 'master')
    return <button key={key} className={`event-card ${event.kind} ${event.visibility} ${isEventPast(event, tripNow) ? 'past-event' : isEventCurrent(event, tripNow) ? 'current-event' : ''}`} style={{ top: `${top}px`, height: `${height}px`, left: `calc(${left}% + 5px)`, width: `calc(${width}% - 10px)`, right: 'auto', '--event-color': colors.strong, '--event-tint': colors.tint } as React.CSSProperties} onClick={() => onSelect(event)}>
      <span className="event-type">{eventLabel(event, members, currentUserId)}</span>
      <strong>{event.title}</strong>
      <span className="event-time">{formatTime(event.start)} – {formatTime(event.end)}</span>
      {event.location && <span className="event-location"><MapPin size={11} /> {event.location}</span>}
      {event.kind !== 'master' && event.participants.length > 1 && <span className="attendee-count"><Users size={11} /> {event.participants.length}</span>}
    </button>
  }
  return <div className="calendar"><div className="calendar-scroll"><div className="calendar-grid-content"><div className="calendar-vertical-scroll" ref={scrollRef}><div className="calendar-head"><div className="time-gutter" />{dates.map((date) => <div className={`day-head ${date === tripNow.date ? 'today' : date < tripNow.date ? 'past-day' : ''}`} key={date}><span>{weekdayLabel(date).split(' ')[0]}</span><b>{date.slice(8, 10)}</b></div>)}</div><div className="all-day-row"><div className="all-day-label">ALL DAY</div>{dates.map((date) => <div className={`all-day-column ${date < tripNow.date ? 'past-day' : ''}`} key={date}>{allDayEvents.filter((event) => date >= event.date && date <= (event.endDate && event.endDate >= event.date ? event.endDate : event.date)).map((event) => { const colors = getDisplayColors(event.owner || '', event.kind === 'master'); return <button key={event.id} className={`all-day-event ${event.kind} ${isEventPast(event, tripNow) ? 'past-event' : ''}`} style={{ '--event-color': colors.strong, '--event-tint': colors.tint } as React.CSSProperties} onClick={() => onSelect(event)}>{event.title}</button> })}</div>)}</div><div className="calendar-body"><div className="calendar-body-inner"><div className="time-column">{hours.map((hour) => <span key={hour}>{timeLabel(hour)}</span>)}</div><div className="day-columns">{dates.map((date) => <div className={`day-column ${date < tripNow.date ? 'past-day' : ''} ${date === tripNow.date ? 'today-column' : ''}`} key={date}>{hours.slice(0, -1).map((hour) => <div className="hour-line" key={hour} />)}{date === tripNow.date && <div className="current-time-marker" style={{ top: `${tripNow.minutes / 60 * hourHeight}px` }}><span>{formatTime(tripNow.time)}</span></div>}{layoutDayEvents(timedEvents, date).map(({ event, segment, column, columns }) => eventButton(event, segment, `${event.id}-${date}`, column, columns))}</div>)}</div></div></div></div></div></div></div>
}

function MonthGrid({ events, members, dates, tripNow, onSelect }: { events: EventItem[]; members: Member[]; dates: string[]; tripNow: TripNow; onSelect: (event: EventItem) => void }) {
  return <div className="month-calendar"><div className="month-scroll"><div className="month-grid-content"><div className="month-weekdays">{['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{dates.map((date) => <div className={`month-day ${date.slice(0, 7) !== dates[15].slice(0, 7) ? 'outside' : ''} ${date < tripNow.date ? 'past-day' : ''} ${date === tripNow.date ? 'today' : ''}`} key={date}><b>{date.slice(8, 10)}</b><div className="month-events">{events.filter((event) => event.date === date).map((event) => { const colors = getDisplayColors(event.owner || '', event.kind === 'master'); return <button key={event.id} className={`month-event ${event.kind} ${isEventPast(event, tripNow) ? 'past-event' : ''}`} style={{ '--event-color': colors.strong, '--event-tint': colors.tint } as React.CSSProperties} onClick={() => onSelect(event)}><span>{event.start} {event.title}</span></button> })}</div></div>)}</div></div></div></div>
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
  const rollsToNextDay = !allDay && minutes(end) < minutes(start)
  const conflict = useMemo(() => events.some((item) => item.id !== event?.id && item.date === date && minutes(item.start) < minutes(end) && minutes(item.end) > minutes(start) && (item.kind === 'master' || item.owner === currentUserId || item.participants.includes(currentUserId))), [events, event, date, start, end, currentUserId])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!allDay && minutes(end) === minutes(start)) {
      setValidationError('Start and end time cannot be the same. Choose a different end time.')
      return
    }
    setValidationError('')
    onSave({ date, start, end, title: title || 'New activity', location, kind: canCreateMaster ? kind : 'personal', owner: event?.owner || currentUserId, visibility: kind === 'master' ? 'open' : visibility, capacity: event?.capacity || null, allDay, invitedIds })
  }
  return <div className="modal-backdrop"><form className="modal event-modal" onSubmit={submit}><ModalHeader title={event ? 'Edit event' : 'Add an activity'} onClose={onClose} /><p className="modal-intro">{event ? 'Update the plan for everyone who is tracking this trip.' : 'Add your own plans around the shared itinerary.'}</p>{canCreateMaster && <label>Event type<select value={kind} onChange={(e) => setKind(e.target.value as EventKind)}><option value="personal">Personal event</option><option value="master">Master itinerary event</option></select></label>}<label>Title<input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Beach afternoon" /></label><div className="form-row"><label>Date<input required type="date" min={trip.start_date} max={trip.end_date} value={date} onChange={(e) => setDate(e.target.value)} /></label><label>Location<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Add a place" /></label></div><label className="check-label"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All-day event</label><div className="form-row"><label>Starts<input disabled={allDay} required type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label><label>Ends<input disabled={allDay} required type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>{rollsToNextDay && <div className="info-note"><Clock3 size={15} /> This event will end the following day — Ends {formatDate(addDays(date, 1))} at {formatTime(end)}.</div>}{kind !== 'master' && <label>Who can join?<select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}><option value="open">Open to join · Anyone can join</option><option value="invite">Invite only · Invited travelers</option><option value="private">Private / solo · Just me</option></select></label>}{visibility === 'invite' && kind !== 'master' && <div className="invite-picker"><span className="field-label">Invite travelers</span>{members.filter((member) => member.id !== currentUserId).map((member) => <label className="invite-option" key={member.id}><input type="checkbox" checked={invitedIds.includes(member.id)} onChange={() => setInvitedIds((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])} /><span className="avatar mini" style={{ background: member.color }}>{member.initials}</span>{member.name}</label>)}</div>}{conflict && <div className="warning-note"><Clock3 size={15} /> This overlaps a master event or an event you own or joined. You can still save it.</div>}{visibility === 'open' && kind !== 'master' && <div className="info-note"><Users size={15} /> Your travelers will be able to see and join this activity.</div>}{(validationError || error) && <div className="error-note">{validationError || error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{event ? 'Save changes' : 'Create event'}</button></div></form></div>
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
  return <div className="modal-backdrop"><div className="modal detail-modal"><ModalHeader title={isMaster ? 'Master itinerary' : event.title} onClose={onClose} /><div className={`detail-banner ${isMaster ? 'master' : ''}`}><span className="event-type">{isMaster ? 'OFFICIAL GROUP EVENT' : event.visibility === 'private' ? 'PRIVATE EVENT' : event.visibility === 'invite' ? 'INVITE-ONLY EVENT' : 'PERSONAL EVENT'}</span>{!isMaster && <h2>{event.title}</h2>}</div>{isMaster && <h2 className="detail-title">{event.title}</h2>}<div className="detail-meta"><div><Clock3 size={17} /><span><strong>{dateLabel(event.date)}</strong>{event.allDay ? 'All day' : `${formatTime(event.start)} – ${formatTime(event.end)}${event.endDate && event.endDate !== event.date ? ` · Ends ${dateLabel(event.endDate)}` : ''}`}</span></div>{event.location && <div><MapPin size={17} /><span>{event.location}</span></div>}<div><UserRound size={17} /><span>{isMaster ? 'Everyone in the trip' : `Organized by ${member?.name || 'you'}`}</span></div></div>{event.description && <p className="detail-description">{event.description}</p>}{!isMaster && <div className="attending"><div className="attending-heading"><strong>{event.participants.length} attending</strong>{event.capacity && <span>{Math.max(0, event.capacity - event.participants.length)} spots left</span>}</div><div className="attendee-list">{event.participants.map((id) => { const person = members.find((m) => m.id === id); return person && <span key={id} className="attendee"><span className="avatar mini" style={{ background: person.color }}>{person.initials}</span>{person.name === 'You' || id === currentUserId ? 'You' : person.name.split(' ')[0]}</span> })}</div></div>}{isMaster ? <div className="locked-note"><LockKeyhole size={16} /><span><strong>{canEdit ? 'You can manage this master event.' : 'This event is part of the master itinerary.'}</strong> {canEdit ? 'Changes are visible to the whole trip.' : 'Only trip admins can make changes.'}</span></div> : <div className="modal-actions detail-actions">{canJoin && <button disabled={attendancePending} className={`button ${attending ? 'secondary' : 'primary'}`} onClick={onJoin}>{attendancePending ? 'Updating…' : attending ? <><Check size={16} /> Leave event</> : <>Join event <ArrowRight size={16} /></>}</button>}{!isOwner && event.visibility === 'invite' && !canJoin && <div className="locked-note"><LockKeyhole size={16} /><span>You can view this invite-only event, but only invited travelers can join.</span></div>}{canEdit && <><button className="button secondary" onClick={onEdit}>Edit event</button><button className="button danger" onClick={onDelete}>Delete</button></>}</div>}{isMaster && canEdit && <div className="modal-actions detail-actions"><button className="button secondary" onClick={onEdit}>Edit event</button><button className="button danger" onClick={onDelete}>Delete</button></div>}</div></div>
}
function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) { return <div className="modal-header"><div><p className="eyebrow">TRIP CALENDAR</p><h3>{title}</h3></div><button className="icon-button" type="button" onClick={onClose}><X size={19} /></button></div> }
function SettingsModal({ trip, members, currentUserId, canEdit, onClose, onSave, onBannerChange, onBannerPositionChange, onDelete, onLeave, onPromote }: {
  trip: TripRow
  members: Member[]
  currentUserId: string
  canEdit: boolean
  onClose: () => void
  onSave: (input: Partial<Pick<TripRow, 'name' | 'destination' | 'start_date' | 'end_date' | 'timezone' | 'description'>>) => Promise<void>
  onBannerChange: (file: File | null) => Promise<void>
  onBannerPositionChange: (x: number, y: number) => Promise<void>
  onDelete: () => Promise<void>
  onLeave: () => Promise<void>
  onPromote: (userId: string) => Promise<void>
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  const [deleteText, setDeleteText] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deletePending, setDeletePending] = useState(false)
  const [leaveText, setLeaveText] = useState('')
  const [leaveError, setLeaveError] = useState('')
  const [leavePending, setLeavePending] = useState(false)
  const [memberPending, setMemberPending] = useState<string | null>(null)
  const [memberError, setMemberError] = useState('')
  const [memberSuccess, setMemberSuccess] = useState('')
  const [savePending, setSavePending] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [bannerPending, setBannerPending] = useState(false)
  const [bannerError, setBannerError] = useState('')
  const [bannerX, setBannerX] = useState(trip.banner_position_x ?? 50)
  const [bannerY, setBannerY] = useState(trip.banner_position_y ?? 50)
  const [cropPending, setCropPending] = useState(false)
  const [cropError, setCropError] = useState('')
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const canDelete = deleteText.trim().toUpperCase() === 'DELETE' || deleteText.trim().toLowerCase() === trip.name.trim().toLowerCase()
  const currentMember = members.find((member) => member.id === currentUserId)
  const otherAdminExists = members.some((member) => member.id !== currentUserId && member.role === 'admin')
  const canLeave = Boolean(currentMember && leaveText.trim().toUpperCase() === 'LEAVE' && (currentMember.role !== 'admin' || otherAdminExists))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaveError('')
    setSavePending(true)
    const form = new FormData(event.currentTarget)
    try {
      await onSave({ name: String(form.get('name')), destination: String(form.get('destination')), start_date: String(form.get('start_date')), end_date: String(form.get('end_date')), timezone: String(form.get('timezone')), description: String(form.get('description') || '') })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save trip settings')
    } finally {
      setSavePending(false)
    }
  }
  const confirmLeave = async () => {
    if (!canLeave) return
    setLeaveError('')
    setLeavePending(true)
    try {
      await onLeave()
    } catch (error) {
      setLeaveError(error instanceof Error ? error.message : 'Unable to leave this trip.')
    } finally {
      setLeavePending(false)
    }
  }
  const promote = async (member: Member) => {
    if (!window.confirm(`Make ${member.name} a trip admin?`)) return
    setMemberError('')
    setMemberSuccess('')
    setMemberPending(member.id)
    try {
      await onPromote(member.id)
      setMemberSuccess(`${member.name} is now an admin.`)
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : 'Unable to promote this traveler.')
    } finally {
      setMemberPending(null)
    }
  }
  const confirmDelete = async () => {
    if (!canDelete) return
    setDeleteError('')
    setDeletePending(true)
    try { await onDelete() } catch (error) { setDeleteError(error instanceof Error ? error.message : 'Unable to delete this trip.') } finally { setDeletePending(false) }
  }
  const changeBanner = async (file: File | null) => {
    setBannerError('')
    if (file) {
      try { validateTripBanner(file) } catch (error) { setBannerError(error instanceof Error ? error.message : 'Invalid banner image.'); return }
    }
    setBannerPending(true)
    try { await onBannerChange(file) } catch (error) { setBannerError(error instanceof Error ? error.message : 'Unable to update the trip banner.') } finally { setBannerPending(false) }
  }
  const saveCrop = async () => {
    setCropError('')
    setCropPending(true)
    try { await onBannerPositionChange(bannerX, bannerY) } catch (error) { setCropError(error instanceof Error ? error.message : 'Unable to save the banner crop.') } finally { setCropPending(false) }
  }
  const cancelCrop = () => {
    setBannerX(trip.banner_position_x ?? 50)
    setBannerY(trip.banner_position_y ?? 50)
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }} onTouchEnd={(event) => { if (event.target === event.currentTarget) onClose() }}><form className="modal settings-modal" onMouseDown={(event) => event.stopPropagation()} onTouchEnd={(event) => event.stopPropagation()} onSubmit={submit}><ModalHeader title="Trip settings" onClose={onClose} /><label>Trip name<input disabled={!canEdit} name="name" defaultValue={trip.name} /></label><label>Destination<input disabled={!canEdit} name="destination" defaultValue={trip.destination} /></label><div className="form-row"><label>Start date<input disabled={!canEdit} type="date" name="start_date" defaultValue={trip.start_date} /></label><label>End date<input disabled={!canEdit} type="date" name="end_date" defaultValue={trip.end_date} /></label></div><label>Trip timezone<select disabled={!canEdit} name="timezone" defaultValue={trip.timezone}>{!TIMEZONE_OPTIONS.some((option) => option.id === trip.timezone) && <option value={trip.timezone}>{trip.timezone}</option>}{TIMEZONE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>Description<textarea disabled={!canEdit} name="description" defaultValue={trip.description || ''} rows={3} /></label><label>Invite code<input readOnly value={trip.invite_code} /></label>  <div className="banner-settings"><strong>Trip banner</strong>{trip.banner_image_url ? <><TripBanner trip={{ ...trip, banner_position_x: bannerX, banner_position_y: bannerY }} className="banner-preview" />  {canEdit && <div className="crop-controls"><label>Horizontal position<input disabled={cropPending} type="range" min="0" max="100" value={bannerX} onChange={(event) => setBannerX(Number(event.target.value))} /></label><label>Vertical position<input disabled={cropPending} type="range" min="0" max="100" value={bannerY} onChange={(event) => setBannerY(Number(event.target.value))} /></label><div className="banner-actions"><button type="button" className="button secondary" disabled={cropPending} onClick={cancelCrop}>Cancel</button><button type="button" className="button primary" disabled={cropPending} onClick={() => void saveCrop()}>{cropPending ? 'Saving…' : 'Save crop'}</button></div>{cropError && <div className="error-note">{cropError}</div>}</div>}</> : <div className="banner-preview banner-placeholder">Default trip image</div>}{canEdit ? <div className="banner-actions"><input ref={bannerInputRef} hidden type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void changeBanner(file) }} /><button type="button" className="button secondary" disabled={bannerPending} onClick={() => bannerInputRef.current?.click()}>{bannerPending ? 'Uploading…' : trip.banner_image_url ? 'Replace image' : 'Upload image'}</button>{trip.banner_image_url && <button type="button" className="button danger" disabled={bannerPending} onClick={() => void changeBanner(null)}>Remove</button>}</div> : <span className="banner-member-note">Only trip admins can change the banner.</span>}{bannerError && <div className="error-note">{bannerError}</div>}<small>JPG, PNG, or WebP · up to 5 MB</small></div><div className="members-settings"><strong>Travelers · {members.length}</strong>{members.map((m) => <div key={m.id}><span className="avatar mini" style={{ background: m.color }}>{m.initials}</span><span>{m.name}</span>{m.role && <small>{m.role === 'admin' ? 'Admin' : 'Member'}</small>}{canEdit && m.id !== currentUserId && m.role !== 'admin' && <button type="button" className="text-button member-action" disabled={memberPending !== null} onClick={() => promote(m)}>{memberPending === m.id ? 'Promoting…' : 'Make admin'}</button>}</div>)}</div>{memberError && <div className="error-note">{memberError}</div>}{memberSuccess && <div className="success-note">{memberSuccess}</div>}{!canEdit && <div className="locked-note"><LockKeyhole size={16} /> Only trip admins can update trip details.</div>}<div className="leave-zone"><strong>Leave trip</strong><p>Remove your personal events, participation, and membership from this trip. The trip and other travelers are preserved.</p>{currentMember?.role === 'admin' && !otherAdminExists && <div className="warning-note"><AlertTriangle size={15} /> You are the sole admin. Promote another traveler before leaving.</div>}<label>Type <b>LEAVE</b> to confirm<input value={leaveText} onChange={(event) => setLeaveText(event.target.value)} placeholder="LEAVE" /></label>{leaveError && <div className="error-note">{leaveError}</div>}<button type="button" className="button danger" disabled={!canLeave || leavePending} onClick={confirmLeave}>{leavePending ? 'Leaving trip…' : 'Leave trip'}</button></div>{canEdit && <div className="danger-zone"><div><strong>Danger zone</strong><p>Permanent deletion removes this trip, its events, and memberships for everyone.</p></div><label>Type <b>DELETE</b> or the trip name to confirm<input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="DELETE" /></label>{deleteError && <div className="error-note">{deleteError}</div>}<button type="button" className="button danger" disabled={!canDelete || deletePending} onClick={confirmDelete}>{deletePending ? 'Deleting trip…' : 'Permanently delete trip'}</button></div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Close</button>{canEdit && <button disabled={savePending} className="button primary">{savePending ? 'Saving…' : 'Save changes'}</button>}</div>{saveError && <div className="error-note">{saveError}</div>}</form></div>
}

function AccountSettingsModal({ userId, userName, userEmail, onClose, onUpdateName, onDeleteAccount }: { userId: string; userName: string; userEmail: string; onClose: () => void; onUpdateName: (name: string) => Promise<void>; onDeleteAccount: () => void }) {
  const [name, setName] = useState(userName)
  const [nameError, setNameError] = useState('')
  const [nameSuccess, setNameSuccess] = useState('')
  const [namePending, setNamePending] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordPending, setPasswordPending] = useState(false)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !namePending && !passwordPending) onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [namePending, passwordPending, onClose])
  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextName = name.trim()
    setNameError('')
    setNameSuccess('')
    if (!nextName) { setNameError('Username cannot be empty.'); return }
    if (nextName.length > 50) { setNameError('Username must be 50 characters or fewer.'); return }
    setNamePending(true)
    try { await onUpdateName(nextName); setName(nextName); setNameSuccess('Username updated successfully.') } catch (error) {
      if (import.meta.env.DEV) console.error('[waypoint] PROFILE UPDATE FAILURE', { userId, message: error instanceof Error ? error.message : 'Unknown error' })
      setNameError('We couldn’t update your username. Please try again.')
    } finally { setNamePending(false) }
  }
  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')
    if (!password) { setPasswordError('Password cannot be blank.'); return }
    if (password.length < 6) { setPasswordError('Password must be at least 6 characters.'); return }
    if (password !== confirmation) { setPasswordError('Passwords do not match.'); return }
    setPasswordPending(true)
    try { await updatePassword(password); setPassword(''); setConfirmation(''); setPasswordSuccess('Password updated successfully.') } catch (error) {
      if (import.meta.env.DEV) console.error('[waypoint] PASSWORD UPDATE FAILURE', { userId, message: error instanceof Error ? error.message : 'Unknown error' })
      setPasswordError(/reauth|sign.?in|session|auth/i.test(error instanceof Error ? error.message : '') ? 'Please sign in again before changing your password.' : 'We couldn’t update your password. Please try again.')
    } finally { setPasswordPending(false) }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (!namePending && !passwordPending && event.target === event.currentTarget) onClose() }} onTouchEnd={(event) => { if (!namePending && !passwordPending && event.target === event.currentTarget) onClose() }}><div className="modal account-settings-modal" onMouseDown={(event) => event.stopPropagation()} onTouchEnd={(event) => event.stopPropagation()}><ModalHeader title="Account settings" onClose={onClose} /><p className="modal-intro">Manage the name and password used with your Waypoint account.</p><section className="account-section"><h4>Profile</h4><form onSubmit={saveName}><label>Username / display name<input value={name} maxLength={50} onChange={(event) => setName(event.target.value)} /></label>{nameError && <div className="error-note">{nameError}</div>}{nameSuccess && <div className="success-note">{nameSuccess}</div>}<div className="modal-actions"><button disabled={namePending} className="button primary">{namePending ? 'Saving…' : 'Save username'}</button></div></form></section><section className="account-section"><h4>Security</h4><form onSubmit={savePassword}><label>New password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm new password<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{passwordError && <div className="error-note">{passwordError}</div>}{passwordSuccess && <div className="success-note">{passwordSuccess}</div>}<div className="modal-actions"><button disabled={passwordPending} className="button primary">{passwordPending ? 'Updating…' : 'Update password'}</button></div></form></section><section className="account-section account-danger-section"><h4>Danger zone</h4><p>Delete your account, personal events, participation, and memberships permanently.</p><button type="button" className="button danger" onClick={onDeleteAccount}>Delete account</button></section><span className="account-email">{userEmail}</span></div></div>
}

function AccountDeleteModal({ userEmail, onClose, onDelete }: { userEmail: string; onClose: () => void; onDelete: () => Promise<void> }) {
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (pending) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, pending])
  const confirmed = confirmation.trim().toUpperCase() === 'DELETE'
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!confirmed) return
    setError('')
    setPending(true)
    try { await onDelete() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to delete your account.') } finally { setPending(false) }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (!pending && event.target === event.currentTarget) onClose() }} onTouchEnd={(event) => { if (!pending && event.target === event.currentTarget) onClose() }}><form className="modal account-danger-modal" onMouseDown={(event) => event.stopPropagation()} onTouchEnd={(event) => event.stopPropagation()} onSubmit={submit}><ModalHeader title="Delete your account" onClose={onClose} /><div className="danger-intro"><AlertTriangle size={20} /><p>This permanently deletes <strong>{userEmail || 'your account'}</strong>, your personal events, participation, and trip memberships. This cannot be undone.</p></div><p className="modal-intro">If you are the only admin of a trip, account deletion is blocked until another admin is added. Trips with other admins are preserved.</p><label>Type <b>DELETE</b> to confirm<input autoFocus required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="DELETE" /></label>{error && <div className="error-note">{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button disabled={!confirmed || pending} className="button danger">{pending ? 'Deleting account…' : 'Delete account'}</button></div></form></div>
}

export default App
