// Load .env.local into process.env so drizzle-kit can read POSTGRES_URL
// without requiring the caller to source it manually. Production deployments
// (Vercel) inject POSTGRES_URL directly into process.env, so this is a no-op
// when the variable is already set.
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: (process.env.DATABASE_URL || process.env.POSTGRES_URL)!,
  },
})
