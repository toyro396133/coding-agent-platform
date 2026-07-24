import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../lib/db/schema'
import { users } from '../lib/db/schema'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'

const [, , username, password, email, name] = process.argv

if (!username || !password) {
  console.error('Usage: npx tsx scripts/create-user.ts <username> <password> [email] [name]')
  process.exit(1)
}

async function main() {
  const url = process.env.POSTGRES_URL
  if (!url) {
    console.error('POSTGRES_URL environment variable is required')
    process.exit(1)
  }

  const client = postgres(url)
  const db = drizzle(client, { schema }) as any

  const existing = await db.select().from(users).where({ username }).limit(1)

  if (existing.length > 0) {
    console.error('Error: Username already exists')
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const id = nanoid()
  const now = new Date()

  await db.insert(users).values({
    id,
    provider: 'credentials',
    externalId: username,
    accessToken: '',
    username,
    email: email || null,
    name: name || null,
    passwordHash,
    avatarUrl: '',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  })

  console.log('User created successfully')
  process.exit(0)
}

main().catch((err) => {
  console.error('Failed to create user:', err)
  process.exit(1)
})
