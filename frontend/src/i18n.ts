import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import hi from './locales/hi.json'
import te from './locales/te.json'

const savedLanguage = localStorage.getItem('lang')
const initialLanguage = savedLanguage === 'hi' || savedLanguage === 'te' ? savedLanguage : 'en'

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    te: { translation: te },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

i18n.on('languageChanged', (language) => {
  localStorage.setItem('lang', language)
  document.documentElement.lang = language
})

document.documentElement.lang = initialLanguage

export default i18n
