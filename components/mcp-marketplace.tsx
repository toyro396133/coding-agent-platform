'use client'

import { Check, ExternalLink, Loader2, Plus, Search, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  getEntriesByCategory,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_ENTRIES,
  searchMarketplace,
} from '@/lib/mcp/marketplace'
import type { McpMarketplaceEntry } from '@/lib/mcp/types'

interface McpMarketplaceProps {
  /** Existing connector names (to show "Installed" badge) */
  installedConnectorNames: string[]
  /** Called after a server is installed successfully */
  onInstalled?: () => void
  /** Optional className override */
  className?: string
}

export function McpMarketplace({ installedConnectorNames, onInstalled, className }: McpMarketplaceProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [installingId, setInstallingId] = useState<string | null>(null)

  // Derive displayed entries
  const displayedEntries = searchQuery.trim()
    ? searchMarketplace(searchQuery)
    : activeCategory
      ? getEntriesByCategory(activeCategory)
      : MARKETPLACE_ENTRIES

  // Reset category when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      setActiveCategory(null)
    }
  }, [searchQuery])

  const isInstalled = useCallback(
    (entry: McpMarketplaceEntry) => {
      const lowerName = entry.name.toLowerCase()
      return installedConnectorNames.some((n) => n.toLowerCase() === lowerName)
    },
    [installedConnectorNames],
  )

  const handleInstall = async (entry: McpMarketplaceEntry) => {
    if (installingId) return
    setInstallingId(entry.id)

    try {
      const response = await fetch('/api/mcp-marketplace/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaceId: entry.id }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        if (data.needsOAuth) {
          toast.success(`"${entry.name}" added`, {
            description: data.installHint || 'Configure OAuth in Settings to activate.',
            duration: 6000,
          })
        } else if (data.needsEnv) {
          toast.success(`"${entry.name}" added`, {
            description: 'Configure environment variables in Settings.',
            duration: 5000,
          })
        } else {
          toast.success(`"${entry.name}" installed successfully`)
        }
        onInstalled?.()
      } else {
        const message = data.message || data.error || `Failed to install ${entry.name}`
        toast.error(message)
      }
    } catch (_error) {
      toast.error(`Failed to install ${entry.name}: Network error`)
    } finally {
      setInstallingId(null)
    }
  }

  return (
    <div className={`space-y-4 ${className || ''}`}>
      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search MCP servers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="ps-9 h-9"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setActiveCategory(null)
            setSearchQuery('')
          }}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            !activeCategory && !searchQuery.trim()
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
        >
          All
        </button>
        {MARKETPLACE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors inline-flex items-center gap-1 ${
              activeCategory === cat.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            <span className="text-sm leading-none">{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Results grid */}
      <div className="overflow-y-auto max-h-[40vh] -mx-1 px-1 space-y-2">
        {displayedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground">
            <Search className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No MCP servers found</p>
            <p className="text-xs">Try a different search term or category</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {displayedEntries.map((entry) => {
              const installed = isInstalled(entry)
              const installing = installingId === entry.id

              return (
                <Card
                  key={entry.id}
                  className={`p-3 transition-all duration-150 ${
                    installed
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'hover:border-muted-foreground/20 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <span className="text-2xl leading-none mt-0.5" aria-hidden>
                      {entry.icon}
                    </span>

                    <div className="flex-1 min-w-0">
                      {/* Name + badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold truncate">{entry.name}</span>
                        {installed && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4 px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          >
                            <Check className="h-2.5 w-2.5 me-0.5" />
                            Installed
                          </Badge>
                        )}
                        {entry.requiresOAuth && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
                            OAuth
                          </Badge>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                        {entry.description}
                      </p>

                      {/* Env keys hint */}
                      {entry.envKeys && entry.envKeys.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {entry.envKeys.map((env) => (
                            <Badge
                              key={env.key}
                              variant="outline"
                              className="text-[10px] h-4 px-1 font-mono text-muted-foreground"
                            >
                              {env.key}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      {installed ? (
                        <Badge
                          variant="secondary"
                          className="h-7 px-2 text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        >
                          <Check className="h-3 w-3 me-1" />
                          Added
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="h-7 px-2.5 text-xs"
                          onClick={() => handleInstall(entry)}
                          disabled={installing}
                        >
                          {installing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3 me-1" />
                          )}
                          {installing ? 'Adding…' : 'Add'}
                        </Button>
                      )}

                      {entry.docsUrl && (
                        <a
                          href={entry.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors"
                        >
                          Docs
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <span>
          {displayedEntries.length} server{displayedEntries.length !== 1 ? 's' : ''}
        </span>
        {!searchQuery.trim() && (
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            One-click install
          </span>
        )}
      </div>
    </div>
  )
}
