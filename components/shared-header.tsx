'use client'

import { ChevronRight, Cpu, Home, Menu } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTasks } from '@/components/app-layout'
import { User } from '@/components/auth/user'
import { GitHubStarsButton } from '@/components/github-stars-button'
import { useLocale } from '@/components/providers/locale-provider'
import { Button } from '@/components/ui/button'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'

interface SharedHeaderProps {
  leftActions?: React.ReactNode
  extraActions?: React.ReactNode
  initialStars?: number
  hideStars?: boolean
  hideDeployButton?: boolean
}

export function SharedHeader({
  leftActions,
  extraActions,
  initialStars = 1200,
  hideStars = false,
  hideDeployButton = false,
}: SharedHeaderProps) {
  const { toggleSidebar } = useTasks()
  const { t } = useLocale()
  const pathname = usePathname()

  // Build breadcrumbs from pathname
  const breadcrumbs = buildBreadcrumbs(pathname, t)

  return (
    <div className="px-0 pt-0.5 md:pt-3 pb-1.5 md:pb-4 overflow-visible">
      <div className="flex items-center justify-between gap-2 h-8 min-w-0">
        {/* Left side - Menu Button, Breadcrumbs, and Left Actions */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
          <Button onClick={toggleSidebar} variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
            <Menu className="h-4 w-4" />
          </Button>

          {/* Breadcrumbs */}
          {breadcrumbs.length > 0 && (
            <nav className="hidden sm:flex items-center gap-1 text-sm min-w-0" aria-label="Breadcrumb">
              {breadcrumbs.map((crumb, i) => (
                <span key={crumb.href || crumb.label} className="flex items-center gap-1 min-w-0">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0 rtl:rotate-180" />}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="text-muted-foreground hover:text-foreground transition-colors truncate"
                    >
                      {crumb.icon}
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-foreground font-medium truncate">
                      {crumb.icon}
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          )}

          {leftActions}
        </div>

        {/* Actions - Right side */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Quick nav icons */}
          <Link href="/dashboard" className="hidden sm:block">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title={t.sidebar.dashboard}>
              <Home className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/agents">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title={t.sidebar.agents}>
              <Cpu className="h-4 w-4" />
            </Button>
          </Link>

          {!hideStars && <GitHubStarsButton initialStars={initialStars} />}

          {!hideDeployButton && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 sm:px-3 px-0 sm:w-auto w-8 bg-black text-white border-black hover:bg-black/90 dark:bg-white dark:text-black dark:border-white dark:hover:bg-white/90"
            >
              <a
                href={VERCEL_DEPLOY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5"
              >
                <svg viewBox="0 0 76 65" className="h-3 w-3" fill="currentColor">
                  <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                </svg>
                <span className="hidden sm:inline">{t.home.deployYourOwn}</span>
              </a>
            </Button>
          )}

          {extraActions}

          <User />
        </div>
      </div>
    </div>
  )
}

/** Build breadcrumbs from pathname */
function buildBreadcrumbs(pathname: string, t: any): { label: string; href?: string; icon?: React.ReactNode }[] {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return []

  const crumbs: { label: string; href?: string; icon?: React.ReactNode }[] = []

  // Home / Dashboard
  crumbs.push({ label: t.common.home, href: '/', icon: <Home className="h-3 w-3 inline me-1" /> })

  let currentPath = ''
  for (let i = 0; i < segments.length; i++) {
    currentPath += `/${segments[i]}`
    const isLast = i === segments.length - 1

    const label = getSegmentLabel(segments[i], segments, i, t)
    crumbs.push({
      label,
      href: isLast ? undefined : currentPath,
    })
  }

  return crumbs
}

function getSegmentLabel(segment: string, allSegments: string[], index: number, t: any): string {
  // Handle special pages
  switch (segment) {
    case 'dashboard':
      return t.sidebar?.dashboard || 'Dashboard'
    case 'tasks':
      return t.common.tasks
    case 'agents':
      return t.sidebar?.agents || 'Agents'
    case 'repos':
      if (allSegments.length >= 3 && index === 2) return allSegments[2]
      return t.common.repos
    case 'capabilities':
      return t.capabilities?.metaTitle || 'Capabilities'
    case 'metrics':
      return t.sidebar?.metrics || 'Metrics'
    case 'settings':
      return t.settings?.title || 'Settings'
    default:
      // Task IDs are typically long strings
      if (segment.length > 20) return `${t.common.tasks} #${segment.slice(0, 8)}`
      return segment.charAt(0).toUpperCase() + segment.slice(1)
  }
}
