export const CODING_AGENTS = [
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'copilot', label: 'Copilot' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'opencode', label: 'opencode' },
] as const

export type AgentId = (typeof CODING_AGENTS)[number]['value']

export const AGENT_MODELS: Record<AgentId, Array<{ value: string; label: string }>> = {
  claude: [
    { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
    { value: 'anthropic/claude-opus-4.6', label: 'Opus 4.6' },
    { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
    { value: 'anthropic/claude-opus-4.5', label: 'Opus 4.5' },
    { value: 'anthropic/claude-sonnet-4', label: 'Sonnet 4' },
    { value: 'anthropic/claude-3.5-sonnet', label: '3.5 Sonnet' },
  ],
  codex: [
    { value: 'openai/gpt-5.1', label: 'GPT-5.1' },
    { value: 'openai/gpt-5.1-codex', label: 'GPT-5.1-Codex' },
    { value: 'openai/gpt-5.1-codex-mini', label: 'GPT-5.1-Codex mini' },
    { value: 'openai/gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-codex', label: 'GPT-5-Codex' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 mini' },
    { value: 'openai/gpt-5-nano', label: 'GPT-5 nano' },
    { value: 'gpt-5-pro', label: 'GPT-5 pro' },
    { value: 'openai/gpt-4.1', label: 'GPT-4.1' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
    { value: 'openai/o3', label: 'o3' },
    { value: 'openai/o3-mini', label: 'o3-mini' },
    { value: 'openai/o4-mini', label: 'o4-mini' },
    { value: 'openai/gpt-4.5-preview', label: 'GPT-4.5 Preview' },
  ],
  copilot: [
    { value: 'claude-sonnet-4.5', label: 'Sonnet 4.5 (default)' },
    { value: 'claude-sonnet-4', label: 'Sonnet 4' },
    { value: 'claude-haiku-4.5', label: 'Haiku 4.5' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
  cursor: [
    { value: 'auto', label: 'Auto (default)' },
    { value: 'composer-1', label: 'Composer' },
    { value: 'sonnet-4.5', label: 'Sonnet 4.5' },
    { value: 'sonnet-4.5-thinking', label: 'Sonnet 4.5 Thinking' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-codex', label: 'GPT-5 Codex' },
    { value: 'opus-4.5', label: 'Opus 4.5' },
    { value: 'opus-4.1', label: 'Opus 4.1' },
    { value: 'grok', label: 'Grok' },
    { value: 'claude-3.5-sonnet', label: '3.5 Sonnet' },
  ],
  gemini: [
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-3-flash', label: 'Gemini 3 Flash' },
    { value: 'google-gla/gemini-2.5-flash', label: '2.5 Flash (Vertex)' },
  ],
  opencode: [
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 nano' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
    { value: 'claude-opus-4-5', label: 'Opus 4.5' },
    { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
    { value: 'claude-3-5-sonnet', label: '3.5 Sonnet' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'deepseek-chat', label: 'DeepSeek V4' },
    { value: 'deepseek-coder', label: 'DeepSeek Coder V3' },
    { value: 'qwen-3.5-235b-a3b', label: 'Qwen 3.5' },
    { value: 'mistral/mistral-large', label: 'Mistral Large' },
    { value: 'meta-llama-4', label: 'Llama 4' },
    { value: 'inclusionai/ling-3.0-flash-free', label: 'Ling 3.0 Flash (free)' },
  ],
}

export const DEFAULT_MODELS: Record<AgentId, string> = {
  claude: 'claude-sonnet-4-5',
  codex: 'openai/gpt-5.1',
  copilot: 'claude-sonnet-4.5',
  cursor: 'auto',
  gemini: 'gemini-3-pro-preview',
  opencode: 'gpt-5',
}

export function getModelName(modelId: string | null, agent: string | null): string {
  if (!modelId || !agent) return modelId || 'Unknown'
  const models = AGENT_MODELS[agent.toLowerCase() as AgentId]
  if (!models) return modelId
  const model = models.find((m: { value: string; label: string }) => m.value === modelId)
  return model?.label || modelId
}
