import 'server-only'

const VERCEL_API_BASE = 'https://api.vercel.com'

export type VercelProject = {
  id: string
  name: string
  framework?: string | null
  link?: {
    type?: string
    org?: string
    repo?: string
    repoId?: number
  } | null
  createdAt?: number
  updatedAt?: number
}

export type VercelDeployment = {
  id: string
  url: string
  name: string
  state: 'BUILDING' | 'ERROR' | 'READY' | 'CANCELED' | 'QUEUED'
  created: number
  projectId: string
  creator?: { username?: string }
}

export type VercelUser = {
  id: string
  username: string
  email?: string
}

function getToken(): string | undefined {
  return process.env.VERCEL_TOKEN
}

async function fetchVercel<T>(path: string, options?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = getToken()
  if (!token) {
    return { ok: false, error: 'VERCEL_TOKEN is not configured' }
  }

  const url = `${VERCEL_API_BASE}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error')
    return { ok: false, error: `Vercel API error (${response.status}): ${text}` }
  }

  const data = (await response.json()) as T
  return { ok: true, data }
}

export async function getCurrentUser() {
  return fetchVercel<VercelUser>('/v2/user')
}

export async function listProjects(limit = 20) {
  return fetchVercel<{ projects: VercelProject[] }>(`/v9/projects?limit=${limit}`)
}

export async function listDeployments(projectId: string, limit = 20) {
  return fetchVercel<{ deployments: VercelDeployment[] }>(`/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=${limit}`)
}

export async function createDeployment(projectId: string, target = 'production') {
  // Creating a deployment from scratch requires more fields; this is a placeholder
  // for a minimal integration. In practice the caller would provide files or a git source.
  return fetchVercel<VercelDeployment>(`/v13/deployments`, {
    method: 'POST',
    body: JSON.stringify({
      target,
      projectId,
      // A real deployment needs source files or a git commit ref.
    }),
  })
}
