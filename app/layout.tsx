import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { cookies } from 'next/headers'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { AppLayoutWrapper } from '@/components/app-layout-wrapper'
import { SessionProvider } from '@/components/auth/session-provider'
import { LocaleProvider } from '@/components/providers/locale-provider'
import { JotaiProvider } from '@/components/providers/jotai-provider'
import { SESSION_COOKIE_NAME } from '@/lib/session/constants'
import { decryptJWE } from '@/lib/jwe/decrypt'
import type { Session } from '@/lib/session/types'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Coding Agent Template',
  description:
    'AI-powered coding agent template supporting Claude Code, OpenAI Codex CLI, Cursor CLI, and opencode with Vercel Sandbox',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
  let initialLocale: 'en' | 'he' | undefined
  if (sessionCookie) {
    const session = await decryptJWE<Session>(sessionCookie)
    if (session?.user?.locale) {
      initialLocale = session.user.locale
    }
  }

  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <JotaiProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <LocaleProvider initialLocale={initialLocale}>
              <SessionProvider />
              <AppLayoutWrapper>{children}</AppLayoutWrapper>
              <Toaster />
            </LocaleProvider>
          </ThemeProvider>
        </JotaiProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
