import { and, eq } from 'drizzle-orm'
import { MODEL_TIERS } from '@/lib/ai/model-registry'
import { generateId } from '@/lib/utils/id'
import { db } from '../db/client'
import { settings } from '../db/schema'

export { MODEL_TIERS }

export type TaskCategory =
  | 'web_search'
  | 'documentation'
  | 'simple_code'
  | 'complex_code'
  | 'refactor'
  | 'debug'
  | 'code_review'
  | 'planning'
  | 'research'

export type TechStack = 'react' | 'nextjs' | 'node' | 'python' | 'typescript' | 'unknown'

export interface RoutingResult {
  category: TaskCategory
  model: string
  systemPrompt: string
  complexity: number // 1-10
  techStack: TechStack[]
}

// Per-category system prompts that guide the agent's behavior
const SYSTEM_PROMPTS: Record<TaskCategory, string> = {
  web_search: `You are a web research agent. Your task is to search the web for information.
Focus on finding accurate, up-to-date information from authoritative sources.
When you find relevant information, summarize it clearly and provide sources.
Use the websearch and webfetch tools to gather information.`,

  documentation: `You are a documentation specialist. Your task is to write clear, comprehensive documentation.
Focus on explaining concepts, providing examples, and documenting APIs.
Write in a clear, accessible style that's appropriate for the target audience.
Use markdown formatting for all documentation output.`,

  simple_code: `You are a coding assistant for simple, well-defined tasks.
Focus on making minimal, targeted changes to existing code.
Keep your changes focused and avoid unnecessary refactoring.
Always verify your changes work correctly before finishing.`,

  complex_code: `You are a senior full-stack developer. Your task involves complex, multi-file changes.
Before writing code, analyze the codebase structure and existing patterns.
Plan your implementation before executing - use the plan tools.
Consider edge cases, error handling, and testing.
Write clean, maintainable code that follows project conventions.
After implementation, verify with type checking and tests.`,

  refactor: `You are a code refactoring specialist. Your focus is on improving code quality.
Analyze the existing code structure first - understand what it does before changing it.
Make one refactoring change at a time, verifying each step.
Preserve existing behavior while improving code structure.
Consider performance implications of your changes.
Run tests after refactoring to ensure nothing broke.`,

  debug: `You are a debugging specialist. Your systematic approach to bugs:
1. Reproduce the issue first
2. Isolate the root cause
3. Understand the expected vs actual behavior
4. Implement the fix
5. Verify the fix works
6. Check for related issues

Look for common patterns: null references, type mismatches, race conditions, off-by-one errors, incorrect state management.`,

  code_review: `You are a code reviewer. Your task is to review code changes thoroughly.
Focus on: correctness, security, performance, maintainability, and style.
Look for: logic errors, security vulnerabilities, performance issues, edge cases, and adherence to project conventions.
Provide constructive, actionable feedback.`,

  planning: `You are an architectural planner. Your task is to create detailed plans.
Before planning, understand the full requirements and constraints.
Break down the work into clear, sequential steps.
Consider: architecture, components, data flow, API design, testing strategy.
Identify potential risks and mitigation strategies.
Create a plan that another developer could follow precisely.`,

  research: `You are a technical researcher. Your task is to investigate and analyze.
Dig deep into the topic - don't settle for surface-level answers.
Compare different approaches and technologies.
Consider pros and cons of each approach.
Provide evidence-backed recommendations.
Document your findings clearly with sources.`,
}

/**
 * Detects the technology stack mentioned in a prompt.
 */
function detectTechStack(prompt: string): TechStack[] {
  const lower = prompt.toLowerCase()
  const stacks: TechStack[] = []

  if (lower.includes('next.js') || lower.includes('nextjs') || lower.includes('next ')) stacks.push('nextjs')
  if (lower.includes('react') || lower.includes('jsx') || lower.includes('tsx') || lower.includes('component'))
    stacks.push('react')
  if (lower.includes('node') || lower.includes('express') || lower.includes('npm') || lower.includes('package.json'))
    stacks.push('node')
  if (lower.includes('python') || lower.includes('django') || lower.includes('flask') || lower.includes('pip'))
    stacks.push('python')
  if (lower.includes('typescript') || lower.includes('tsconfig') || lower.includes('.ts') || lower.includes('.tsx'))
    stacks.push('typescript')

  return stacks.length > 0 ? stacks : ['unknown']
}

