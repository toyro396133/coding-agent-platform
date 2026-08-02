import { EventEmitter } from 'node:events'

/**
 * In-process pub/sub event bus for job status events.
 *
 * Mirrors Redis pub/sub semantics (publish / subscribe per job channel) so it
 * can be swapped for a Redis-backed implementation in multi-instance
 * deployments without changing call sites. Transports (SSE, WebSocket) consume
 * events via subscribeJob and push them to connected clients in real time —
 * no DB polling needed.
 */

export interface JobEvent {
  type: 'status' | 'cancelled'
  jobId: string
  status?: string
  progress?: number
  timestamp: number
}

const emitter = new EventEmitter()
// Many concurrent stream connections may subscribe to different channels;
// avoid the default "possible EventEmitter memory leak" warning.
emitter.setMaxListeners(0)

// Latest event per job, so a subscriber that attaches after a publish still
// receives the current state immediately (replay on subscribe).
const latestEvents = new Map<string, JobEvent>()

const channel = (jobId: string) => `job:${jobId}`

// Terminal event types after which no further updates are expected. The cached
// latest event is dropped so a late-connecting stream (which reads the terminal
// state from the initial DB fetch) still closes correctly, bounding memory.
const TERMINAL_TYPES: JobEvent['type'][] = ['cancelled']

const TERMINAL_STATUSES = ['completed', 'error', 'stopped']

/** Publish an event to all subscribers of the job's channel. */
export function publishJobEvent(jobId: string, event: Omit<JobEvent, 'jobId' | 'timestamp'>): void {
  const full: JobEvent = { ...event, jobId, timestamp: Date.now() }

  // Subscriber handlers must never be able to break a publisher (e.g. a DB
  // write path), so guard the synchronous emit.
  try {
    emitter.emit(channel(jobId), full)
  } catch {
    // Ignore subscriber errors — they must not affect the publisher
  }

  // Drop the cached event for terminal transitions: a stream connecting after
  // this point reads the terminal state from its initial DB fetch and closes
  // correctly, so the replay cache is no longer needed and can be freed.
  const isTerminal = TERMINAL_TYPES.includes(event.type) || (event.status && TERMINAL_STATUSES.includes(event.status))
  if (isTerminal) {
    latestEvents.delete(jobId)
  } else {
    latestEvents.set(jobId, full)
  }
}

/**
 * Subscribe to a job's channel. The handler is invoked immediately with the
 * latest known event (if any), then on every subsequent publish. Returns an
 * unsubscribe function.
 */
export function subscribeJob(jobId: string, handler: (event: JobEvent) => void): () => void {
  const latest = latestEvents.get(jobId)
  if (latest) {
    handler(latest)
  }
  emitter.on(channel(jobId), handler)
  return () => {
    emitter.off(channel(jobId), handler)
  }
}

/** Drop cached state for a job (e.g., after the stream closes). */
export function clearJobEvents(jobId: string): void {
  latestEvents.delete(jobId)
}
