import { memo, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TelemetryRecord } from '../api/client'
import { dragRasterCamera, mercatorY, projectRasterPoint, rasterTileZoom } from '../map/rasterProjection'
import { vesselColor } from '../vesselColors'

type MapCenter = { latitude: number; longitude: number; zoom: number }
type MapViewport = { width: number; height: number }
type VesselTelemetry = { imo: string; records: TelemetryRecord[] }
type VesselSilhouette = 'tanker' | 'container' | 'catamaran'
type SurfaceDrag = {
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  camera: MapCenter
  viewport: MapViewport
}

type ReplaySliderProps = {
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  step?: number
  label?: string
  onGoToTelemetry?: () => void
}

type VesselMapProps = {
  vesselTelemetry: VesselTelemetry[]
  focusedImo: string
  selectedFrame?: TelemetryRecord
  replayTimestamp?: string
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

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

// Shape assignment is derived solely from the immutable IMO, not the order in which
// vessels arrive. This keeps the visual identity stable through filtering and replay.
function vesselSilhouette(imo: string): VesselSilhouette {
  let hash = 0
  for (let index = 0; index < imo.length; index += 1) hash = (hash * 31 + imo.charCodeAt(index)) | 0
  return (['tanker', 'container', 'catamaran'] as const)[Math.abs(hash) % 3]
}

/** Compact top-down direction markers pointing north before their parent applies heading. */
function VesselSilhouetteMarker({ imo, color, focused }: { imo: string; color: string; focused: boolean }) {
  const silhouette = vesselSilhouette(imo)
  const common = { fill: color, stroke: '#fff', strokeWidth: focused ? 1.75 : 1.25, strokeLinejoin: 'round' as const }

  if (silhouette === 'container') {
    return <path d="M0 -10L8 8H-8Z" {...common} />
  }

  if (silhouette === 'catamaran') {
    return <path d="M0 -10L9 8H3L0 4L-3 8H-9Z" {...common} />
  }

  return <path d="M0 -10L7 7L0 10L-7 7Z" {...common} />
}

// Render native OSM tiles near the camera so coastlines and islands gain detail as the user zooms in.
const RasterWorldBase = memo(function RasterWorldBase({ center, viewport }: { center: MapCenter; viewport: MapViewport }) {
  if (!viewport.width || !viewport.height) return null

  const zoom = rasterTileZoom(center.zoom)
  const tileCount = 2 ** zoom
  const latitude = Math.max(-85, Math.min(85, center.latitude)) * Math.PI / 180
  const centerX = ((center.longitude + 180) / 360) * tileCount
  const centerY = (1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2 * tileCount
  const tileSize = (viewport.width / 4) * 2 ** (center.zoom - 2)
  const desktopOverscan = viewport.width >= 800 ? Math.ceil(viewport.width / tileSize) : 2
  const xRadius = Math.ceil(viewport.width / tileSize / 2) + desktopOverscan
  const yRadius = Math.ceil(viewport.height / tileSize / 2) + desktopOverscan
  const tiles = []

  for (let y = Math.floor(centerY) - yRadius; y <= Math.floor(centerY) + yRadius; y += 1) {
    if (y < 0 || y >= tileCount) continue
    for (let x = Math.floor(centerX) - xRadius; x <= Math.floor(centerX) + xRadius; x += 1) {
      tiles.push(
        <img
          className="raster-world-tile"
          key={`${zoom}-${x}-${y}`}
          src={`https://tile.openstreetmap.org/${zoom}/${positiveModulo(x, tileCount)}/${y}.png`}
          alt=""
          draggable={false}
          decoding="async"
          style={{
            width: tileSize,
            height: tileSize,
            left: viewport.width / 2 + (x - centerX) * tileSize,
            top: viewport.height / 2 + (y - centerY) * tileSize,
          }}
        />,
      )
    }
  }

  return <div className="raster-world-base" aria-hidden="true">{tiles}</div>
})

// Only recorded frames are shown: no interpolated route lines are drawn between observations.
const FrameOverlay = memo(function FrameOverlay({ center, viewport, vessels, focusedImo, selectedFrame, replayTimestamp }: { center: MapCenter; viewport: MapViewport; vessels: VesselTelemetry[]; focusedImo: string; selectedFrame?: TelemetryRecord; replayTimestamp?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const preparedVessels = useMemo(() => vessels.map(({ imo, records }) => ({
    imo,
    points: records.map((record) => ({
      x: (record.longitude_deg + 180) / 360,
      y: mercatorY(record.latitude_deg),
    })),
  })), [vessels])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !viewport.width || !viewport.height) return

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.round(viewport.width * pixelRatio)
    const height = Math.round(viewport.height * pixelRatio)
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, viewport.width, viewport.height)

    const zoom = rasterTileZoom(center.zoom)
    const tileCount = 2 ** zoom
    const tileSize = (viewport.width / 4) * 2 ** (center.zoom - 2)
    const centerX = (center.longitude + 180) / 360 * tileCount
    const centerY = mercatorY(center.latitude) * tileCount

    for (const vessel of preparedVessels) {
      const focused = vessel.imo === focusedImo
      const radius = focused ? 1.8 : 1.35
      context.beginPath()
      for (const point of vessel.points) {
        let worldX = point.x * tileCount
        if (worldX - centerX > tileCount / 2) worldX -= tileCount
        if (worldX - centerX < -tileCount / 2) worldX += tileCount
        const x = viewport.width / 2 + (worldX - centerX) * tileSize
        const y = viewport.height / 2 + (point.y * tileCount - centerY) * tileSize
        if (x < -radius || x > viewport.width + radius || y < -radius || y > viewport.height + radius) continue
        context.moveTo(x + radius, y)
        context.arc(x, y, radius, 0, Math.PI * 2)
      }
      context.globalAlpha = focused ? 0.9 : 0.72
      context.fillStyle = vesselColor(vessel.imo)
      context.fill()
    }
    context.globalAlpha = 1
  }, [center, focusedImo, preparedVessels, viewport])

  if (!viewport.width || !viewport.height) return null

  return <>
    <canvas ref={canvasRef} className="telemetry-points-canvas" aria-hidden="true" />
    <svg aria-label="Vessel positions" className="vessel-marker-overlay" viewBox={`0 0 ${viewport.width} ${viewport.height}`}>
      {vessels.map(({ imo, records }) => {
      const focused = imo === focusedImo
       const replayTime = replayTimestamp ? new Date(replayTimestamp).getTime() : NaN
       // Other vessels use their latest recorded observation at the shared replay time.
       const active = focused ? selectedFrame ?? records.at(-1) : (Number.isFinite(replayTime) ? records.filter((record) => new Date(record.timestamp).getTime() <= replayTime).at(-1) ?? records[0] : records.at(-1))
      const vessel = active && projectRasterPoint(center, viewport, active.latitude_deg, active.longitude_deg)
      // AIS heading/course uses 0 degrees at north; the unrotated SVG silhouettes point north.
      const heading = active?.heading_deg ?? active?.course_deg ?? 0
      const color = vesselColor(imo)
      const markerSize = focused ? 1.15 : 0.9
      const silhouette = vesselSilhouette(imo)
      return vessel ? <g key={imo} data-vessel-imo={imo} data-vessel-silhouette={silhouette} data-focused={focused || undefined} transform={`translate(${vessel.x} ${vessel.y}) rotate(${heading}) scale(${markerSize})`} aria-label={`${imo}${focused ? ', focused vessel' : ''}`}>
        <VesselSilhouetteMarker imo={imo} color={color} focused={focused} />
      </g> : null
    })}
    </svg>
  </>
})

