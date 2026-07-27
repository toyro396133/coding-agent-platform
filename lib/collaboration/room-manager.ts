export interface CollaborationUser {
  id: string
  name: string
  joinedAt: number
}

export interface CollaborationMessage {
  userId: string
  userName: string
  text: string
  timestamp: number
}

export interface CollaborationRoom {
  taskId: string
  users: Map<string, CollaborationUser>
  messages: CollaborationMessage[]
  createdAt: number
  lastActivityAt: number
}

const rooms = new Map<string, CollaborationRoom>()

// Room limits
const MAX_MESSAGES_PER_ROOM = 1000
const MAX_MESSAGE_SIZE = 5000
const ROOM_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function createRoom(taskId: string): CollaborationRoom {
  const existing = rooms.get(taskId)
  if (existing) {
    existing.lastActivityAt = Date.now()
    return existing
  }

  const room: CollaborationRoom = {
    taskId,
    users: new Map(),
    messages: [],
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  }
  rooms.set(taskId, room)
  return room
}

export function joinRoom(taskId: string, user: Omit<CollaborationUser, 'joinedAt'>): CollaborationRoom | null {
  const room = rooms.get(taskId)
  if (!room) return null

  room.users.set(user.id, { ...user, joinedAt: Date.now() })
  room.lastActivityAt = Date.now()
  return room
}

export function leaveRoom(taskId: string, userId: string): boolean {
  const room = rooms.get(taskId)
  if (!room) return false

  const deleted = room.users.delete(userId)
  room.lastActivityAt = Date.now()

  // Clean up room if no users remain
  if (room.users.size === 0) {
    rooms.delete(taskId)
  }

  return deleted
}

export function addMessage(taskId: string, message: Omit<CollaborationMessage, 'timestamp'>): CollaborationMessage | null {
  const room = rooms.get(taskId)
  if (!room) return null

  // Enforce message size limit
  if (message.text.length > MAX_MESSAGE_SIZE) {
    return null
  }

  const full: CollaborationMessage = { ...message, timestamp: Date.now() }
  room.messages.push(full)
  room.lastActivityAt = Date.now()

  // Enforce message count limit (evict oldest messages)
  if (room.messages.length > MAX_MESSAGES_PER_ROOM) {
    room.messages.splice(0, room.messages.length - MAX_MESSAGES_PER_ROOM)
  }

  return full
}

export function getRoom(taskId: string): { users: CollaborationUser[]; messages: CollaborationMessage[] } | null {
  const room = rooms.get(taskId)
  if (!room) return null
  return {
    users: Array.from(room.users.values()),
    messages: room.messages,
  }
}

export function getRoomUserCount(taskId: string): number {
  const room = rooms.get(taskId)
  return room ? room.users.size : 0
}

export function cleanupRoom(taskId: string): boolean {
  return rooms.delete(taskId)
}

// Clean up inactive rooms (should be called periodically, e.g., via a cron job)
export function cleanupInactiveRooms(): number {
  const now = Date.now()
  let cleanedCount = 0

  for (const [taskId, room] of rooms.entries()) {
    const isExpired = now - room.lastActivityAt > ROOM_TTL_MS
    const isEmpty = room.users.size === 0

    if (isExpired || isEmpty) {
      rooms.delete(taskId)
      cleanedCount++
    }
  }

  return cleanedCount
}
