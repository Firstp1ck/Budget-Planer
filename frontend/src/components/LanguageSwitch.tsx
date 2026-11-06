import { useTranslation } from 'react-i18next'

function LanguageSwitch() {
  const { t, i18n } = useTranslation()
  const isEnglish = (i18n.resolvedLanguage || i18n.language).startsWith('en')
  const nextLanguage = isEnglish ? 'de-DE' : 'en-US'
  const action = t('header.switchLanguage', { language: isEnglish ? 'Deutsch' : 'English' })

  return (
    <button
      type="button"
      onClick={() => void i18n.changeLanguage(nextLanguage)}
      aria-label={action}
      title={action}
      className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg bg-gray-100 p-1 text-xs font-semibold text-gray-600 shadow-sm dark:bg-gray-700 dark:text-gray-300"
    >
      <span lang="de" aria-hidden="true" className={`rounded-md px-2 py-1.5 ${!isEnglish ? 'bg-white text-green-700 shadow-sm dark:bg-gray-600 dark:text-green-300' : ''}`}>DE</span>
      <span lang="en" aria-hidden="true" className={`rounded-md px-2 py-1.5 ${isEnglish ? 'bg-white text-green-700 shadow-sm dark:bg-gray-600 dark:text-green-300' : ''}`}>EN</span>
    </button>
  )
}

export default LanguageSwitch