function MapControls({ onReset, onZoomIn, onZoomOut, labels }: { onReset: () => void; onZoomIn: () => void; onZoomOut: () => void; labels: { reset: string; zoomIn: string; zoomOut: string } }) {
  return <div className="map-actions">
    <button type="button" aria-label={labels.reset} title={labels.reset} onClick={onReset}><RotateCcw aria-hidden="true" size={16} /></button>
    <button type="button" aria-label={labels.zoomIn} title={labels.zoomIn} onClick={onZoomIn}><ZoomIn aria-hidden="true" size={16} /></button>
    <button type="button" aria-label={labels.zoomOut} title={labels.zoomOut} onClick={onZoomOut}><ZoomOut aria-hidden="true" size={16} /></button>
  </div>
}

function CameraReadout({ center }: { center: MapCenter }) {
  return <div className="map-navigation">
    <span>Viewport center (debug)</span>
    <span aria-live="polite">Lat {center.latitude.toFixed(6)} | Lon {center.longitude.toFixed(6)} | Zoom {center.zoom.toFixed(2)}</span>
  </div>
}

function ReplaySlider({ replay }: { replay: ReplaySliderProps }) {
  return <label aria-label={replay.label ?? 'Replay position'} style={{ position: 'absolute', zIndex: 3, bottom: 70, left: 12, display: 'grid', gap: 4, width: 220, padding: '7px 10px', color: '#263a44', background: 'rgba(255, 255, 255, .93)', border: '1px solid #cbd6da', font: '10px/1.25 "Courier New", monospace' }}>
    <span>{replay.label ?? 'Replay'}</span>
    <input type="range" min={replay.min} max={replay.max} step={replay.step ?? 1} value={replay.value} onChange={(event) => replay.onChange(Number(event.target.value))} />
    {replay.onGoToTelemetry ? <button type="button" onClick={replay.onGoToTelemetry}>Go to telemetry</button> : null}
  </label>
}

