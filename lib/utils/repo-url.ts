export function repoUrlToId(url: string | null | undefined): string {
  if (!url) return ''
  // Match github.com/owner/repo or similar formats
  const match = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?$/)
  if (match) {
    return `${match[1]}/${match[2]}`
  }
  return url
}

export function normalizeRepoUrl(url: string | null | undefined): string {
  if (!url) return ''
  // Match github.com/owner/repo or similar formats
  const match = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?$/)
  if (match) {
    return `https://github.com/${match[1]}/${match[2]}`
  }
  return url
}
