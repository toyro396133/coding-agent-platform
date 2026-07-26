import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!url) {
  throw new Error(
    'Database is not configured: DATABASE_URL or POSTGRES_URL is missing. Add it via the Freebuff API Keys panel and restart the preview.',
  )
}

export const sql = neon(url)
