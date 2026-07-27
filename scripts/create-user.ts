import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { db } from '../lib/db/client'
import { users } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'

async function main() {
  const username = 'admin'
  const password = 'admin123'

  const existing = await db.select().from(users).where(eq(users.username, username)).limit(1)

  if (existing.length > 0) {
    console.log(`User "${username}" already exists, skipping creation.`)
    return
  }

  const userId = nanoid()
  const hash = await bcrypt.hash(password, 10)

  await db.insert(users).values({
    id: userId,
    provider: 'credentials',
    externalId: userId,
    accessToken: '',
    username,
    passwordHash: hash,
  })

  console.log(`User created: username=${username}, password=${password}, id=${userId}`)
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