/**
 * Calculates a comprehensive complexity score (1-10) based on multiple factors.
 */
function calculateComplexity(prompt: string): number {
  const lower = prompt.toLowerCase()
  let score = 1

  // Length-based complexity
  const wordCount = prompt.split(/\s+/).length
  if (wordCount > 100) score += 2
  else if (wordCount > 50) score += 1

  // Multi-file indicators
  const multiFileIndicators = [
    'component',
    'page',
    'route',
    'api',
    'endpoint',
    'create',
    'implement',
    'build',
    'new feature',
    'full stack',
    'frontend',
    'backend',
    'database',
  ]
  for (const indicator of multiFileIndicators) {
    if (lower.includes(indicator)) {
      score += 1
      break
    }
  }

  // Complexity keywords
  const complexityKeywords = [
    'auth',
    'authentication',
    'authorization',
    'oauth',
    'database',
    'migration',
    'schema',
    'orm',
    'websocket',
    'realtime',
    'streaming',
    'deploy',
    'ci/cd',
    'pipeline',
    'docker',
    'state management',
    'redux',
    'context',
    'middleware',
    'interceptor',
    'guard',
    'testing',
    'unit test',
    'integration test',
    'e2e',
    'performance',
    'optimization',
    'caching',
    'security',
    'encryption',
    'xss',
    'csrf',
    'architecture',
    'design pattern',
    'refactor',
    'i18n',
    'localization',
    'accessibility',
    'a11y',
    'responsive',
    'mobile',
    'cross-platform',
  ]
  for (const keyword of complexityKeywords) {
    if (lower.includes(keyword)) {
      score += 1
    }
  }

  // Architectural changes
  if (lower.includes('architect') || lower.includes('restructure') || lower.includes('redesign')) {
    score += 3
  }

  // Testing requirements
  if (lower.includes('test') || lower.includes('coverage') || lower.includes('assert')) {
    score += 1
  }

  return Math.min(score, 10)
}

/**
 * Enhanced task categorization with keyword scoring.
 */
function categorizeTask(prompt: string): TaskCategory {
  const lower = prompt.toLowerCase()

  const scores: Record<TaskCategory, number> = {
    web_search: 0,
    documentation: 0,
    simple_code: 0,
    complex_code: 0,
    refactor: 0,
    debug: 0,
    code_review: 0,
    planning: 0,
    research: 0,
  }

  const categoryPatterns: Record<TaskCategory, { primary: string[]; secondary: string[] }> = {
    debug: {
      primary: ['bug', 'debug', 'fix bug', 'error handling', 'crash', 'broken', 'failing'],
      secondary: ['fix', 'error', 'crash', 'issue', 'broken', 'failing', 'exception', 'unexpected', 'wrong'],
    },
    web_search: {
      primary: ['web search', 'search for', 'look up', 'find online', 'google', 'browse the web'],
      secondary: ['search', 'find', 'look up', 'google', 'browse', 'research topic'],
    },
    documentation: {
      primary: ['write docs', 'documentation', 'readme', 'explain code', 'write api docs'],
      secondary: ['explain', 'document', 'doc', 'comment', 'tutorial', 'guide', 'how-to', 'wiki'],
    },
    refactor: {
      primary: ['refactor', 'restructure', 'extract method', 'rename class', 'improve code quality', 'clean up'],
      secondary: ['rename', 'extract', 'restructure', 'simplify', 'clean up', 'reorganize', 'modernize'],
    },
    planning: {
      primary: ['architecture design', 'system design', 'technical plan', 'design document'],
      secondary: ['plan', 'design', 'architecture', 'proposal', 'roadmap', 'strategy', 'blueprint'],
    },
    code_review: {
      primary: ['code review', 'review pr', 'audit code', 'review pull request'],
      secondary: ['review', 'audit', 'inspect', 'quality check', 'check code'],
    },
    research: {
      primary: ['research topic', 'investigate issue', 'deep dive', 'compare technologies'],
      secondary: ['research', 'investigate', 'analyze', 'study', 'explore', 'benchmark'],
    },
    complex_code: {
      primary: ['implement feature', 'build api', 'full stack', 'create application', 'implement system'],
      secondary: [
        'implement',
        'build',
        'develop',
        'create',
        'add',
        'function',
        'class',
        'component',
        'api',
        'route',
        'endpoint',
        'database',
        'schema',
        'integration',
        'service',
        'controller',
        'model',
      ],
    },
    simple_code: {
      primary: [],
      secondary: ['add', 'create', 'write', 'fix', 'update', 'change', 'modify'],
    },
  }

  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    const cat = category as TaskCategory
    for (const keyword of patterns.primary) {
      if (lower.includes(keyword)) {
        scores[cat] += 3
      }
    }
    for (const keyword of patterns.secondary) {
      if (lower.includes(keyword)) {
        scores[cat] += 1
      }
    }
  }

  // Complexity boost for complex_code
  const complexity = calculateComplexity(lower)
  if (complexity >= 6) {
    scores.complex_code += Math.floor(complexity / 3)
  }

  let bestCategory: TaskCategory = 'planning'
  let bestScore = 0

  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score
      bestCategory = category as TaskCategory
    }
  }

  // Prefer complex_code over simple_code when technical depth is detected
  if (bestCategory === 'simple_code' && scores.complex_code > 0) {
    const technicalDepth = (
      lower.match(/\b(api|database|schema|auth|middleware|deploy|config|test|service|component)\b/g) || []
    ).length
    if (technicalDepth >= 2) {
      bestCategory = 'complex_code'
    }
  }

  if (bestScore === 0) {
    return 'planning'
  }

  return bestCategory
}

