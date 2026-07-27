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
}

const rooms = new Map<string, CollaborationRoom>()

export function createRoom(taskId: string): CollaborationRoom {
  const existing = rooms.get(taskId)
  if (existing) return existing

  const room: CollaborationRoom = {
    taskId,
    users: new Map(),
    messages: [],
    createdAt: Date.now(),
  }
  rooms.set(taskId, room)
  return room
}

export function joinRoom(taskId: string, user: Omit<CollaborationUser, 'joinedAt'>): CollaborationRoom | null {
  const room = rooms.get(taskId)
  if (!room) return null

  room.users.set(user.id, { ...user, joinedAt: Date.now() })
  return room
}

export function leaveRoom(taskId: string, userId: string): boolean {
  const room = rooms.get(taskId)
  if (!room) return false
  return room.users.delete(userId)
}

export function addMessage(taskId: string, message: Omit<CollaborationMessage, 'timestamp'>): CollaborationMessage | null {
  const room = rooms.get(taskId)
  if (!room) return null

  const full: CollaborationMessage = { ...message, timestamp: Date.now() }
  room.messages.push(full)
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