function filterRecordsByDate(records: TelemetryRecord[] | undefined, routeStart: string, routeEnd: string) {
  const latestDate = records?.at(-1)?.timestamp.slice(0, 10) || ''
  const defaultStart = latestDate ? new Date(`${latestDate}T00:00:00Z`) : null
  if (defaultStart) defaultStart.setUTCDate(defaultStart.getUTCDate() - 29)

  const activeStart = routeStart || defaultStart?.toISOString().slice(0, 10) || ''
  const activeEnd = routeEnd || latestDate
  return (records ?? []).filter((record) => record.timestamp.slice(0, 10) >= activeStart && record.timestamp.slice(0, 10) <= activeEnd)
}

export function VesselMap({ vesselTelemetry, focusedImo, selectedFrame, replayTimestamp, routeStart, routeEnd, onRouteStartChange: _onRouteStartChange, onRouteEndChange: _onRouteEndChange, loading, error, onRetry, replay }: VesselMapProps) {
  const { t } = useTranslation()
  const mapCanvasRef = useRef<HTMLDivElement>(null)
  const panLayerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<SurfaceDrag | null>(null)
  const panFrameRef = useRef<number | null>(null)
  const wheelFrameRef = useRef<number | null>(null)
  const wheelDeltaRef = useRef(0)
  const resetPanTransformRef = useRef(false)
  const cameraRef = useRef<MapCenter>(initialCamera)
  // This controlled raster camera is authoritative for both DOM tiles and SVG overlays.
  const [mapCenter, setMapCenter] = useState<MapCenter>(initialCamera)
  const [mapViewport, setMapViewport] = useState<MapViewport>({ width: 0, height: 0 })

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

  const zoomSurface = (event: ReactWheelEvent<HTMLDivElement>) => {
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

  const filteredVessels = useMemo(
    () => vesselTelemetry.map((vessel) => ({ ...vessel, records: filterRecordsByDate(vessel.records, routeStart, routeEnd) })),
    [vesselTelemetry, routeEnd, routeStart],
  )

  return <article className="map-workspace">
    <div className="panel-heading">
      <div><p className="eyebrow">01</p><h2>{t('dashboard.mapTitle')}</h2></div>
      <span className="panel-status">OSM Raster</span>
    </div>

    <div ref={mapCanvasRef} className="map-canvas">
      <div className="raster-world-background" aria-hidden="true" />
      <div ref={panLayerRef} className="map-pan-layer">
        <RasterWorldBase center={mapCenter} viewport={mapViewport} />
       <FrameOverlay center={mapCenter} viewport={mapViewport} vessels={filteredVessels} focusedImo={focusedImo} selectedFrame={selectedFrame} replayTimestamp={replayTimestamp} />
      </div>
      <div
        className="map-pan-surface"
        aria-label={t('map.canvasLabel')}
        onPointerDown={startSurfacePan}
        onPointerMove={moveSurfacePan}
        onPointerUp={(event) => finishSurfacePan(event, true)}
        onPointerCancel={(event) => finishSurfacePan(event, false)}
        onLostPointerCapture={(event) => finishSurfacePan(event, false)}
        onWheel={zoomSurface}
      />

      {loading && !error ? <div className="map-overlay" role="status">{t('map.loading')}</div> : null}
      {error ? <div className="map-overlay map-error" role="alert"><p>{t('map.unavailable')}</p><button className="text-button" type="button" onClick={onRetry}>{t('errors.retry')}</button></div> : null}

      <MapControls
        labels={{ reset: t('map.reset'), zoomIn: t('map.zoomIn'), zoomOut: t('map.zoomOut') }}
        onReset={() => setMapCenter({ ...initialCamera })}
        onZoomIn={() => setMapCenter((camera) => ({ ...camera, zoom: Math.min(7, camera.zoom + 1) }))}
        onZoomOut={() => setMapCenter((camera) => ({ ...camera, zoom: Math.max(1.5, camera.zoom - 1) }))}
      />
      {replay ? <ReplaySlider replay={replay} /> : null}
      <CameraReadout center={mapCenter} />
    </div>

    <p className="panel-copy">World view. Select an imported vessel to plot its route.</p>
  </article>
}
