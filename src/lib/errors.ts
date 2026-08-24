type ErrorShape = { code?: string; status?: number; message?: string; name?: string }

function shape(error: unknown): ErrorShape {
  if (typeof error === 'object' && error !== null) return error as ErrorShape
  return { message: error instanceof Error ? error.message : '' }
}

export function getUserFriendlyError(error: unknown, context: string) {
  const value = shape(error)
  const message = value.message || ''
  if (value.status === 429 || /too many requests|rate limit/i.test(message)) return 'Too many signup attempts. Please wait a few minutes and try again.'
  if (/failed to fetch|network|fetch/i.test(message)) return "We couldn't connect. Check your internet connection and try again."
  if (value.code === '42501' || /row-level security|permission denied|not authorized/i.test(message)) return "You don't have permission to do that."
  if (value.code === '23514' || /check constraint|end.?time/i.test(message)) return 'Please check the event start and end times.'
  if (context === 'login' || /invalid login credentials|invalid password/i.test(message)) return 'Incorrect email or password.'
  if (context === 'recovery') return "If an account exists for that email, you'll receive a password reset link shortly."
  if (context === 'attendance') return "You can't join or leave this event right now."
  if (context === 'account deletion') return "We couldn't delete your account. Please try again."
  if (context === 'trip deletion') return "We couldn't delete this trip. Please try again."
  if (context === 'trip settings') return "We couldn't save the trip settings. Please try again."
  if (context === 'event') return 'Unable to save event. Please check the event details and try again.'
  if (context === 'join trip') return "We couldn't join that trip. Check the invite code and try again."
  if (context === 'password') return "We couldn't update your password. Please try again."
  return 'Something went wrong. Please try again.'
}
