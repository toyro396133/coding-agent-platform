import 'dotenv/config'
import { base64url, EncryptJWT } from 'jose'
import { getUserByUsername } from '../lib/db/users'
import { SESSION_COOKIE_NAME } from '../lib/session/constants'
import { generateId } from '../lib/utils/id'

async function main() {
  const user = await getUserByUsername('admin')
  if (!user) {
    console.error('User "admin" not found')
    process.exit(1)
  }

  const session = {
    created: Date.now(),
    authProvider: 'credentials',
    user: {
      id: user.id,
      username: user.username,
      email: user.email || undefined,
      name: user.name || user.username,
      avatar: user.avatarUrl || '',
    },
  }

  const cookieValue = await new EncryptJWT(session as Record<string, unknown>)
    .setExpirationTime('1y')
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(base64url.decode(process.env.JWE_SECRET!))

  const taskId = generateId(12)

  console.log(`Cookie: ${SESSION_COOKIE_NAME}=${cookieValue}`)
  console.log(`Task: id=${taskId}, prompt="Create a simple Hello World HTML page"`)
}

main()
