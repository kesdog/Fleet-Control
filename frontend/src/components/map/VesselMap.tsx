import { type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryRecord } from '../../api/client'
import { dragRasterCamera } from '../../map/rasterProjection'
import { mapScale, type ScaleUnit } from '../../map/scale'
import { type RouteMetric } from '../../map/routeShade'
import { portRadius, screenPorts, type ScreenPort } from '../../map/ports'
import { PortOverlay } from '../PortOverlay'
import '../replayControls.css'
import { MapControls } from './MapControls'
import { ReplayControls, type ReplayControlsProps } from './ReplayControls'
import { RouteLegend } from './RouteLegend'
import { RasterBaseLayer } from './RasterBaseLayer'
import { RouteLayer } from './RouteLayer'
import type { MapCenter, MapViewport, VesselTelemetry } from './types'

type SurfaceDrag = {
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  camera: MapCenter
  viewport: MapViewport
}

type ReplaySliderProps = ReplayControlsProps & {
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  step?: number
  label?: string
  onGoToTelemetry?: () => void
  playing: boolean
  speed: number
  onPlay: () => void
  onPause: () => void
  onPlayReverse: () => void
  onPrevious: () => void
  onNext: () => void
}

type VesselMapProps = {
  vesselTelemetry: VesselTelemetry[]
  focusedImo: string
  selectedFrame?: TelemetryRecord
  replayTimestamp?: string
  colorVersion: number
  scaleUnit: ScaleUnit
  routeMetric: RouteMetric
  onRouteMetricChange: (metric: RouteMetric) => void
  routeStart: string
  routeEnd: string
  onRouteStartChange: (date: string) => void
  onRouteEndChange: (date: string) => void
  loading: boolean
  error: boolean
  onRetry: () => void
  /** Optional controlled replay UI for consumers that provide a frame index. */
  replay?: ReplaySliderProps
}

const initialCamera: MapCenter = { latitude: 0, longitude: 0, zoom: 1.5 }

function CameraReadout({ center }: { center: MapCenter }) {
  const { t } = useTranslation()
  return <div className="map-navigation" style={{ top: 12, bottom: 'auto' }}>
    <span aria-live="polite">{t('map.position', { latitude: center.latitude.toFixed(6), longitude: center.longitude.toFixed(6), zoom: center.zoom.toFixed(2) })}</span>
  </div>
}

function MapScale({ center, viewport, unit }: { center: MapCenter; viewport: MapViewport; unit: ScaleUnit }) {
  if (!viewport.width) return null
  const { distance, width } = mapScale(center, viewport, unit)
  const label = distance >= 10 || Number.isInteger(distance) ? distance.toLocaleString() : distance.toFixed(1)
  return <div className="map-scale" style={{ position: 'absolute', zIndex: 3, right: 12, bottom: 12, width, borderTop: '3px solid #263a44', color: '#263a44', background: 'rgba(255,255,255,.93)', font: '10px/1.25 "Courier New", monospace', textAlign: 'center' }} aria-label={`Map scale: ${label} ${unit}`}><span>{label} {unit}</span></div>
}


function filterRecordsByDate(records: TelemetryRecord[] | undefined, routeStart: string, routeEnd: string) {
  const latestDate = records?.at(-1)?.timestamp.slice(0, 10) || ''
  const defaultStart = latestDate ? new Date(`${latestDate}T00:00:00Z`) : null
  if (defaultStart) defaultStart.setUTCDate(defaultStart.getUTCDate() - 29)

  const activeStart = routeStart || defaultStart?.toISOString().slice(0, 10) || ''
  const activeEnd = routeEnd || latestDate
  return (records ?? []).filter((record) => record.timestamp.slice(0, 10) >= activeStart && record.timestamp.slice(0, 10) <= activeEnd)
}

