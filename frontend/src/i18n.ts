/**
 * i18n Configuration for Budget Planer
 *
 * Supports German (de-DE) and English (en-US) locales.
 * Uses browser language detection with localStorage persistence.
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import deDE from './locales/de-DE/translation.json'
import enUS from './locales/en-US/translation.json'

/** Supported languages in the application */
export const SUPPORTED_LANGUAGES = {
  'de-DE': { name: 'Deutsch', flag: '🇩🇪' },
  'en-US': { name: 'English', flag: '🇺🇸' },
} as const

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES

/** Resources for i18next */
const resources = {
  'de-DE': {
    translation: deDE,
  },
  'en-US': {
    translation: enUS,
  },
}

i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    resources,
    fallbackLng: 'en-US',
    supportedLngs: Object.keys(SUPPORTED_LANGUAGES),

    // Language detection options
    detection: {
      // Order of language detection methods
      order: ['localStorage', 'navigator', 'htmlTag'],
      // Cache user language in localStorage
      caches: ['localStorage'],
      // localStorage key name
      lookupLocalStorage: 'i18nextLng',
    },

    interpolation: {
      // React already escapes values
      escapeValue: false,
    },

    // React specific options
    react: {
      useSuspense: false,
    },
  })

export default i18n
