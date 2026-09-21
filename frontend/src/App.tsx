import { lazy, Suspense, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getMetrics, getSeries, getTelemetry, getVessels } from './api/client'
import { ApiStatus } from './components/ApiStatus'
import { FleetManifest } from './components/FleetManifest'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { ImportTelemetry } from './components/ImportTelemetry'
import { TelemetryFrames } from './components/TelemetryFrames'
import { TelemetryChart } from './components/TelemetryChart'
import './components/dashboard.css'

// Defer the map workspace so its raster tiles and telemetry canvas do not delay the control shell.
const VesselMap = lazy(() => import('./components/VesselMap').then((module) => ({ default: module.VesselMap })))

function boundedRange(routeStart: string, routeEnd: string, vesselStart: string | null, vesselEnd: string | null) {
  // The API returns and accepts naive ISO datetimes. Keep that representation intact rather than
  // round-tripping through Date (which can shift an available endpoint across a local timezone).
  const candidateStart = /^\d{4}-\d{2}-\d{2}$/.test(routeStart) ? `${routeStart}T00:00:00.000` : vesselStart ?? ''
  const candidateEnd = /^\d{4}-\d{2}-\d{2}$/.test(routeEnd) ? `${routeEnd}T23:59:59.999` : vesselEnd ?? ''
  const start = vesselStart && candidateStart < vesselStart ? vesselStart : candidateStart
  const end = vesselEnd && candidateEnd > vesselEnd ? vesselEnd : candidateEnd
  return { start, end, valid: !start || !end || start <= end }
}

// Use four real observations per calendar day: first, last, and two evenly spaced frames.
function replayFrames(records: import('./api/client').TelemetryRecord[], routeStart: string, routeEnd: string) {
  const latest = records.at(-1)?.timestamp.slice(0, 10) || ''
  const fallbackStart = latest ? new Date(`${latest}T00:00:00Z`) : null
  if (fallbackStart) fallbackStart.setUTCDate(fallbackStart.getUTCDate() - 29)
  const start = routeStart || fallbackStart?.toISOString().slice(0, 10) || ''
  const end = routeEnd || latest
  const days = new Map<string, import('./api/client').TelemetryRecord[]>()
  records.filter((record) => record.timestamp.slice(0, 10) >= start && record.timestamp.slice(0, 10) <= end).forEach((record) => {
    const day = record.timestamp.slice(0, 10)
    days.set(day, [...(days.get(day) ?? []), record])
  })
  return [...days.values()].flatMap((day) => [...new Map([0, Math.floor((day.length - 1) / 3), Math.ceil((day.length - 1) * 2 / 3), day.length - 1].map((index) => [day[index].timestamp, day[index]])).values()])
}

