import { lazy, Suspense, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getMetrics, getTrajectory, getVessel, getVessels } from './api/client'
import { ApiStatus } from './components/ApiStatus'
import { FleetControls } from './components/FleetControls'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { VesselDetails } from './components/VesselDetails'

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
  const [selectedImo, setSelectedImo] = useState('')
  const [selectedMetric, setSelectedMetric] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const vesselsQuery = useQuery({ queryKey: ['vessels'], queryFn: getVessels })
  // Defaults are derived rather than set in effects, avoiding unnecessary render cascades.
  const activeImo = selectedImo || vesselsQuery.data?.[0]?.imo || ''
  const selectedSummary = vesselsQuery.data?.find((vessel) => vessel.imo === activeImo)
  const vesselQuery = useQuery({ queryKey: ['vessel', activeImo], queryFn: () => getVessel(activeImo), enabled: Boolean(activeImo) })
  const metricsQuery = useQuery({ queryKey: ['metrics', activeImo], queryFn: () => getMetrics(activeImo), enabled: Boolean(activeImo) })
  const activeMetric = selectedMetric || metricsQuery.data?.find((metric) => metric.key === 'sog')?.key || metricsQuery.data?.[0]?.key || ''
  const selectedMetricDefinition = metricsQuery.data?.find((metric) => metric.key === activeMetric)
  const activeStart = start || toInputDate(selectedSummary?.start ?? null)
  const activeEnd = end || toInputDate(selectedSummary?.end ?? null)
  const rangeValid = !activeStart || !activeEnd || activeStart <= activeEnd
  // A new query key keeps the basemap route synchronized with vessel, metric, and date controls.
  const trajectoryQuery = useQuery({ queryKey: ['trajectory', activeImo, activeMetric, activeStart, activeEnd], queryFn: () => getTrajectory(activeImo, activeMetric, activeStart, activeEnd), enabled: Boolean(activeImo && activeMetric && rangeValid) })

  const changeVessel = (imo: string) => {
    const vessel = vesselsQuery.data?.find((item) => item.imo === imo)
    setSelectedImo(imo)
    setSelectedMetric('')
    setStart(toInputDate(vessel?.start ?? null))
    setEnd(toInputDate(vessel?.end ?? null))
  }
  const controlsDisabled = vesselsQuery.isPending || !vesselsQuery.data?.length

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Radio aria-hidden="true" size={18} /></span><div><p className="brand-name">{t('app.name')}</p><p className="brand-version">{t('app.version')}</p></div></div><div className="header-actions"><LanguageSwitcher /><button className="import-button" type="button" disabled><Download aria-hidden="true" size={16} />{t('actions.import')}</button></div></header>
    <main className="dashboard">
      <section className="intro" aria-labelledby="workspace-title"><p className="eyebrow">{t('dashboard.eyebrow')}</p><h1 id="workspace-title">{t('dashboard.title')}</h1><p>{t('dashboard.description')}</p></section>
      <FleetControls vessels={vesselsQuery.data ?? []} selectedImo={activeImo} metrics={metricsQuery.data ?? []} selectedMetric={activeMetric} start={activeStart} end={activeEnd} loading={vesselsQuery.isPending} disabled={controlsDisabled} rangeValid={rangeValid} onVesselChange={changeVessel} onMetricChange={setSelectedMetric} onStartChange={setStart} onEndChange={setEnd} />
      {vesselsQuery.isError ? <div className="fleet-error" role="alert"><p>{t('errors.fleet')}</p><button className="text-button" type="button" onClick={() => void vesselsQuery.refetch()}>{t('errors.retry')}</button></div> : null}
      <section className="workspace-grid" aria-label={t('dashboard.eyebrow')}>
        <Suspense fallback={<article className="map-workspace"><p className="loading-copy">{t('map.loading')}</p></article>}><VesselMap trajectory={trajectoryQuery.data} loading={Boolean(activeImo && activeMetric) && trajectoryQuery.isPending} error={trajectoryQuery.isError} onRetry={() => void trajectoryQuery.refetch()} /></Suspense>
        <VesselDetails vessel={vesselQuery.data} metric={selectedMetricDefinition} loading={Boolean(activeImo) && (vesselQuery.isPending || metricsQuery.isPending)} error={vesselQuery.isError || metricsQuery.isError} onRetry={() => { void vesselQuery.refetch(); void metricsQuery.refetch() }} />
      </section>
      <ApiStatus />
    </main>
  </div>
}

export default App
