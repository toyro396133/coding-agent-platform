import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface SkeletonCardListProps {
  count?: number
  className?: string
  /** Render a circular avatar placeholder on each card (repo lists style). */
  showAvatar?: boolean
  /** Container layout classes. Defaults to a vertical `space-y-3` list; pass a grid (e.g. `grid grid-cols-2 md:grid-cols-4 gap-3`) for dashboard tiles. */
  containerClassName?: string
  /** Number of skeleton text lines inside each card (1–3). */
  lines?: number
  /**
   * Announce loading via role="status" (screen reader). Set to false when
   * several skeleton blocks render together to avoid duplicate announcements.
   */
  announce?: boolean
}

/**
 * Shared skeleton list — consistent loading state for fetch-driven lists
 * (commits, issues, PRs, queue, dashboards, …) instead of a lone centered spinner.
 */ export function SkeletonCardList({
  count = 4,
  className,
  showAvatar = false,
  containerClassName,
  lines = 3,
  announce = true,
}: SkeletonCardListProps) {
  return (
    <div
      className={cn(containerClassName ?? 'space-y-3', className)}
      role={announce ? 'status' : undefined}
      aria-label={announce ? 'Loading' : undefined}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-start gap-3">
            {showAvatar && <div className="h-10 w-10 rounded-full bg-muted animate-pulse flex-shrink-0" />}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-3.5 w-3/4 rounded bg-muted animate-pulse" />
              {lines > 1 && <div className="h-3 w-1/2 rounded bg-muted/70 animate-pulse" />}
              {lines > 2 && <div className="h-3 w-2/3 rounded bg-muted/50 animate-pulse" />}
            </div>
          </div>
        </Card>
      ))}
      {announce && <span className="sr-only">Loading…</span>}
    </div>
  )
}
