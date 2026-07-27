import { db } from '../db/client'
import { settings } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'

const MODEL_TIERS = {
  fast: ['gpt-4o-mini', 'gemini-2.5-flash', 'claude-haiku-4-5', 'gpt-5-nano'],
  balanced: ['gpt-4o', 'gemini-2.5-pro', 'claude-sonnet-4-5', 'gpt-5-mini'],
  powerful: ['gpt-5', 'claude-opus-4-5', 'gemini-3-pro-preview', 'gpt-5-codex'],
}

type TaskCategory =
  | 'web_search'
  | 'documentation'
  | 'simple_code'
  | 'complex_code'
  | 'refactor'
  | 'debug'
  | 'code_review'
  | 'planning'
  | 'research'

function categorizeTask(prompt: string): TaskCategory {
  const lower = prompt.toLowerCase()
  if (lower.includes('bug') || lower.includes('fix') || lower.includes('error') || lower.includes('crash') || lower.includes('issue')) return 'debug'
  if (lower.includes('search') || lower.includes('find') || lower.includes('look up')) return 'web_search'
  if (lower.includes('explain') || lower.includes('document') || lower.includes('readme') || lower.includes('doc')) return 'documentation'
  if (lower.includes('refactor') || lower.includes('rename') || lower.includes('extract') || lower.includes('restructure')) return 'refactor'
  if (lower.includes('plan') || lower.includes('design') || lower.includes('architecture')) return 'planning'
  if (lower.includes('review') || lower.includes('audit')) return 'code_review'
  if (lower.includes('research') || lower.includes('investigate') || lower.includes('analyze')) return 'research'
  const codeKeywords = ['implement', 'add', 'create', 'write', 'build', 'develop', 'function', 'class', 'component', 'api', 'route', 'endpoint']
  const matchCount = codeKeywords.filter((k) => lower.includes(k)).length
  if (matchCount >= 3) return 'complex_code'
  if (matchCount >= 1) return 'simple_code'
  return 'planning'
}

function modelForCategory(category: TaskCategory): string {
  switch (category) {
    case 'web_search':
    case 'documentation':
      return 'gemini-2.5-flash'
    case 'simple_code':
      return 'claude-sonnet-4-5'
    case 'complex_code':
    case 'refactor':
      return 'claude-opus-4-5'
    case 'debug':
      return 'gpt-5'
    case 'code_review':
      return 'gpt-5-codex'
    case 'planning':
      return 'gpt-5'
    case 'research':
      return 'gemini-3-pro-preview'
  }
}

export async function getSubAgentModel(subTaskType: string, userId: string): Promise<string> {
  const keyName = `routing:dynamic_${subTaskType}`

  const userSetting = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, keyName)))
    .limit(1)

  if (userSetting.length > 0) {
    return userSetting[0].value
  }

  const typeLower = subTaskType.toLowerCase()
  const category = categorizeTask(typeLower)
  const fallbackModel = modelForCategory(category)

  try {
    await db
      .insert(settings)
      .values({
        id: generateId(),
        userId,
        key: keyName,
        value: fallbackModel,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: [settings.userId, settings.key] })
  } catch (error) {
    console.error('Failed to save dynamic sub-agent routing to DB:', error)
  }

  return fallbackModel
}

export function suggestModelForPrompt(prompt: string): string {
  const category = categorizeTask(prompt)
  return modelForCategory(category)
}

export function getTieredModels(tier: keyof typeof MODEL_TIERS): string[] {
  return MODEL_TIERS[tier]
}
