'use client'

import {
  ArrowRight,
  Box,
  ChevronLeft,
  Eye,
  GitBranch,
  Home,
  Route,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Claude, Codex, Copilot, Cursor, Gemini, OpenCode } from '@/components/logos'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ─── Agent definitions for the grid ─── */

const AGENTS = [
  { name: 'Claude', Logo: Claude, model: 'Sonnet 4.5', color: 'from-amber-500/20 to-amber-600/10' },
  { name: 'Codex', Logo: Codex, model: 'GPT-5', color: 'from-emerald-500/20 to-emerald-600/10' },
  { name: 'Cursor', Logo: Cursor, model: 'Claude 4.5', color: 'from-violet-500/20 to-violet-600/10' },
  { name: 'Copilot', Logo: Copilot, model: 'Claude 4.5', color: 'from-sky-500/20 to-sky-600/10' },
  { name: 'Gemini', Logo: Gemini, model: '2.5 Pro', color: 'from-blue-500/20 to-blue-600/10' },
  { name: 'OpenCode', Logo: OpenCode, model: 'Claude 4.5', color: 'from-rose-500/20 to-rose-600/10' },
] as const

const DEMO_PROMPTS = [
  'בנה API לרשימת משימות עם Express ו-TypeScript',
  'צור דף נחיתה רספונסיבי עם Tailwind CSS',
  'הוסף מערכת אימות עם NextAuth ו-Postgres',
]

/* ─── Animated typing hook ─── */

function useTypingAnimation(text: string, speed: number = 40) {
  const [displayed, setDisplayed] = useState('')
  const [cursor, setCursor] = useState(true)
  const indexRef = useRef(0)
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    indexRef.current = 0

    const tick = () => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1))
        indexRef.current++
        rafRef.current = setTimeout(tick, speed + Math.random() * 30)
      }
    }
    // Reset the displayed text asynchronously, then start typing, so no state
    // is set synchronously within the effect body.
    rafRef.current = setTimeout(() => {
      setDisplayed('')
      tick()
    }, 300)
    return () => {
      if (rafRef.current) clearTimeout(rafRef.current)
    }
  }, [text, speed])

  /* Blinking cursor */
  useEffect(() => {
    const interval = setInterval(() => setCursor((c) => !c), 530)
    return () => clearInterval(interval)
  }, [])

  return { displayed, cursor }
}

/* ─── Agent Card ─── */

function AgentCard({ agent, index, isVisible }: { agent: (typeof AGENTS)[number]; index: number; isVisible: boolean }) {
  return (
    <div
      className={cn(
        'group relative rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-4 md:p-5 transition-all duration-500',
        'hover:border-amber-500/30 hover:bg-amber-500/[0.04]',
        'opacity-0 translate-y-6',
        isVisible && 'opacity-100 translate-y-0',
      )}
      style={{
        transitionDelay: `${200 + index * 120}ms`,
        transitionProperty: 'opacity, transform, border-color, background-color',
      }}
    >
      {/* Pipeline glow on hover — subtle amber edge */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          boxShadow: '0 0 0 1px oklch(0.62 0.185 65 / 0.4), 0 0 24px -8px oklch(0.62 0.185 65 / 0.15)',
        }}
      />
      <div className="relative z-10 flex items-center gap-3">
        <div
          className={cn(
            'h-10 w-10 md:h-12 md:w-12 rounded-lg bg-gradient-to-br flex items-center justify-center',
            agent.color,
          )}
        >
          <agent.Logo className="w-5 h-5 md:w-6 md:h-6" />
        </div>
        <div className="min-w-0">
          <p className="text-sm md:text-base font-semibold text-white/90">{agent.name}</p>
          <p className="text-xs text-white/40 font-mono">{agent.model}</p>
        </div>
        <div className="ms-auto">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_oklch(0.6_0.18_160_/_0.6)]" />
        </div>
      </div>
    </div>
  )
}

/* ─── Main Landing Page ─── */