/**
 * Selects the optimal model based on category and complexity.
 */
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

/**
 * Routes a prompt to the optimal model, providing category, model, and system prompt.
 */
export function routePrompt(prompt: string): RoutingResult {
  const category = categorizeTask(prompt)
  const model = modelForCategory(category)
  const systemPrompt = SYSTEM_PROMPTS[category]
  const complexity = calculateComplexity(prompt)
  const techStack = detectTechStack(prompt)

  // Enhance system prompt with tech stack context
  let enhancedPrompt = systemPrompt
  if (techStack.length > 0 && !techStack.includes('unknown')) {
    enhancedPrompt += `\n\nThe detected tech stack includes: ${techStack.join(', ')}.`
    enhancedPrompt += `\nFollow the conventions and best practices of these technologies.`
  }

  // Add complexity guidance
  if (complexity >= 7) {
    enhancedPrompt += `\n\nThis is a high-complexity task (${complexity}/10). Take extra care with planning and verification. Use the plan tools before implementing. Verify with type checking and tests afterward.`
  } else if (complexity <= 3) {
    enhancedPrompt += `\n\nThis is a simple task (${complexity}/10). Keep changes minimal and focused.`
  }

  // Add autonomous mode guidance for full-stack tasks
  if (category === 'complex_code' && complexity >= 5) {
    enhancedPrompt += `\n\n=== AUTONOMOUS MODE ===
For full-stack tasks, follow this autonomous workflow:
1. **Analyze**: Explore the codebase structure and understand existing patterns
2. **Plan**: Create a step-by-step implementation plan
3. **Implement**: Write code file by file, using efficient patch operations
4. **Verify**: Run type checking and tests after each significant change
5. **Fix**: Address any issues found during verification
6. **Complete**: Ensure everything works end-to-end

You have full autonomy to explore, plan, implement, and verify. Don't ask for permission for each step - use your judgment and proceed efficiently.`
  }

  return {
    category,
    model,
    systemPrompt: enhancedPrompt,
    complexity,
    techStack,
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
  } catch (_error) {
    console.error('Failed to save sub-agent routing to database')
  }

  return fallbackModel
}

export function suggestModelForPrompt(prompt: string): string {
  const { model } = routePrompt(prompt)
  return model
}

export function getTieredModels(tier: keyof typeof MODEL_TIERS): string[] {
  return [...MODEL_TIERS[tier]]
}
