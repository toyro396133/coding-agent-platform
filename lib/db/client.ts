import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle> | null = null

function createDb() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) {
    // Surface a clear, actionable error so users can fix it via the Freebuff
    // API Keys UI / env panel. We deliberately do NOT print the value back.
    throw new Error(
      'Database is not configured: DATABASE_URL or POSTGRES_URL is missing. Add it via the Freebuff API Keys panel and restart the preview.',
    )
  }
  const client = postgres(url)
  return drizzle(client, { schema })
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    if (!_db) {
      _db = createDb()
    }
    return Reflect.get(_db!, prop)
  },
})
