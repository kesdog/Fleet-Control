import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getMetrics, getVessel, getVessels } from './api/client'
import { ApiStatus } from './components/ApiStatus'
import { FleetControls } from './components/FleetControls'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { VesselDetails } from './components/VesselDetails'

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

  const changeVessel = (imo: string) => {
    const vessel = vesselsQuery.data?.find((item) => item.imo === imo)
    setSelectedImo(imo)
    setSelectedMetric('')
    setStart(toInputDate(vessel?.start ?? null))
    setEnd(toInputDate(vessel?.end ?? null))
  }
  const rangeValid = !activeStart || !activeEnd || activeStart <= activeEnd
  const controlsDisabled = vesselsQuery.isPending || !vesselsQuery.data?.length

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Radio aria-hidden="true" size={18} /></span><div><p className="brand-name">{t('app.name')}</p><p className="brand-version">{t('app.version')}</p></div></div><div className="header-actions"><LanguageSwitcher /><button className="import-button" type="button" disabled><Download aria-hidden="true" size={16} />{t('actions.import')}</button></div></header>
    <main className="dashboard">
      <section className="intro" aria-labelledby="workspace-title"><p className="eyebrow">{t('dashboard.eyebrow')}</p><h1 id="workspace-title">{t('dashboard.title')}</h1><p>{t('dashboard.description')}</p></section>
      <FleetControls vessels={vesselsQuery.data ?? []} selectedImo={activeImo} metrics={metricsQuery.data ?? []} selectedMetric={activeMetric} start={activeStart} end={activeEnd} loading={vesselsQuery.isPending} disabled={controlsDisabled} rangeValid={rangeValid} onVesselChange={changeVessel} onMetricChange={setSelectedMetric} onStartChange={setStart} onEndChange={setEnd} />
      {vesselsQuery.isError ? <div className="fleet-error" role="alert"><p>{t('errors.fleet')}</p><button className="text-button" type="button" onClick={() => void vesselsQuery.refetch()}>{t('errors.retry')}</button></div> : null}
      <section className="workspace-grid" aria-label={t('dashboard.eyebrow')}>
        <article className="map-workspace"><div className="panel-heading"><div><p className="eyebrow">01</p><h2>{t('dashboard.mapTitle')}</h2></div><span className="panel-status">v0.11.0</span></div>{/* This placeholder reserves the map-first layout for the MapLibre milestone. */}<div className="map-grid" aria-hidden="true"><span className="map-axis axis-x" /><span className="map-axis axis-y" /><span className="map-point point-one" /><span className="map-point point-two" /><span className="map-route" /></div><p className="panel-note">{t('dashboard.mapDescription')}</p></article>
        <VesselDetails vessel={vesselQuery.data} metric={selectedMetricDefinition} loading={Boolean(activeImo) && (vesselQuery.isPending || metricsQuery.isPending)} error={vesselQuery.isError || metricsQuery.isError} onRetry={() => { void vesselQuery.refetch(); void metricsQuery.refetch() }} />
      </section>
      <ApiStatus />
    </main>
  </div>
}

export default App
