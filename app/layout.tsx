import type { Metadata } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { cookies } from 'next/headers'
import { AppLayoutWrapper } from '@/components/app-layout-wrapper'
import { SessionProvider } from '@/components/auth/session-provider'
import { JotaiProvider } from '@/components/providers/jotai-provider'
import { LocaleProvider } from '@/components/providers/locale-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { decryptJWE } from '@/lib/jwe/decrypt'
import { SESSION_COOKIE_NAME } from '@/lib/session/constants'
import type { Session } from '@/lib/session/types'

const ibmPlexSans = IBM_Plex_Sans({
  variable: '--font-ibm-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
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
  let initialLocale: 'en' | 'he' = 'he'
  if (sessionCookie) {
    const session = await decryptJWE<Session>(sessionCookie)
    if (session?.user?.locale) {
      initialLocale = session.user.locale as 'en' | 'he'
    }
  }
  const isRtl = initialLocale === 'he'

  return (
    <html lang={initialLocale} dir={isRtl ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <body className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} antialiased`}>
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
