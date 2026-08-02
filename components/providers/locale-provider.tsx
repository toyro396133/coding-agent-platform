'use client'

import { useAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { getDictionary, type Locale } from '@/dictionaries'

export const localeAtom = atomWithStorage<Locale>('locale', 'he')

interface LocaleContextType {
  t: ReturnType<typeof getDictionary>
  locale: Locale
  setLocale: (locale: Locale) => Promise<void>
}

const LocaleContext = createContext<LocaleContextType | null>(null)

export function LocaleProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleAtom] = useAtom(localeAtom)
  const [initialized, setInitialized] = useState(false)

  if (!initialized && initialLocale) {
    setLocaleAtom(initialLocale)
    setInitialized(true)
  }

  const t = useMemo(() => getDictionary(locale), [locale])

  const setLocale = useCallback(
    async (newLocale: Locale) => {
      setLocaleAtom(newLocale)
      setInitialized(true)
      try {
        const response = await fetch('/api/user/locale', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: newLocale }),
        })
        if (!response.ok) {
          console.error('Failed to update locale on server')
        }
      } catch {
        console.error('Failed to update locale on server')
      }
    },
    [setLocaleAtom],
  )

  return <LocaleContext.Provider value={{ t, locale, setLocale }}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextType {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider')
  }
  return context
}
