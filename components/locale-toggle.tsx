'use client'

import { Languages } from 'lucide-react'
import { useLocale } from '@/components/providers/locale-provider'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

export function LocaleToggle() {
  const { locale, setLocale } = useLocale()

  return (
    <DropdownMenuItem onClick={() => setLocale(locale === 'he' ? 'en' : 'he')} className="cursor-pointer">
      <Languages className="h-4 w-4 me-2" />
      {locale === 'he' ? 'English' : 'עברית'}
    </DropdownMenuItem>
  )
}
