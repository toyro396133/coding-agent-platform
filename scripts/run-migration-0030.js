const sql = require('postgres')(process.env.POSTGRES_URL)

async function main() {
  try {
    await sql.unsafe("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS execution_mode text DEFAULT 'orchestrator_external' NOT NULL")
    console.log('Column execution_mode added successfully')
    await sql.unsafe("ALTER TABLE users ADD COLUMN IF NOT EXISTS locale text DEFAULT 'he' NOT NULL")
    console.log('Column locale added successfully')
  } catch (e) {
    console.error('Error:', e.message)
    process.exit(1)
  }
  process.exit(0)
}

main()