function App() {
  const { t } = useTranslation()
  const [selectedImos, setSelectedImos] = useState<string[]>([])
  const [focusedImo, setFocusedImo] = useState('')
  const [selectedMetric, setSelectedMetric] = useState('')
  const [comparisonMetric, setComparisonMetric] = useState('')
  const [selectedTimestamp, setSelectedTimestamp] = useState('')
  const [goToTelemetryRequest, setGoToTelemetryRequest] = useState(0)
  const [routeStart, setRouteStart] = useState('')
  const [routeEnd, setRouteEnd] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const vesselsQuery = useQuery({ queryKey: ['vessels'], queryFn: getVessels })
  // Defaults are derived rather than set in effects, avoiding unnecessary render cascades.
  const activeImo = focusedImo || selectedImos[0] || vesselsQuery.data?.[0]?.imo || ''
  const selectedSummary = vesselsQuery.data?.find((vessel) => vessel.imo === activeImo)
  const metricsQuery = useQuery({ queryKey: ['metrics', activeImo], queryFn: () => getMetrics(activeImo), enabled: Boolean(activeImo) })
  const activeMetric = selectedMetric || metricsQuery.data?.find((metric) => metric.key === 'sog')?.key || metricsQuery.data?.[0]?.key || ''
  const secondaryMetric = comparisonMetric || metricsQuery.data?.find((metric) => metric.key === 'rpm')?.key || metricsQuery.data?.find((metric) => metric.key !== activeMetric)?.key || ''
  // Route controls are calendar dates; clamp their UTC day boundaries to the API's actual vessel range.
  // This prevents an otherwise valid first/last day from producing an out-of-range API request.
  const { start: activeStart, end: activeEnd, valid: rangeValid } = boundedRange(routeStart, routeEnd, selectedSummary?.start ?? null, selectedSummary?.end ?? null)
  const telemetryQuery = useQuery({ queryKey: ['telemetry', activeImo, activeStart, activeEnd], queryFn: () => getTelemetry(activeImo, activeStart, activeEnd), enabled: Boolean(activeImo && rangeValid) })
  // Each selected vessel can expose a different available range. Clamp independently so the
  // shared calendar controls never ask one vessel for another vessel's unavailable dates.
  const mapImos = selectedImos.length ? selectedImos : activeImo ? [activeImo] : []
  const mapTelemetryQueries = useQueries({
    queries: mapImos.map((imo) => {
      const vessel = vesselsQuery.data?.find((entry) => entry.imo === imo)
      const range = boundedRange(routeStart, routeEnd, vessel?.start ?? null, vessel?.end ?? null)
      return {
        queryKey: ['telemetry', imo, range.start, range.end],
        queryFn: () => getTelemetry(imo, range.start, range.end),
        enabled: range.valid,
      }
    }),
  })
  const mapTelemetry = mapTelemetryQueries.flatMap((query, index) => query.data ? [{ imo: mapImos[index], records: query.data.records }] : [])
  // The map remains focused on one vessel, while the chart compares every selected vessel that
  // exposes the focused metric. useQueries starts these independent requests in parallel.
  const chartImos = selectedImos.length ? selectedImos : activeImo ? [activeImo] : []
  const chartableImos = chartImos.filter((imo) => vesselsQuery.data?.find((vessel) => vessel.imo === imo)?.available_metrics.includes(activeMetric))
  const seriesQueries = useQueries({
    queries: chartableImos.map((imo) => ({
      queryKey: ['series', imo, activeMetric, activeStart, activeEnd],
      queryFn: () => getSeries(imo, activeMetric, activeStart, activeEnd),
      enabled: Boolean(activeMetric && rangeValid),
    })),
  })
  const chartSeries = seriesQueries.flatMap((query) => query.data ? [query.data] : [])
  const seriesLoading = seriesQueries.some((query) => query.isPending)
  const seriesError = seriesQueries.some((query) => query.isError)
  const secondaryChartableImos = chartImos.filter((imo) => vesselsQuery.data?.find((vessel) => vessel.imo === imo)?.available_metrics.includes(secondaryMetric))
  const secondarySeriesQueries = useQueries({ queries: secondaryChartableImos.map((imo) => ({ queryKey: ['series', imo, secondaryMetric, activeStart, activeEnd], queryFn: () => getSeries(imo, secondaryMetric, activeStart, activeEnd), enabled: Boolean(secondaryMetric && rangeValid) })) })
  const secondarySeries = secondarySeriesQueries.flatMap((query) => query.data ? [query.data] : [])
  const replay = replayFrames(telemetryQuery.data?.records ?? [], routeStart, routeEnd)
  const selectedReplayIndex = replay.findIndex((record) => record.timestamp === selectedTimestamp)
  const replayValue = selectedReplayIndex >= 0 ? selectedReplayIndex : Math.max(0, replay.length - 1)

  const toggleVessel = (imo: string) => {
    setSelectedImos((current) => {
      const selected = current.length ? current : activeImo ? [activeImo] : []
      const next = selected.includes(imo) ? selected.filter((item) => item !== imo) : [...selected, imo]
      setFocusedImo((focused) => next.includes(imo) ? imo : focused === imo ? (next.at(-1) ?? '') : focused)
      return next
    })
    setSelectedMetric('')
    setSelectedTimestamp('')
    setRouteStart('')
    setRouteEnd('')
  }

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Radio aria-hidden="true" size={18} /></span><div><p className="brand-name">{t('app.name')}</p><p className="brand-version">{t('app.version')}</p></div></div><div className="header-actions"><LanguageSwitcher /><button className="import-button" type="button" onClick={() => setImportOpen(true)}>{t('actions.import')}</button></div></header>
    <main className="dashboard">
      <section className="intro" aria-labelledby="workspace-title"><p className="eyebrow">{t('dashboard.eyebrow')}</p><h1 id="workspace-title">{t('dashboard.title')}</h1><p>{t('dashboard.description')}</p></section>
      {importOpen ? <ImportTelemetry onCommitted={() => { setImportOpen(false); void vesselsQuery.refetch() }} /> : null}
      {vesselsQuery.isError ? <div className="fleet-error" role="alert"><p>{t('errors.fleet')}</p><button className="text-button" type="button" onClick={() => void vesselsQuery.refetch()}>{t('errors.retry')}</button></div> : null}
      <section className="workspace-grid" aria-label={t('dashboard.eyebrow')}>
        <Suspense fallback={<article className="map-workspace"><p className="loading-copy">{t('map.loading')}</p></article>}><VesselMap vesselTelemetry={mapTelemetry} focusedImo={activeImo} selectedFrame={telemetryQuery.data?.records.find((record) => record.timestamp === selectedTimestamp)} replayTimestamp={replay[replayValue]?.timestamp} routeStart={routeStart} routeEnd={routeEnd} onRouteStartChange={setRouteStart} onRouteEndChange={setRouteEnd} replay={replay.length ? { min: 0, max: replay.length - 1, value: replayValue, label: `${new Date(replay[replayValue].timestamp).toLocaleString()} | frame ${replayValue + 1} of ${replay.length}`, onChange: (index) => setSelectedTimestamp(replay[index]?.timestamp ?? ''), onGoToTelemetry: () => setGoToTelemetryRequest((request) => request + 1) } : undefined} loading={mapTelemetryQueries.some((query) => query.isPending)} error={mapTelemetryQueries.some((query) => query.isError)} onRetry={() => { void telemetryQuery.refetch(); mapTelemetryQueries.forEach((query) => void query.refetch()) }} /></Suspense>
        <FleetManifest vessels={vesselsQuery.data ?? []} selectedImos={selectedImos.length ? selectedImos : activeImo ? [activeImo] : []} focusedImo={activeImo} onToggle={toggleVessel} />
      </section>
       <TelemetryFrames vessels={mapTelemetry} focusedImo={activeImo} selectedTimestamp={selectedTimestamp} onFrameSelect={setSelectedTimestamp} routeStart={routeStart} routeEnd={routeEnd} onRouteStartChange={setRouteStart} onRouteEndChange={setRouteEnd} goToTelemetryRequest={goToTelemetryRequest} />
       <section className="chart-metric-controls" aria-label="Telemetry chart metrics"><label>Primary metric<select value={activeMetric} onChange={(event) => setSelectedMetric(event.target.value)}>{metricsQuery.data?.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label><label>Secondary metric<select value={secondaryMetric} onChange={(event) => setComparisonMetric(event.target.value)}>{metricsQuery.data?.filter((metric) => metric.key !== activeMetric).map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label></section>
       <TelemetryChart title="Primary telemetry trend" series={chartSeries} loading={Boolean(chartableImos.length && activeMetric) && seriesLoading} error={seriesError} dateRange={{ start: routeStart, end: routeEnd }} onRetry={() => seriesQueries.forEach((query) => void query.refetch())} />
       <TelemetryChart title="Secondary telemetry trend" series={secondarySeries} loading={secondarySeriesQueries.some((query) => query.isPending)} error={secondarySeriesQueries.some((query) => query.isError)} dateRange={{ start: routeStart, end: routeEnd }} onRetry={() => secondarySeriesQueries.forEach((query) => void query.refetch())} />
      <ApiStatus />
    </main>
  </div>
}

export default App
