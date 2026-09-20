import { lazy, Suspense, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getMetrics, getTelemetry, getTrajectory, getVessels } from './api/client'
import { ApiStatus } from './components/ApiStatus'
import { FleetManifest } from './components/FleetManifest'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { ImportTelemetry } from './components/ImportTelemetry'
import { TelemetryFrames } from './components/TelemetryFrames'
import './components/dashboard.css'

// MapLibre is sizeable; defer it until the map workspace renders rather than delaying the control shell.
const VesselMap = lazy(() => import('./components/VesselMap').then((module) => ({ default: module.VesselMap })))

function toInputDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function App() {
  const { t } = useTranslation()
  const [selectedImos, setSelectedImos] = useState<string[]>([])
  const [focusedImo, setFocusedImo] = useState('')
  const [selectedMetric, setSelectedMetric] = useState('')
  const [selectedTimestamp, setSelectedTimestamp] = useState('')
  const [routeDate, setRouteDate] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const vesselsQuery = useQuery({ queryKey: ['vessels'], queryFn: getVessels })
  // Defaults are derived rather than set in effects, avoiding unnecessary render cascades.
  const activeImo = focusedImo || selectedImos[0] || vesselsQuery.data?.[0]?.imo || ''
  const selectedSummary = vesselsQuery.data?.find((vessel) => vessel.imo === activeImo)
  const metricsQuery = useQuery({ queryKey: ['metrics', activeImo], queryFn: () => getMetrics(activeImo), enabled: Boolean(activeImo) })
  const activeMetric = selectedMetric || metricsQuery.data?.find((metric) => metric.key === 'sog')?.key || metricsQuery.data?.[0]?.key || ''
  const activeStart = toInputDate(selectedSummary?.start ?? null)
  const activeEnd = toInputDate(selectedSummary?.end ?? null)
  const rangeValid = !activeStart || !activeEnd || activeStart <= activeEnd
  // A new query key keeps the basemap route synchronized with vessel, metric, and date controls.
  const trajectoryQuery = useQuery({ queryKey: ['trajectory', activeImo, activeMetric, activeStart, activeEnd], queryFn: () => getTrajectory(activeImo, activeMetric, activeStart, activeEnd), enabled: Boolean(activeImo && activeMetric && rangeValid) })
  const telemetryQuery = useQuery({ queryKey: ['telemetry', activeImo, activeStart, activeEnd], queryFn: () => getTelemetry(activeImo, activeStart, activeEnd), enabled: Boolean(activeImo && rangeValid) })

  const toggleVessel = (imo: string) => {
    setSelectedImos((current) => current.includes(imo) ? current.filter((item) => item !== imo) : [...current, imo])
    setFocusedImo(imo)
    setSelectedMetric('')
    setSelectedTimestamp('')
    setRouteDate('')
  }

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Radio aria-hidden="true" size={18} /></span><div><p className="brand-name">{t('app.name')}</p><p className="brand-version">{t('app.version')}</p></div></div><div className="header-actions"><LanguageSwitcher /><button className="import-button" type="button" onClick={() => setImportOpen((open) => !open)}>{t('actions.import')}</button></div></header>
    <main className="dashboard">
      <section className="intro" aria-labelledby="workspace-title"><p className="eyebrow">{t('dashboard.eyebrow')}</p><h1 id="workspace-title">{t('dashboard.title')}</h1><p>{t('dashboard.description')}</p></section>
      {importOpen ? <ImportTelemetry onCommitted={() => { setImportOpen(false); void vesselsQuery.refetch() }} /> : null}
      {vesselsQuery.isError ? <div className="fleet-error" role="alert"><p>{t('errors.fleet')}</p><button className="text-button" type="button" onClick={() => void vesselsQuery.refetch()}>{t('errors.retry')}</button></div> : null}
      <section className="workspace-grid" aria-label={t('dashboard.eyebrow')}>
        <Suspense fallback={<article className="map-workspace"><p className="loading-copy">{t('map.loading')}</p></article>}><VesselMap trajectory={trajectoryQuery.data} telemetry={telemetryQuery.data?.records} selectedFrame={telemetryQuery.data?.records.find((record) => record.timestamp === selectedTimestamp)} routeDate={routeDate} onRouteDateChange={setRouteDate} loading={Boolean(activeImo && activeMetric) && trajectoryQuery.isPending} error={trajectoryQuery.isError} onRetry={() => { void trajectoryQuery.refetch(); void telemetryQuery.refetch() }} /></Suspense>
        <FleetManifest vessels={vesselsQuery.data ?? []} selectedImos={selectedImos.length ? selectedImos : activeImo ? [activeImo] : []} focusedImo={activeImo} onToggle={toggleVessel} />
      </section>
      <TelemetryFrames imo={activeImo} records={telemetryQuery.data?.records ?? []} metrics={metricsQuery.data ?? []} selectedTimestamp={selectedTimestamp} onFrameSelect={(timestamp) => { setSelectedTimestamp(timestamp); setRouteDate(timestamp.slice(0, 10)) }} />
      <ApiStatus />
    </main>
  </div>
}

export default App
