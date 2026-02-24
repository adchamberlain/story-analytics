import { create } from 'zustand'

export interface LocaleState {
  /** BCP 47 locale tag (e.g. 'en-US', 'de-DE', 'ja-JP') */
  locale: string
  setLocale: (locale: string) => void
}

const LOCALE_KEY = 'saLocale'

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCALE_KEY) : null
const initialLocale = stored || 'en-US'

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: initialLocale,
  setLocale: (locale) => {
    localStorage.setItem(LOCALE_KEY, locale)
    set({ locale })
  },
}))

/** Supported locales with display labels */
export const SUPPORTED_LOCALES = [
  { code: 'en-US', label: 'English (US)', flag: 'US' },
  { code: 'en-GB', label: 'English (UK)', flag: 'GB' },
  { code: 'de-DE', label: 'Deutsch', flag: 'DE' },
  { code: 'fr-FR', label: 'Français', flag: 'FR' },
  { code: 'es-ES', label: 'Español', flag: 'ES' },
  { code: 'pt-BR', label: 'Português (BR)', flag: 'BR' },
  { code: 'ja-JP', label: '日本語', flag: 'JP' },
  { code: 'zh-CN', label: '中文 (简体)', flag: 'CN' },
  { code: 'ko-KR', label: '한국어', flag: 'KR' },
  { code: 'it-IT', label: 'Italiano', flag: 'IT' },
  { code: 'nl-NL', label: 'Nederlands', flag: 'NL' },
  { code: 'sv-SE', label: 'Svenska', flag: 'SE' },
] as const
