import { useTranslation } from 'react-i18next'
import { supportedLanguages, type SupportedLanguage } from '../i18n'
import './languageSwitcher.css'

function FlagIcon({ language }: { language: SupportedLanguage }) {
  if (language === 'fr') return <svg aria-hidden="true" viewBox="0 0 24 16"><path fill="#1f4e99" d="M0 0h8v16H0z" /><path fill="#fff" d="M8 0h8v16H8z" /><path fill="#e43d30" d="M16 0h8v16h-8z" /></svg>
  return <svg aria-hidden="true" viewBox="0 0 24 16"><path fill="#1f4e99" d="M0 0h24v16H0z" /><path stroke="#fff" strokeWidth="5" d="M0 0l24 16M24 0L0 16" /><path stroke="#d63a3a" strokeWidth="2" d="M0 0l24 16M24 0L0 16" /><path stroke="#fff" strokeWidth="6" d="M12 0v16M0 8h24" /><path stroke="#d63a3a" strokeWidth="3" d="M12 0v16M0 8h24" /></svg>
}

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  // Place this control in a shared header; i18next updates all translated descendants.
  return <div className="language-switcher" aria-label={t('languages.label')}>{supportedLanguages.map((language) => <button className={i18n.resolvedLanguage === language ? 'language-button is-active' : 'language-button'} key={language} type="button" aria-label={t(`languages.${language}`)} aria-pressed={i18n.resolvedLanguage === language} onClick={() => void i18n.changeLanguage(language)}><FlagIcon language={language} /><span className="sr-only">{t(`languages.${language}`)}</span></button>)}</div>
}
