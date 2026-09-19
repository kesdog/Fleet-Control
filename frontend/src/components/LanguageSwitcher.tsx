import { useTranslation } from 'react-i18next'
import { supportedLanguages, type SupportedLanguage } from '../i18n'
const flags: Record<SupportedLanguage, string> = { en: 'GB', fr: 'FR' }

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  // Place this control in a shared header; i18next updates all translated descendants.
  return <div className="language-switcher" aria-label={t('languages.label')}>{supportedLanguages.map((language) => <button className={i18n.resolvedLanguage === language ? 'language-button is-active' : 'language-button'} key={language} type="button" aria-label={t(`languages.${language}`)} aria-pressed={i18n.resolvedLanguage === language} onClick={() => void i18n.changeLanguage(language)}><span aria-hidden="true">{flags[language]}</span><span className="sr-only">{t(`languages.${language}`)}</span></button>)}</div>
}
