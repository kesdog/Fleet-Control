import { lazy, Suspense, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Radio, Settings, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getVessels } from './api/client'
import { setVesselColor } from './vesselColors'
import { ApiStatus } from './components/ApiStatus'
import { FleetManifest } from './components/FleetManifest'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { ImportTelemetry } from './components/ImportTelemetry'
import { TelemetryFrames } from './components/TelemetryFrames'
import { TelemetryChart } from './components/TelemetryChart'
import { VoyagePerformance } from './components/VoyagePerformance'
import { replayMinimumGapMs } from './replay'
import { type RouteMetric } from './map/routeShade'
import { useFleetSelection } from './hooks/useFleetSelection'
import { useNotifications } from './hooks/useNotifications'
import { useTelemetryQueries } from './hooks/useTelemetryQueries'
import { useTelemetryReplay } from './hooks/useTelemetryReplay'
import './components/dashboard.css'
import './components/chartAddMenu.css'
import './components/settingsModal.css'

// Defer the map workspace so its raster tiles and telemetry canvas do not delay the control shell.
const VesselMap = lazy(() => import('./components/VesselMap').then((module) => ({ default: module.VesselMap })))

function App() {
  const { t } = useTranslation()
  const [selectedMetric, setSelectedMetric] = useState('')
  const [extraChartMetrics, setExtraChartMetrics] = useState<string[]>([])
  const [chartTypes, setChartTypes] = useState<Record<string, 'line' | 'bar'>>({})
  const [goToTelemetryRequest, setGoToTelemetryRequest] = useState(0)
  const [routeStart, setRouteStart] = useState('')
  const [routeEnd, setRouteEnd] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [colorRevision, setColorRevision] = useState(0)
  const [chartMenuOpen, setChartMenuOpen] = useState(false)
  const [routeMetric, setRouteMetric] = useState<RouteMetric>('fuel_tpd')
  const [scaleUnit, setScaleUnit] = useState<'km' | 'mi' | 'nm'>('nm')
  const vesselsQuery = useQuery({ queryKey: ['vessels'], queryFn: getVessels })
  const { selectedImos, activeImo, toggleVessel } = useFleetSelection(vesselsQuery.data)
  const { notification, notify, dismissNotification } = useNotifications()
  const queries = useTelemetryQueries(vesselsQuery.data, selectedImos, activeImo, selectedMetric, extraChartMetrics, routeStart, routeEnd)
  const replayState = useTelemetryReplay(queries.telemetryQuery.data?.records ?? [], routeStart, routeEnd)
  useEffect(() => {
    if (!settingsOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [settingsOpen])

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
    {notification ? <Toast notification={notification} onDismiss={dismissNotification} /> : null}
  </>

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Radio aria-hidden="true" size={18} /></span><div><p className="brand-name">{t('app.name')}</p><p className="brand-version">{t('app.version')}</p></div></div><div className="header-actions"><LanguageSwitcher /><button type="button" className="settings-button" aria-label={t('settings.open')} aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}><Settings size={17} /></button><button className="import-button" type="button" onClick={() => setImportOpen(true)}>{t('actions.import')}</button></div></header>
    {settingsOpen ? <div className="settings-modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}><div className="settings-modal-heading"><h2 id="settings-title">{t('settings.title')}</h2><button type="button" aria-label={t('settings.close')} onClick={() => setSettingsOpen(false)}>×</button></div><label>{t('settings.replaySpeed')}<select value={replayState.playbackSpeed} onChange={(event) => replayState.setPlaybackSpeed(Number(event.target.value))}><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option></select></label><label>{t('settings.replayFrames')}<input type="number" min={2} max={12} value={replayState.replayFramesPerDay} onChange={(event) => replayState.setReplayFramesPerDay(Math.max(2, Math.min(12, Number(event.target.value) || 2)))} /><small>{t('settings.minimumSpacing', { minutes: Math.round(replayMinimumGapMs(replayState.replayFramesPerDay) / 60_000) })}</small></label><label>{t('settings.mapScale')}<select value={scaleUnit} onChange={(event) => setScaleUnit(event.target.value as 'km' | 'mi' | 'nm')}><option value="nm">{t('settings.nauticalMiles')}</option><option value="km">{t('settings.kilometers')}</option><option value="mi">{t('settings.miles')}</option></select></label><ApiStatus /></section></div> : null}
    <main className="dashboard">
      <section className="intro" aria-labelledby="workspace-title"><p className="eyebrow">{t('dashboard.eyebrow')}</p><h1 id="workspace-title">{t('dashboard.title')}</h1><p>{t('dashboard.description')}</p></section>
      {vesselsQuery.isError ? <div className="fleet-error" role="alert"><p>{t('errors.fleet')}</p><button className="text-button" type="button" onClick={() => void vesselsQuery.refetch()}>{t('errors.retry')}</button></div> : null}
      <section className="workspace-grid" aria-label={t('dashboard.eyebrow')}>
        <Suspense fallback={<article className="map-workspace"><p className="loading-copy">{t('map.loading')}</p></article>}><VesselMap vesselTelemetry={queries.mapTelemetry} focusedImo={activeImo} selectedFrame={queries.telemetryQuery.data?.records.find((record) => record.timestamp === replayState.selectedTimestamp)} replayTimestamp={replayState.replay[replayState.replayValue]?.timestamp} colorVersion={colorRevision} scaleUnit={scaleUnit} routeMetric={routeMetric} onRouteMetricChange={setRouteMetric} routeStart={routeStart} routeEnd={routeEnd} onRouteStartChange={setRouteStart} onRouteEndChange={setRouteEnd} replay={replayState.replay.length ? { min: 0, max: replayState.replay.length - 1, value: replayState.replayValue, label: `${new Date(replayState.replay[replayState.replayValue].timestamp).toLocaleString()} | ${t('playback.frameLabel', { frame: replayState.replayValue + 1, total: replayState.replay.length })}`, onChange: (index) => { replayState.setPlaying(false); replayState.setSelectedTimestamp(replayState.replay[index]?.timestamp ?? '') }, playing: replayState.playing, speed: replayState.playbackSpeed, onPlay: () => { replayState.setPlaybackDirection(1); replayState.setPlaying(true) }, onPause: () => replayState.setPlaying(false), onPlayReverse: () => { replayState.setPlaybackDirection(-1); replayState.setPlaying(true) }, onPrevious: () => { replayState.setPlaying(false); replayState.setSelectedTimestamp(replayState.replay[Math.max(0, replayState.replayValue - 1)]?.timestamp ?? '') }, onNext: () => { replayState.setPlaying(false); replayState.setSelectedTimestamp(replayState.replay[Math.min(replayState.replay.length - 1, replayState.replayValue + 1)]?.timestamp ?? '') }, onGoToTelemetry: () => setGoToTelemetryRequest((request) => request + 1) } : undefined} loading={queries.mapTelemetryQueries.some((query) => query.isPending)} error={queries.mapTelemetryQueries.some((query) => query.isError)} onRetry={() => { void queries.telemetryQuery.refetch(); queries.mapTelemetryQueries.forEach((query) => void query.refetch()) }} /></Suspense>
        <FleetManifest vessels={vesselsQuery.data ?? []} selectedImos={selectedImos.length ? selectedImos : activeImo ? [activeImo] : []} focusedImo={activeImo} onToggle={(imo) => toggleVessel(imo, () => { setSelectedMetric(''); replayState.resetReplaySelection(); setRouteStart(''); setRouteEnd('') })} onColorChange={(imo, color) => { setVesselColor(imo, color); setColorRevision((revision) => revision + 1) }} />
      </section>
       <TelemetryFrames vessels={queries.mapTelemetry} focusedImo={activeImo} selectedTimestamp={replayState.selectedTimestamp} onFrameSelect={replayState.setSelectedTimestamp} routeStart={routeStart} routeEnd={routeEnd} onRouteStartChange={setRouteStart} onRouteEndChange={setRouteEnd} goToTelemetryRequest={goToTelemetryRequest} />
       <VoyagePerformance entries={queries.performanceEntries} loading={queries.performanceLoading} error={queries.performanceError} onRetry={() => queries.performanceQueries.forEach((query) => void query.refetch())} />
       <section className="chart-metric-controls" aria-label={t('chart.metricsAriaLabel')}><label>{t('chart.primaryMetric')}<select value={queries.activeMetric} onChange={(event) => setSelectedMetric(event.target.value)}>{queries.metricsQuery.data?.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label><label>{t('chart.chartType')}<select value={chartTypes[queries.activeMetric] ?? 'line'} onChange={(event) => setChartTypes((types) => ({ ...types, [queries.activeMetric]: event.target.value as 'line' | 'bar' }))}><option value="line">{t('chart.typeLine')}</option><option value="bar">{t('chart.typeBar')}</option></select></label></section>
        {queries.chartSlotsWithSeries.map((slot, index) => <section className="chart-slot" key={`${slot.metric}-${index}`}>{index ? <div className="chart-slot-controls"><label>{t('chart.chartMetric')}<select value={slot.metric} onChange={(event) => setExtraChartMetrics((metrics) => metrics.map((metric, metricIndex) => metricIndex === index - 1 ? event.target.value : metric))}>{queries.metricsQuery.data?.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label><label>{t('chart.chartType')}<select value={chartTypes[slot.metric] ?? 'line'} onChange={(event) => setChartTypes((types) => ({ ...types, [slot.metric]: event.target.value as 'line' | 'bar' }))}><option value="line">{t('chart.typeLine')}</option><option value="bar">{t('chart.typeBar')}</option></select></label><button type="button" onClick={() => setExtraChartMetrics((metrics) => metrics.filter((_, metricIndex) => metricIndex !== index - 1))}>{t('chart.removeChart')}</button></div> : null}<TelemetryChart series={slot.series} loading={slot.loading} error={slot.error} colorVersion={colorRevision} dateRange={{ start: routeStart, end: routeEnd }} replayTimestamp={replayState.replay[replayState.replayValue]?.timestamp} chartType={chartTypes[slot.metric] ?? 'line'} onRetry={slot.refetch} /></section>)}
        <div className="chart-add-menu"><button type="button" className="chart-add-button" aria-expanded={chartMenuOpen} aria-controls="chart-metric-menu" onClick={() => setChartMenuOpen((open) => !open)}>+<span className="sr-only">{t('chart.addMetricChart')}</span></button>{chartMenuOpen ? <div id="chart-metric-menu" role="menu" aria-label={t('chart.addMetricChart')}>{queries.metricsQuery.data?.filter((metric) => !queries.chartSlots.includes(metric.key)).map((metric) => <button type="button" role="menuitem" key={metric.key} onClick={() => { setExtraChartMetrics((metrics) => [...metrics, metric.key]); setChartMenuOpen(false) }}>{metric.label}</button>)}</div> : null}</div>
    </main>
    {notification ? <Toast notification={notification} onDismiss={dismissNotification} /> : null}
  </div>
}

function Toast({ notification, onDismiss }: { notification: { message: string; tone: 'success' | 'error' }; onDismiss: () => void }) {
  const error = notification.tone === 'error'
  const { t } = useTranslation()
  return <div className={`app-toast is-${notification.tone}`} role={error ? 'alert' : 'status'}><span>{error ? <XCircle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}</span><p>{notification.message}</p><button type="button" aria-label={t('notifications.dismiss')} onClick={onDismiss}>×</button></div>
}

export default App
