# Task 3: User Database Functions

**Files:**
- Modify: lib/db/users.ts

**Interfaces:**
- Produces: getUserByUsername(username: string) => Promise<User | null>

## Steps

- **Step 1: Add getUserByUsername function**

Add this function to lib/db/users.ts:

`	ypescript
export async function getUserByUsername(username: string) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
  return result[0] || null
}
`

- **Step 2: Run format + type-check**
- **Step 3: Commit**
