import { Download, Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ApiStatus } from './components/ApiStatus'
import { LanguageSwitcher } from './components/LanguageSwitcher'

function App() {
  const { t } = useTranslation()

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Radio aria-hidden="true" size={18} /></span><div><p className="brand-name">{t('app.name')}</p><p className="brand-version">{t('app.version')}</p></div></div>
        <div className="header-actions"><LanguageSwitcher /><button className="import-button" type="button" disabled><Download aria-hidden="true" size={16} />{t('actions.import')}</button></div>
      </header>
      <main className="dashboard">
        <section className="intro" aria-labelledby="workspace-title"><p className="eyebrow">{t('dashboard.eyebrow')}</p><h1 id="workspace-title">{t('dashboard.title')}</h1><p>{t('dashboard.description')}</p></section>
        <section className="workspace-grid" aria-label={t('dashboard.eyebrow')}>
          <article className="map-workspace"><div className="panel-heading"><div><p className="eyebrow">01</p><h2>{t('dashboard.mapTitle')}</h2></div><span className="panel-status">v0.11.0</span></div>{/* This placeholder reserves the map-first layout for the MapLibre milestone. */}<div className="map-grid" aria-hidden="true"><span className="map-axis axis-x" /><span className="map-axis axis-y" /><span className="map-point point-one" /><span className="map-point point-two" /><span className="map-route" /></div><p className="panel-note">{t('dashboard.mapDescription')}</p></article>
          <aside className="control-panel"><div className="panel-heading"><div><p className="eyebrow">02</p><h2>{t('dashboard.panelTitle')}</h2></div><span className="panel-status">v0.10.0</span></div><p className="panel-note">{t('dashboard.panelDescription')}</p><div className="empty-state"><span className="empty-marker" aria-hidden="true" /><h3>{t('dashboard.emptyTitle')}</h3><p>{t('dashboard.emptyDescription')}</p></div><ApiStatus /></aside>
        </section>
      </main>
    </div>
  )
}

export default App
