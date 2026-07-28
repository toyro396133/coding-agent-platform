export interface PluginManifest {
  name: string
  version: string
  description: string
  author?: string
  entry: string
  capabilities: string[]
  config?: Record<string, unknown>
}

export interface Plugin {
  manifest: PluginManifest
  enabled: boolean
  loaded: boolean
}

export interface PluginApi {
  name: string
  hooks: Record<string, (...args: unknown[]) => unknown>
}

export type PluginHookName =
  | 'onTaskStart'
  | 'onTaskComplete'
  | 'onMessage'
  | 'onFileChange'
  | 'onGitPush'
  | 'onCodeReview'
