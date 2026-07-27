'use client'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useLocale } from '@/components/providers/locale-provider'
import { Languages } from 'lucide-react'

export function LocaleToggle() {
  const { locale, setLocale } = useLocale()

  return (
    <DropdownMenuItem onClick={() => setLocale(locale === 'he' ? 'en' : 'he')} className="cursor-pointer">
      <Languages className="h-4 w-4 me-2" />
      {locale === 'he' ? 'English' : 'עברית'}
    </DropdownMenuItem>
  )
}
