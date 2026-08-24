export type TripNow = {
  date: string
  time: string
  minutes: number
}

function partsFor(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  const date = `${get('year')}-${get('month')}-${get('day')}`
  const time = `${get('hour')}:${get('minute')}`
  return { date, time }
}

export function getTripNow(timeZone: string, value = new Date()): TripNow {
  const { date, time } = partsFor(value, timeZone)
  const [hour, minute] = time.split(':').map(Number)
  return { date, time, minutes: hour * 60 + minute }
}

export function compareLocalDateTime(date: string, time: string, now: TripNow) {
  return `${date}T${time}`.localeCompare(`${now.date}T${now.time}`)
}

export function isEventPast(event: { date: string; end: string; endDate?: string; allDay?: boolean }, now: TripNow) {
  const endDate = event.endDate && event.endDate >= event.date ? event.endDate : event.date
  return event.allDay ? endDate < now.date : compareLocalDateTime(endDate, event.end, now) < 0
}

export function isEventCurrent(event: { date: string; start: string; end: string; endDate?: string; allDay?: boolean }, now: TripNow) {
  if (event.allDay) return event.date <= now.date && (event.endDate || event.date) >= now.date
  const start = `${event.date}T${event.start}`
  const endDate = event.endDate && event.endDate >= event.date ? event.endDate : event.date
  const end = `${endDate}T${event.end}`
  const current = `${now.date}T${now.time}`
  return start <= current && current < end
}

export function humanTimeZone(timeZone: string) {
  const city = timeZone.split('/').pop()?.replace(/_/g, ' ')
  return city || timeZone
}

export function formatTripClock(timeZone: string, value = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}
