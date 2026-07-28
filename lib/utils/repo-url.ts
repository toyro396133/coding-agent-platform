/**
 * Parses a GitHub URL and extracts owner/repo if it's a valid github.com URL.
 * Supports both HTTPS (https://github.com/owner/repo) and SSH (git@github.com:owner/repo) formats.
 * Returns null if the URL is not a valid github.com URL.
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  if (!url) return null

  // Handle SSH format: git@github.com:owner/repo(.git)?
  const sshMatch = url.match(/^git@github\.com:([\w.-]+)\/([\w.-]+?)(\.git)?$/)
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] }
  }

  // Handle HTTPS format: validate the URL properly
  try {
    const urlObj = new URL(url)
    // Check that the hostname is exactly github.com (or www.github.com)
    if (urlObj.hostname !== 'github.com' && urlObj.hostname !== 'www.github.com') {
      return null
    }
    // Parse the pathname: /owner/repo(.git)?
    const pathMatch = urlObj.pathname.match(/^\/([\w.-]+)\/([\w.-]+?)(\.git)?$/)
    if (pathMatch) {
      return { owner: pathMatch[1], repo: pathMatch[2] }
    }
  } catch {
    // Not a valid URL, fall through
  }

  return null
}

export function repoUrlToId(url: string | null | undefined): string {
  if (!url) return ''
  const parsed = parseGitHubUrl(url)
  if (parsed) {
    return `${parsed.owner}/${parsed.repo}`
  }
  return url
}

export function normalizeRepoUrl(url: string | null | undefined): string {
  if (!url) return ''
  const parsed = parseGitHubUrl(url)
  if (parsed) {
    return `https://github.com/${parsed.owner}/${parsed.repo}`
  }
  return url
}
