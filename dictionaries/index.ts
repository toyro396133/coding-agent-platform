import type { Dictionary } from './en'
import { en } from './en'
import { he } from './he'

export type { Dictionary } from './en'
export { en } from './en'
export { he } from './he'

export type Locale = 'en' | 'he'

export const getDictionary = (locale: Locale): Dictionary => {
  return locale === 'he' ? he : en
}
