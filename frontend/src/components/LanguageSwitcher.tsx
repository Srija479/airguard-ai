import { useTranslation } from 'react-i18next'

type Language = 'en' | 'hi' | 'te'

const languages: { code: Language; label: string; name: string }[] = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'hi', label: 'हिं', name: 'हिन्दी' },
  { code: 'te', label: 'తె', name: 'తెలుగు' },
]

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const activeLanguage = (i18n.resolvedLanguage ?? i18n.language).split('-')[0]

  return (
    <div role="group" aria-label={t('common.language')} className="flex items-center gap-1">
      {languages.map(({ code, label, name }) => {
        const active = activeLanguage === code
        const fontFamily =
          code === 'hi'
            ? 'Noto Sans Devanagari, sans-serif'
            : code === 'te'
              ? 'Noto Sans Telugu, sans-serif'
              : 'inherit'

        return (
          <button
            key={code}
            type="button"
            aria-label={name}
            aria-pressed={active}
            className={`min-h-12 min-w-12 border-b-2 px-2 py-2 text-base font-semibold ${
              active
                ? 'border-stone-900 text-stone-950'
                : 'border-transparent text-stone-600 hover:text-stone-950'
            }`}
            onClick={() => {
              void i18n.changeLanguage(code)
              document.documentElement.lang = code
            }}
            style={{ fontFamily }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
