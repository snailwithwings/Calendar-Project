export const MASTER_COLOR = '#2f7668'
export const MASTER_TINT = '#edf3ef'

const travelerColors = [
  { strong: '#2f5fa7', tint: '#edf2fb' },
  { strong: '#c45b32', tint: '#fbede7' },
  { strong: '#76549a', tint: '#f1edf6' },
  { strong: '#a04468', tint: '#f8edf2' },
  { strong: '#9a6a16', tint: '#f9f3e8' },
  { strong: '#5967a3', tint: '#eef0f8' },
  { strong: '#8a4f35', tint: '#f8efeb' },
  { strong: '#b24b52', tint: '#fbecee' },
  { strong: '#704c8f', tint: '#f2edf8' },
  { strong: '#a06b25', tint: '#fbf3e6' },
]

function colorIndex(userId: string) {
  let hash = 0
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0
  }
  return hash % travelerColors.length
}

export function getUserColors(userId: string) {
  return travelerColors[colorIndex(userId)]
}

export function getTripUserColors(userIds: string[], preferredUserId?: string) {
  const result: Record<string, typeof travelerColors[number]> = {}
  const used = new Set<number>()
  const orderedIds = [...new Set(userIds)].sort((a, b) => a.localeCompare(b))
  if (preferredUserId && orderedIds.includes(preferredUserId)) {
    result[preferredUserId] = getUserColors(preferredUserId)
    used.add(colorIndex(preferredUserId))
  }
  orderedIds.forEach((userId) => {
    if (result[userId]) return
    const start = colorIndex(userId)
    let index = start
    for (let attempt = 0; attempt < travelerColors.length && used.has(index); attempt += 1) {
      index = (start + attempt + 1) % travelerColors.length
    }
    result[userId] = travelerColors[index]
    used.add(index)
  })
  return result
}

export function getDisplayColors(userId: string, master = false) {
  return master ? { strong: MASTER_COLOR, tint: MASTER_TINT } : getUserColors(userId)
}