export function LandingPage() {
  const [promptIndex, setPromptIndex] = useState(0)
  const [agentsVisible, setAgentsVisible] = useState(false)
  const [featuresVisible, setFeaturesVisible] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)
  const featuresRef = useRef<HTMLDivElement>(null)

  const currentPrompt = DEMO_PROMPTS[promptIndex]
  const { displayed, cursor } = useTypingAnimation(currentPrompt, 50)

  /* Cycle through demo prompts */
  useEffect(() => {
    const timeout = setTimeout(() => {
      setPromptIndex((prev) => (prev + 1) % DEMO_PROMPTS.length)
    }, 5000)
    return () => clearTimeout(timeout)
  }, [])

  /* Trigger agent grid animation after mount */
  useEffect(() => {
    const timeout = setTimeout(() => setAgentsVisible(true), 600)
    return () => clearTimeout(timeout)
  }, [])

  /* Intersection observer for features */
  useEffect(() => {
    const node = featuresRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setFeaturesVisible(true)
      },
      { threshold: 0.15 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  /* Keyboard: Enter to navigate to home (sign-in flow) */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      window.location.href = '/'
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ═══════════ HERO — Full-Bleed Dark ═══════════ */}
      <div ref={heroRef} className="relative overflow-hidden" style={{ background: 'oklch(0.14 0.01 255)' }}>
        {/* Subtle radial gradient behind the grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 50% 70%, oklch(0.62 0.185 65 / 0.06), transparent)',
          }}
        />

        <div className="relative z-10 mx-auto max-w-5xl px-4 pt-16 pb-12 md:pt-28 md:pb-20">
          {/* Top nav */}
          <div
            className="mb-8 flex items-center justify-end gap-4 opacity-0"
            style={{ animation: 'fadeIn 0.5s ease-out forwards' }}
          >
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/80 transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              Home
            </Link>
            <Link
              href="/capabilities"
              className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-amber-400/80 transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Capabilities
            </Link>
          </div>

          {/* Eyebrow badge */}
          <div
            className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-4 py-1.5 opacity-0"
            style={{ animation: 'fadeIn 0.6s ease-out 0.1s forwards' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_oklch(0.62_0.185_65_/_0.5)]" />
            <span className="text-xs font-medium text-amber-300/80">Multi-Agent AI Platform</span>
          </div>

          {/* Headline */}
          <h1
            className="mx-auto max-w-3xl text-center text-4xl font-bold tracking-tight text-white/95 sm:text-5xl md:text-6xl lg:text-7xl opacity-0"
            style={{ animation: 'fadeIn 0.7s ease-out 0.25s forwards' }}
          >
            Six agents.
            <br />
            <span className="text-amber-400">One prompt.</span>
          </h1>

          <p
            className="mx-auto mt-5 max-w-xl text-center text-base md:text-lg text-white/50 text-balance opacity-0"
            style={{ animation: 'fadeIn 0.6s ease-out 0.4s forwards' }}
          >
            Every major CLI coding agent — Claude, Codex, Copilot, Cursor, Gemini, and OpenCode — running in parallel
            sandboxes. Compare results. Pick the best.
          </p>

          {/* Interactive prompt demo */}
          <div className="mx-auto mt-8 max-w-xl opacity-0" style={{ animation: 'fadeIn 0.6s ease-out 0.55s forwards' }}>
            <div
              className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm px-5 py-4 cursor-text transition-shadow duration-300 hover:border-amber-500/20"
              style={{
                boxShadow: '0 0 0 1px oklch(0.62 0.185 65 / 0.1), 0 0 32px -8px oklch(0.62 0.185 65 / 0.05)',
              }}
              onKeyDown={handleKeyDown}
              tabIndex={0}
              role="textbox"
              aria-label="Describe what you want the AI to build"
            >
              <Terminal className="h-5 w-5 shrink-0 text-white/25" />
              <span className="flex-1 text-base md:text-lg text-white/80 font-mono">
                {displayed}
                <span
                  className={cn(
                    'inline-block w-[2px] h-[1.1em] align-text-bottom ms-0.5',
                    cursor ? 'bg-amber-400' : 'bg-transparent',
                  )}
                />
              </span>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 transition-colors hover:bg-amber-500/30">
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </div>
            </div>
          </div>

          {/* 6-Agent Grid — the signature */}
          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
            {AGENTS.map((agent, i) => (
              <AgentCard key={agent.name} agent={agent} index={i} isVisible={agentsVisible} />
            ))}
          </div>

          {/* Stats row */}
          <div
            className="mx-auto mt-14 flex max-w-lg flex-wrap items-center justify-center gap-x-8 gap-y-3 text-center opacity-0"
            style={{ animation: 'fadeIn 0.6s ease-out 1.6s forwards' }}
          >
            {[
              { v: '6', l: 'Coding Agents' },
              { v: '45+', l: 'Models' },
              { v: '12', l: 'Capability Packs' },
            ].map((stat) => (
              <div key={stat.l}>
                <div className="text-2xl font-bold text-white/90 font-mono">{stat.v}</div>
                <div className="mt-0.5 text-xs text-white/40">{stat.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════ FEATURES — Light Background ═══════════ */}
      <div ref={featuresRef} className="mx-auto max-w-5xl px-4 py-20 md:py-28">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
            Everything you need
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            From prompt to PR — automatically
          </h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Route,
              title: 'Smart Router',
              desc: 'Two-phase routing picks the best model for every request. Automatic fallback when providers fail.',
            },
            {
              icon: Workflow,
              title: 'Orchestrator',
              desc: 'Autonomous Analyze → Plan → Execute → Verify loop with self-healing on type errors and test failures.',
            },
            {
              icon: Eye,
              title: 'Visual QA',
              desc: 'Playwright browser automation takes screenshots. Vision models critique and auto-fix UI issues.',
            },
            {
              icon: Box,
              title: 'Sandbox Pipeline',
              desc: 'Full lifecycle in Vercel Sandboxes: clone, install, build, typecheck, test, lint, preview.',
            },
            {
              icon: GitBranch,
              title: 'Git & PRs',
              desc: 'AI-generated branches and commits. Create, merge, and revert PRs — all from the UI.',
            },
            {
              icon: Zap,
              title: 'API & Streaming',
              desc: 'OpenAI-compatible endpoint with real-time SSE streaming. Idempotency keys and job cancellation.',
            },
          ].map((feature, i) => (
            <div
              key={feature.title}
              className={cn(
                'group rounded-xl border border-border bg-card p-6 transition-all duration-500',
                'hover:border-amber-500/20 hover:shadow-[0_0_0_1px_oklch(0.62_0.185_65_/_0.15),0_0_16px_-4px_oklch(0.62_0.185_65_/_0.06)]',
                'opacity-0 translate-y-4',
                featuresVisible && 'opacity-100 translate-y-0',
              )}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 text-base font-semibold text-foreground">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* ─── Capability link ─── */}
        <div className="mt-10 text-center">
          <Link
            href="/capabilities"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline"
          >
            <Sparkles className="h-4 w-4 rtl:scale-x-[-1]" />
            Explore all 60+ capabilities
            <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          </Link>
        </div>
      </div>

      {/* ═══════════ CTA — Bold Amber ═══════════ */}
      <div className="mx-auto max-w-3xl px-4 pb-20 md:pb-28">
        <div className="rounded-2xl overflow-hidden relative" style={{ background: 'oklch(0.14 0.01 255)' }}>
          <div className="relative z-10 px-6 py-12 md:px-12 md:py-16 text-center">
            <h2 className="text-2xl font-bold text-white/95 md:text-3xl">Start building — free</h2>
            <p className="mt-3 max-w-md mx-auto text-sm text-white/45 text-balance">
              No credit card. Connect your GitHub, pick a repo, and let six agents compete on your task.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 px-8 text-base bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Link href="/">
                  <Sparkles className="h-4 w-4 me-2 rtl:scale-x-[-1]" />
                  Get Started
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="h-12 px-8 text-base text-white/60 hover:text-white/90 hover:bg-white/[0.06]"
              >
                <Link href="/capabilities">
                  See capabilities
                  <ChevronLeft className="h-4 w-4 ms-1 rtl:rotate-180" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