export function VesselMap({ vesselTelemetry, focusedImo, selectedFrame, replayTimestamp, colorVersion, scaleUnit, routeMetric, onRouteMetricChange, routeStart, routeEnd, onRouteStartChange: _onRouteStartChange, onRouteEndChange: _onRouteEndChange, loading, error, onRetry, replay }: VesselMapProps) {
  const { t } = useTranslation()
  const mapCanvasRef = useRef<HTMLDivElement>(null)
  const panLayerRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<SurfaceDrag | null>(null)
  const panFrameRef = useRef<number | null>(null)
  const wheelFrameRef = useRef<number | null>(null)
  const wheelDeltaRef = useRef(0)
  const resetPanTransformRef = useRef(false)
  const cameraRef = useRef<MapCenter>(initialCamera)
  // This controlled raster camera is authoritative for both DOM tiles and SVG overlays.
  const [mapCenter, setMapCenter] = useState<MapCenter>(initialCamera)
  const [mapViewport, setMapViewport] = useState<MapViewport>({ width: 0, height: 0 })
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const [hoveredPort, setHoveredPort] = useState<ScreenPort | null>(null)

  useEffect(() => {
    const container = mapCanvasRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) {
        const width = entry.contentRect.width
        const height = entry.contentRect.height
        setMapViewport((current) => current.width === width && current.height === height ? current : { width, height })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === mapCanvasRef.current)
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !fullscreen) return
    const zoom = (event: WheelEvent) => {
      event.preventDefault()
      wheelDeltaRef.current += event.deltaY
      if (wheelFrameRef.current !== null) return
      wheelFrameRef.current = requestAnimationFrame(() => {
        wheelFrameRef.current = null
        const delta = wheelDeltaRef.current
        wheelDeltaRef.current = 0
        const camera = cameraRef.current
        const nextCamera = { ...camera, zoom: Math.max(1.5, Math.min(7, camera.zoom - delta / 400)) }
        if (nextCamera.zoom === camera.zoom) return
        cameraRef.current = nextCamera
        setMapCenter(nextCamera)
      })
    }
    surface.addEventListener('wheel', zoom, { passive: false })
    return () => surface.removeEventListener('wheel', zoom)
  }, [fullscreen])

  // Keep the authoritative camera in sync and swap a transient pan transform for
  // freshly projected tiles before the browser paints the committed camera.
  useLayoutEffect(() => {
    cameraRef.current = mapCenter
    if (!resetPanTransformRef.current) return
    resetPanTransformRef.current = false
    const layer = panLayerRef.current
    if (!layer) return
    layer.style.removeProperty('transform')
    if (!dragRef.current) layer.style.removeProperty('will-change')
  }, [mapCenter])

  useEffect(() => {
    return () => {
      if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current)
      if (wheelFrameRef.current !== null) cancelAnimationFrame(wheelFrameRef.current)
    }
  }, [])

  const commitSurfacePan = (drag: SurfaceDrag, continueDragging: boolean) => {
    const deltaX = drag.x - drag.startX
    const deltaY = drag.y - drag.startY
    if (!deltaX && !deltaY) {
      if (!continueDragging) {
        dragRef.current = null
        const layer = panLayerRef.current
        layer?.style.removeProperty('transform')
        layer?.style.removeProperty('will-change')
      }
      return
    }

    const nextCamera = dragRasterCamera(drag.camera, drag.viewport, deltaX, deltaY)
    cameraRef.current = nextCamera
    resetPanTransformRef.current = true
    if (continueDragging) {
      drag.camera = nextCamera
      drag.startX = drag.x
      drag.startY = drag.y
    } else {
      dragRef.current = null
    }
    setMapCenter(nextCamera)
  }

  const renderSurfacePan = () => {
    panFrameRef.current = null
    const drag = dragRef.current
    const layer = panLayerRef.current
    if (!drag || !layer) return

    const deltaX = drag.x - drag.startX
    const deltaY = drag.y - drag.startY
    layer.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`

    // Desktop has a full viewport of tile overscan, so keep the entire gesture on
    // the compositor. Narrow screens retain periodic commits to cap tile memory.
    if (drag.viewport.width < 800) {
      const tileSize = (drag.viewport.width / 4) * 2 ** (drag.camera.zoom - 2)
      const reprojectDistance = Math.max(48, tileSize * 1.5)
      if (Math.abs(deltaX) >= reprojectDistance || Math.abs(deltaY) >= reprojectDistance) {
        commitSurfacePan(drag, true)
      }
    }
  }

  const startSurfacePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragRef.current || !mapViewport.width || !mapViewport.height) return
    event.preventDefault()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      camera: cameraRef.current,
      viewport: mapViewport,
    }
    if (panLayerRef.current) panLayerRef.current.style.willChange = 'transform'
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveSurfacePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.x = event.clientX
    drag.y = event.clientY
    if (panFrameRef.current === null) panFrameRef.current = requestAnimationFrame(renderSurfacePan)
  }

  const finishSurfacePan = (event: ReactPointerEvent<HTMLDivElement>, useEventPosition: boolean) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (useEventPosition) {
      drag.x = event.clientX
      drag.y = event.clientY
    }
    if (panFrameRef.current !== null) {
      cancelAnimationFrame(panFrameRef.current)
      panFrameRef.current = null
    }
    commitSurfacePan(drag, false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const toggleFullscreen = async () => {
    const canvas = mapCanvasRef.current
    if (!canvas) return
    setFullscreenError('')
    try {
      if (document.fullscreenElement === canvas) await document.exitFullscreen()
      else await canvas.requestFullscreen({ navigationUI: 'hide' })
    } catch {
      setFullscreenError(t('map.fullscreenError'))
    }
  }

  const filteredVessels = useMemo(
    () => vesselTelemetry.map((vessel) => ({ ...vessel, records: filterRecordsByDate(vessel.records, routeStart, routeEnd) })),
    [vesselTelemetry, routeEnd, routeStart],
  )

  const visiblePorts = useMemo(() => screenPorts(mapCenter, mapViewport), [mapCenter, mapViewport])

  const handlePortHover = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!visiblePorts.length) { setHoveredPort(null); return }
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    let best: ScreenPort | null = null
    let bestDistance = 16
    for (const port of visiblePorts) {
      const dx = port.x - x
      const dy = port.y - y
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance <= bestDistance) { bestDistance = distance; best = port }
    }
    setHoveredPort(best)
  }

  return <article className="map-workspace">
    <div className="panel-heading">
      <div><h2>{t('dashboard.mapTitle')}</h2></div>
      <label className="route-metric-select">{t('map.routeMetric')} <select value={routeMetric} onChange={(event) => onRouteMetricChange(event.target.value as RouteMetric)}>
        <option value="sog">{t('map.routeMetricSog')}</option>
        <option value="stw">{t('map.routeMetricStw')}</option>
        <option value="rpm">{t('map.routeMetricRpm')}</option>
        <option value="fuel_tpd">{t('map.routeMetricFuel')}</option>
      </select></label>
    </div>

    <div ref={mapCanvasRef} className="map-canvas">
      <div className="raster-world-background" aria-hidden="true" />
      <div ref={panLayerRef} className="map-pan-layer">
        <RasterBaseLayer center={mapCenter} viewport={mapViewport} />
        <PortOverlay ports={visiblePorts} radius={portRadius(mapCenter.zoom)} viewport={mapViewport} />
        <RouteLayer center={mapCenter} viewport={mapViewport} vessels={filteredVessels} focusedImo={focusedImo} selectedFrame={selectedFrame} replayTimestamp={replayTimestamp} colorVersion={colorVersion} routeMetric={routeMetric} />
      </div>
      <div
        ref={surfaceRef}
        className="map-pan-surface"
        aria-label={t('map.canvasLabel')}
        onPointerDown={startSurfacePan}
        onPointerMove={(event) => { moveSurfacePan(event); handlePortHover(event) }}
        onPointerUp={(event) => finishSurfacePan(event, true)}
        onPointerCancel={(event) => finishSurfacePan(event, false)}
        onLostPointerCapture={(event) => finishSurfacePan(event, false)}
        onPointerLeave={() => setHoveredPort(null)}
      />
      {hoveredPort ? <div className="port-tooltip" style={{ left: hoveredPort.x, top: hoveredPort.y }}>{hoveredPort.name}, {hoveredPort.country}</div> : null}

      {loading && !error ? <div className="map-overlay" role="status">{t('map.loading')}</div> : null}
      {error ? <div className="map-overlay map-error" role="alert"><p>{t('map.unavailable')}</p><button className="text-button" type="button" onClick={onRetry}>{t('errors.retry')}</button></div> : null}
      {fullscreenError ? <div className="map-fullscreen-error" role="alert">{fullscreenError}</div> : null}

      <MapControls
        onReset={() => setMapCenter({ ...initialCamera })}
        onZoomIn={() => setMapCenter((camera) => ({ ...camera, zoom: Math.min(7, camera.zoom + 1) }))}
        onZoomOut={() => setMapCenter((camera) => ({ ...camera, zoom: Math.max(1.5, camera.zoom - 1) }))}
        onFullscreen={() => void toggleFullscreen()}
        fullscreen={fullscreen}
        fullscreenAvailable={typeof document !== 'undefined' && document.fullscreenEnabled}
      />
        {replay ? <ReplayControls replay={replay} /> : null}
       <CameraReadout center={mapCenter} />
       <MapScale center={mapCenter} viewport={mapViewport} unit={scaleUnit} />
    </div>

    <RouteLegend vessels={filteredVessels} routeMetric={routeMetric} />
    <p className="panel-copy">{t('map.worldView')}</p>
  </article>
}
