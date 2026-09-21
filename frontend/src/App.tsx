import { lazy, Suspense, useEffect, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Radio, Settings, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getMetrics, getSeries, getTelemetry, getVessels } from './api/client'
import { setVesselColor } from './vesselColors'
import { ApiStatus } from './components/ApiStatus'
import { FleetManifest } from './components/FleetManifest'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { ImportTelemetry } from './components/ImportTelemetry'
import { TelemetryFrames } from './components/TelemetryFrames'
import { TelemetryChart } from './components/TelemetryChart'
import { replayFrames, replayMinimumGapMs, nextReplayIndex } from './replay'
import './components/dashboard.css'
import './components/chartAddMenu.css'
import './components/settingsModal.css'

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

// Replay uses recorded observations nearest to evenly spaced daily slots.
function App() {
  const { t } = useTranslation()
  const [selectedImos, setSelectedImos] = useState<string[]>([])
  const [focusedImo, setFocusedImo] = useState('')
  const [selectedMetric, setSelectedMetric] = useState('')
  const [extraChartMetrics, setExtraChartMetrics] = useState<string[]>([])
  const [selectedTimestamp, setSelectedTimestamp] = useState('')
  const [goToTelemetryRequest, setGoToTelemetryRequest] = useState(0)
  const [routeStart, setRouteStart] = useState('')
  const [routeEnd, setRouteEnd] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [playbackDirection, setPlaybackDirection] = useState<1 | -1>(1)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [replayFramesPerDay, setReplayFramesPerDay] = useState(4)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [colorRevision, setColorRevision] = useState(0)
  const [chartMenuOpen, setChartMenuOpen] = useState(false)
  const [scaleUnit, setScaleUnit] = useState<'km' | 'mi' | 'nm'>('nm')
  const [notification, setNotification] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const vesselsQuery = useQuery({ queryKey: ['vessels'], queryFn: getVessels })
  useEffect(() => {
    if (!settingsOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [settingsOpen])
  useEffect(() => {
    if (!notification) return
    const timer = window.setTimeout(() => setNotification(null), 5_000)
    return () => window.clearTimeout(timer)
  }, [notification])
  // Defaults are derived rather than set in effects, avoiding unnecessary render cascades.
  const activeImo = focusedImo || selectedImos[0] || vesselsQuery.data?.[0]?.imo || ''
  const selectedSummary = vesselsQuery.data?.find((vessel) => vessel.imo === activeImo)
  const metricsQuery = useQuery({ queryKey: ['metrics', activeImo], queryFn: () => getMetrics(activeImo), enabled: Boolean(activeImo) })
  const activeMetric = selectedMetric || metricsQuery.data?.find((metric) => metric.key === 'sog')?.key || metricsQuery.data?.[0]?.key || ''
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
  const chartSlots = [activeMetric, ...extraChartMetrics].filter(Boolean)
  const chartSlotQueries = useQueries({ queries: chartSlots.flatMap((metric) => chartImos.filter((imo) => vesselsQuery.data?.find((vessel) => vessel.imo === imo)?.available_metrics.includes(metric)).map((imo) => ({ queryKey: ['chart-slot-series', imo, metric, activeStart, activeEnd], queryFn: () => getSeries(imo, metric, activeStart, activeEnd), enabled: Boolean(metric && rangeValid) }))) })
  let chartQueryOffset = 0
  const chartSlotsWithSeries = chartSlots.map((metric) => { const count = chartImos.filter((imo) => vesselsQuery.data?.find((vessel) => vessel.imo === imo)?.available_metrics.includes(metric)).length; const queries = chartSlotQueries.slice(chartQueryOffset, chartQueryOffset + count); chartQueryOffset += count; return { metric, series: queries.flatMap((query) => query.data ? [query.data] : []), loading: queries.some((query) => query.isPending), error: queries.some((query) => query.isError), refetch: () => queries.forEach((query) => void query.refetch()) } })
  const replay = replayFrames(telemetryQuery.data?.records ?? [], routeStart, routeEnd, replayFramesPerDay)
  const selectedReplayIndex = replay.findIndex((record) => record.timestamp === selectedTimestamp)
  const replayValue = selectedReplayIndex >= 0 ? selectedReplayIndex : Math.max(0, replay.length - 1)

  useEffect(() => {
    if (!playing || !replay.length) return
    const timer = window.setInterval(() => {
      const next = replayValue + playbackDirection
      if (nextReplayIndex(replayValue, playbackDirection, replay.length) === null) { setPlaying(false); return }
      setSelectedTimestamp(replay[next].timestamp)
    }, 1_000 / playbackSpeed)
    return () => window.clearInterval(timer)
  }, [playing, playbackDirection, playbackSpeed, replay, replayValue])

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

  const notify = (message: string, tone: 'success' | 'error') => setNotification({ message, tone })

  if (importOpen) return <>
    <ImportTelemetry
      vessels={vesselsQuery.data ?? []}
      onClose={() => setImportOpen(false)}
      onCommitted={(imo, samplesImported) => {
        setImportOpen(false)
        void vesselsQuery.refetch()
        notify(t('notifications.importSuccess', { imo, count: samplesImported }), 'success')
      }}
      onNotify={notify}
    />
    {notification ? <Toast notification={notification} onDismiss={() => setNotification(null)} /> : null}
  </>

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Radio aria-hidden="true" size={18} /></span><div><p className="brand-name">{t('app.name')}</p><p className="brand-version">{t('app.version')}</p></div></div><div className="header-actions"><LanguageSwitcher /><button type="button" className="settings-button" aria-label={t('settings.open')} aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}><Settings size={17} /></button><button className="import-button" type="button" onClick={() => setImportOpen(true)}>{t('actions.import')}</button></div></header>
    {settingsOpen ? <div className="settings-modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}><div className="settings-modal-heading"><h2 id="settings-title">{t('settings.title')}</h2><button type="button" aria-label={t('settings.close')} onClick={() => setSettingsOpen(false)}>×</button></div><label>{t('settings.replaySpeed')}<select value={playbackSpeed} onChange={(event) => setPlaybackSpeed(Number(event.target.value))}><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option></select></label><label>{t('settings.replayFrames')}<input type="number" min={2} max={12} value={replayFramesPerDay} onChange={(event) => setReplayFramesPerDay(Math.max(2, Math.min(12, Number(event.target.value) || 2)))} /><small>{t('settings.minimumSpacing', { minutes: Math.round(replayMinimumGapMs(replayFramesPerDay) / 60_000) })}</small></label><label>{t('settings.mapScale')}<select value={scaleUnit} onChange={(event) => setScaleUnit(event.target.value as 'km' | 'mi' | 'nm')}><option value="nm">{t('settings.nauticalMiles')}</option><option value="km">{t('settings.kilometers')}</option><option value="mi">{t('settings.miles')}</option></select></label><ApiStatus /></section></div> : null}
    <main className="dashboard">
      <section className="intro" aria-labelledby="workspace-title"><p className="eyebrow">{t('dashboard.eyebrow')}</p><h1 id="workspace-title">{t('dashboard.title')}</h1><p>{t('dashboard.description')}</p></section>
      {vesselsQuery.isError ? <div className="fleet-error" role="alert"><p>{t('errors.fleet')}</p><button className="text-button" type="button" onClick={() => void vesselsQuery.refetch()}>{t('errors.retry')}</button></div> : null}
      <section className="workspace-grid" aria-label={t('dashboard.eyebrow')}>
        <Suspense fallback={<article className="map-workspace"><p className="loading-copy">{t('map.loading')}</p></article>}><VesselMap vesselTelemetry={mapTelemetry} focusedImo={activeImo} selectedFrame={telemetryQuery.data?.records.find((record) => record.timestamp === selectedTimestamp)} replayTimestamp={replay[replayValue]?.timestamp} colorVersion={colorRevision} scaleUnit={scaleUnit} routeStart={routeStart} routeEnd={routeEnd} onRouteStartChange={setRouteStart} onRouteEndChange={setRouteEnd} replay={replay.length ? { min: 0, max: replay.length - 1, value: replayValue, label: `${new Date(replay[replayValue].timestamp).toLocaleString()} | ${t('playback.frameLabel', { frame: replayValue + 1, total: replay.length })}`, onChange: (index) => { setPlaying(false); setSelectedTimestamp(replay[index]?.timestamp ?? '') }, playing, speed: playbackSpeed, onPlay: () => { setPlaybackDirection(1); setPlaying(true) }, onPause: () => setPlaying(false), onPlayReverse: () => { setPlaybackDirection(-1); setPlaying(true) }, onPrevious: () => { setPlaying(false); setSelectedTimestamp(replay[Math.max(0, replayValue - 1)]?.timestamp ?? '') }, onNext: () => { setPlaying(false); setSelectedTimestamp(replay[Math.min(replay.length - 1, replayValue + 1)]?.timestamp ?? '') }, onGoToTelemetry: () => setGoToTelemetryRequest((request) => request + 1) } : undefined} loading={mapTelemetryQueries.some((query) => query.isPending)} error={mapTelemetryQueries.some((query) => query.isError)} onRetry={() => { void telemetryQuery.refetch(); mapTelemetryQueries.forEach((query) => void query.refetch()) }} /></Suspense>
        <FleetManifest vessels={vesselsQuery.data ?? []} selectedImos={selectedImos.length ? selectedImos : activeImo ? [activeImo] : []} focusedImo={activeImo} onToggle={toggleVessel} onColorChange={(imo, color) => { setVesselColor(imo, color); setColorRevision((revision) => revision + 1) }} />
      </section>
       <TelemetryFrames vessels={mapTelemetry} focusedImo={activeImo} selectedTimestamp={selectedTimestamp} onFrameSelect={setSelectedTimestamp} routeStart={routeStart} routeEnd={routeEnd} onRouteStartChange={setRouteStart} onRouteEndChange={setRouteEnd} goToTelemetryRequest={goToTelemetryRequest} />
       <section className="chart-metric-controls" aria-label={t('chart.metricsAriaLabel')}><label>{t('chart.primaryMetric')}<select value={activeMetric} onChange={(event) => setSelectedMetric(event.target.value)}>{metricsQuery.data?.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label></section>
        {chartSlotsWithSeries.map((slot, index) => <section className="chart-slot" key={`${slot.metric}-${index}`}>{index ? <div className="chart-slot-controls"><label>{t('chart.chartMetric')}<select value={slot.metric} onChange={(event) => setExtraChartMetrics((metrics) => metrics.map((metric, metricIndex) => metricIndex === index - 1 ? event.target.value : metric))}>{metricsQuery.data?.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label><button type="button" onClick={() => setExtraChartMetrics((metrics) => metrics.filter((_, metricIndex) => metricIndex !== index - 1))}>{t('chart.removeChart')}</button></div> : null}<TelemetryChart title={index ? `${t('chart.telemetryTrend')} ${index + 1}` : t('chart.telemetryTrend')} series={slot.series} loading={slot.loading} error={slot.error} colorVersion={colorRevision} dateRange={{ start: routeStart, end: routeEnd }} replayTimestamp={replay[replayValue]?.timestamp} onRetry={slot.refetch} /></section>)}
       <div className="chart-add-menu"><button type="button" className="chart-add-button" aria-expanded={chartMenuOpen} aria-controls="chart-metric-menu" onClick={() => setChartMenuOpen((open) => !open)}>+<span className="sr-only">{t('chart.addMetricChart')}</span></button>{chartMenuOpen ? <div id="chart-metric-menu" role="menu" aria-label={t('chart.addMetricChart')}>{metricsQuery.data?.filter((metric) => !chartSlots.includes(metric.key)).map((metric) => <button type="button" role="menuitem" key={metric.key} onClick={() => { setExtraChartMetrics((metrics) => [...metrics, metric.key]); setChartMenuOpen(false) }}>{metric.label}</button>)}</div> : null}</div>
    </main>
    {notification ? <Toast notification={notification} onDismiss={() => setNotification(null)} /> : null}
  </div>
}

function Toast({ notification, onDismiss }: { notification: { message: string; tone: 'success' | 'error' }; onDismiss: () => void }) {
  const error = notification.tone === 'error'
  const { t } = useTranslation()
  return <div className={`app-toast is-${notification.tone}`} role={error ? 'alert' : 'status'}><span>{error ? <XCircle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}</span><p>{notification.message}</p><button type="button" aria-label={t('notifications.dismiss')} onClick={onDismiss}>×</button></div>
}

export default App
