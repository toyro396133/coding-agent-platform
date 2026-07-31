'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useLocale } from '@/components/providers/locale-provider'
import { Input } from '@/components/ui/input'
import { CAPABILITY_CATEGORIES, CAPABILITY_STATS } from '@/lib/capabilities-data'

type CategoryText = { title: string; desc: string; features: Record<string, string> }

function getCategoryText(t: ReturnType<typeof useLocale>['t'], id: string): CategoryText {
  return (t.capabilities.categories as unknown as Record<string, CategoryText>)[id]
}

export function CapabilitiesPage() {
  const { t } = useLocale()
  const [query, setQuery] = useState('')

  const categories = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CAPABILITY_CATEGORIES

    return CAPABILITY_CATEGORIES.map((category) => {
      const catText = getCategoryText(t, category.id)
      // Match against the category title/desc as well as each feature description
      const categoryMatches = `${catText.title} ${catText.desc}`.toLowerCase().includes(q)
      const filtered = categoryMatches
        ? category.features
        : category.features.filter((feature) => {
            return catText.features[feature.id].toLowerCase().includes(q)
          })
      return { ...category, features: filtered }
    }).filter((category) => category.features.length > 0)
  }, [query, t])

  const shownCategories = categories.length
  const shownFeatures = categories.reduce((acc, c) => acc + c.features.length, 0)

  return (
    <div className="flex-1 bg-background flex flex-col">
      {/* Header */}
      <header className="p-3 md:p-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t.capabilities.backToHome}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="px-4 md:px-8 pb-6">
        <div className="mx-auto max-w-4xl text-center space-y-4">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
            style={{ animation: 'fadeIn 0.5s ease-out forwards' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {t.capabilities.metaTitle}
          </div>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{t.capabilities.heroTitle}</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">{t.capabilities.heroSubtitle}</p>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 max-w-3xl mx-auto">
            {CAPABILITY_STATS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border bg-card p-3 md:p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-sm"
              >
                <div className="text-2xl md:text-3xl font-bold">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{t.capabilities[stat.label]}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative max-w-md mx-auto pt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.capabilities.searchPlaceholder}
              className="pl-9 pr-9 h-10"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t.capabilities.clearSearch}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Capability categories */}
      <main className="flex-1 px-4 md:px-8 pb-12">
        <div className="mx-auto max-w-5xl space-y-10">
          {categories.length === 0 ? (
            <div className="text-center py-16">
              <Search className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">{t.capabilities.noResults}</p>
            </div>
          ) : (
            categories.map((category) => {
              const catText = getCategoryText(t, category.id)
              return (
                <section key={category.id} id={`capability-${category.id}`} className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <category.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">{catText.title}</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">{catText.desc}</p>
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {category.features.length}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {category.features.map((feature) => {
                      const featText = catText.features[feature.id]
                      return (
                        <div
                          key={feature.id}
                          className={cn(
                            'group rounded-xl border bg-card p-4 transition-all duration-200',
                            'hover:border-primary/40 hover:shadow-sm hover:-translate-y-0.5',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 h-8 w-8 rounded-md bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary flex items-center justify-center transition-colors">
                              <feature.icon className="h-4 w-4" />
                            </div>
                            <p className="text-sm leading-relaxed">{featText}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })
          )}{' '}
          <p className="text-center text-xs text-muted-foreground pt-4">
            {t.capabilities.footerSummary
              .replace('{total}', String(shownFeatures))
              .replace('{categories}', String(shownCategories))}
          </p>
        </div>
      </main>
    </div>
  )
}
