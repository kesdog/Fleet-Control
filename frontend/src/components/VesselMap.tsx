import { type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { type GeoJSONSource } from 'maplibre-gl'
import type { FeatureCollection, LineString } from 'geojson'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import vesselUrl from '../assets/vessel.svg'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TelemetryRecord, Trajectory, TrajectoryPoint } from '../api/client'
import { dragRasterCamera, projectRasterPoint, rasterTileZoom } from '../map/rasterProjection'
import 'maplibre-gl/dist/maplibre-gl.css'

type VesselMapProps = { trajectory?: Trajectory; telemetry?: TelemetryRecord[]; selectedFrame?: TelemetryRecord; routeDate: string; onRouteDateChange: (date: string) => void; loading: boolean; error: boolean; onRetry: () => void }
type MapCenter = { latitude: number; longitude: number; zoom: number }
type MapViewport = { width: number; height: number }
type HoveredPoint = { point: TrajectoryPoint; x: number; y: number }
const sourceId = 'vessel-trajectory'
const layerId = 'vessel-trajectory-line'

maplibregl.setWorkerUrl(workerUrl)

function trajectoryData(trajectory?: Trajectory): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: (trajectory?.segments ?? []).filter((segment) => segment.length > 1).map((segment) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: segment.map((point) => [point.longitude_deg, point.latitude_deg]) } })) }
}

function positiveModulo(value: number, divisor: number) { return ((value % divisor) + divisor) % divisor }

// Render native OSM tiles near the camera so coastlines and islands gain detail as the user zooms in.
function RasterWorldBase({ center, viewport }: { center: MapCenter; viewport: MapViewport }) {
  if (!viewport.width || !viewport.height) return null
  const zoom = rasterTileZoom(center.zoom)
  const tileCount = 2 ** zoom
  const latitude = Math.max(-85, Math.min(85, center.latitude)) * Math.PI / 180
  const centerX = ((center.longitude + 180) / 360) * tileCount
  const centerY = (1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2 * tileCount
  const tileSize = (viewport.width / 4) * 2 ** (center.zoom - 2)
  const xRadius = Math.ceil(viewport.width / tileSize / 2) + 2
  const yRadius = Math.ceil(viewport.height / tileSize / 2) + 2
  const tiles = []
  for (let y = Math.floor(centerY) - yRadius; y <= Math.floor(centerY) + yRadius; y += 1) {
    if (y < 0 || y >= tileCount) continue
    for (let x = Math.floor(centerX) - xRadius; x <= Math.floor(centerX) + xRadius; x += 1) {
      tiles.push(<img className="raster-world-tile" key={`${zoom}-${x}-${y}`} src={`https://tile.openstreetmap.org/${zoom}/${positiveModulo(x, tileCount)}/${y}.png`} alt="" style={{ width: tileSize, height: tileSize, left: viewport.width / 2 + (x - centerX) * tileSize, top: viewport.height / 2 + (y - centerY) * tileSize }} />)
    }
  }
  return <div className="raster-world-base" aria-hidden="true">{tiles}</div>
}

function nauticalMiles(from: TelemetryRecord, to: TelemetryRecord) {
  const latitude = (to.latitude_deg - from.latitude_deg) * Math.PI / 180
  const longitude = ((to.longitude_deg - from.longitude_deg + 540) % 360 - 180) * Math.PI / 180
  const a = Math.sin(latitude / 2) ** 2 + Math.cos(from.latitude_deg * Math.PI / 180) * Math.cos(to.latitude_deg * Math.PI / 180) * Math.sin(longitude / 2) ** 2
  return 3440.1 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Split only genuine telemetry discontinuities; routing around land requires real coastline geometry.
function frameSegments(records: TelemetryRecord[]) {
  const segments: TelemetryRecord[][] = []
  let segment: TelemetryRecord[] = []
  for (const record of records) {
    const previous = segment.at(-1)
    const elapsedHours = previous ? (new Date(record.timestamp).getTime() - new Date(previous.timestamp).getTime()) / 3_600_000 : 0
    const speed = previous && elapsedHours > 0 ? nauticalMiles(previous, record) / elapsedHours : 0
    if (previous && (!Number.isFinite(speed) || speed > 45 || Math.abs(record.longitude_deg - previous.longitude_deg) > 180)) { if (segment.length > 1) segments.push(segment); segment = [] }
    segment.push(record)
  }
  if (segment.length > 1) segments.push(segment)
  return segments
}

function RouteOverlay({ center, viewport, records }: { center: MapCenter; viewport: MapViewport; records: TelemetryRecord[] }) {
  if (!viewport.width || !viewport.height) return null
  const point = (record: TelemetryRecord) => projectRasterPoint(center, viewport, record.latitude_deg, record.longitude_deg)
  const segments = frameSegments(records)
  return <svg className="route-overlay" style={{ position: 'absolute', inset: 0, zIndex: 5, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-label="Selected-date vessel trajectory"><g>{segments.map((segment, index) => <polyline key={index} points={segment.map((record) => { const projected = point(record); return `${projected.x},${projected.y}` }).join(' ')} fill="none" stroke="#e00000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}</g></svg>
}

export const calibrationPoints = [[-33.87, 151.21], [51.5, -0.12], [40.71, -74.01], [37.77, -122.42], [25.76, -80.19], [47.61, -122.33], [34.05, -118.24], [29.76, -95.37], [42.36, -71.06], [48.86, 2.35], [41.39, 2.17], [38.72, -9.14], [40.42, -3.7], [59.93, 30.33], [55.75, 37.62], [35.68, 139.69], [31.23, 121.47], [22.32, 114.17], [1.35, 103.82], [13.75, 100.5], [19.43, -99.13], [-23.55, -46.63], [-34.6, -58.38], [-33.45, -70.67], [-12.05, -77.04], [6.52, 3.38], [-33.92, 18.42], [-1.29, 36.82], [25.2, 55.27], [41.01, 28.98], [30.04, 31.24], [32.08, 34.78]] as const
export function CalibrationOverlay({ center, viewport }: { center: MapCenter; viewport: MapViewport }) {
  if (!viewport.width || !viewport.height) return null
  const radius = Math.min(10, 4 * 2 ** ((center.zoom - 1.5) * .35))
  return <svg aria-label="32 coordinate calibration points" style={{ position: 'absolute', inset: 0, zIndex: 4, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox={`0 0 ${viewport.width} ${viewport.height}`}>{calibrationPoints.map(([latitude, longitude], index) => { const point = projectRasterPoint(center, viewport, latitude, longitude); return <circle key={index} cx={point.x} cy={point.y} r={radius} fill="#ff00a8" stroke="#fff" strokeWidth="2" /> })}</svg>
}

// Frame points are deliberately rendered before route interpolation is re-enabled.
function FrameOverlay({ center, viewport, records, selectedFrame }: { center: MapCenter; viewport: MapViewport; records: TelemetryRecord[]; selectedFrame?: TelemetryRecord }) {
  if (!viewport.width || !viewport.height) return null
  const active = records.find((record) => record.timestamp === selectedFrame?.timestamp) ?? records.at(-1)
  const vessel = active && projectRasterPoint(center, viewport, active.latitude_deg, active.longitude_deg)
  const heading = active?.heading_deg ?? active?.course_deg ?? 0
  return <svg aria-label="Telemetry frame points" style={{ position: 'absolute', inset: 0, zIndex: 6, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox={`0 0 ${viewport.width} ${viewport.height}`}>{records.map((record) => { const point = projectRasterPoint(center, viewport, record.latitude_deg, record.longitude_deg); return <circle key={record.timestamp} cx={point.x} cy={point.y} r="1.3" fill="#073b4c" /> })}{vessel ? <image href={vesselUrl} x="-24" y="-24" width="48" height="48" transform={`translate(${vessel.x} ${vessel.y}) rotate(${heading})`} /> : null}</svg>
}

export function VesselMap({ trajectory, telemetry, selectedFrame, routeDate, onRouteDateChange, onRetry }: VesselMapProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)
  const [mapKey, setMapKey] = useState(0)
  const [mapCenter, setMapCenter] = useState<MapCenter>({ latitude: 0, longitude: 0, zoom: 1.5 })
  const [mapViewport, setMapViewport] = useState<MapViewport>({ width: 0, height: 0 })
  const [, setHoveredPoint] = useState<HoveredPoint | null>(null)

  useEffect(() => {
    const container = containerRef.current?.parentElement
    if (!container) return
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width && entry.contentRect.height) setMapViewport({ width: entry.contentRect.width, height: entry.contentRect.height }) })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return
    const map = new maplibregl.Map({ container, style: 'https://demotiles.maplibre.org/globe.json', center: [0, 0], zoom: 1.5, minZoom: 1.5, dragPan: false, scrollZoom: true, doubleClickZoom: true, keyboard: true, touchZoomRotate: true, cooperativeGestures: false, renderWorldCopies: true })
    // MapLibre remains the interaction shell; the DOM OSM grid is the single visible cartographic surface.
    map.getCanvas().style.opacity = '0'
    mapRef.current = map
    map.on('style.load', () => map.setProjection({ type: 'mercator' }))
    map.scrollZoom.setWheelZoomRate(1 / 140)
    map.scrollZoom.setZoomRate(1 / 55)
    map.on('load', () => {
      map.addSource(sourceId, { type: 'geojson', data: trajectoryData() })
      map.addLayer({ id: layerId, type: 'line', source: sourceId, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0878a9', 'line-width': 3.5, 'line-opacity': 0.9 } })
      if (map.getContainer().clientWidth && map.getContainer().clientHeight) setMapViewport({ width: map.getContainer().clientWidth, height: map.getContainer().clientHeight })
      setMapLoaded(true)
    })
    map.on('resize', () => { if (map.getContainer().clientWidth && map.getContainer().clientHeight) setMapViewport({ width: map.getContainer().clientWidth, height: map.getContainer().clientHeight }) })
    map.on('error', () => setMapFailed(true))
    return () => { map.remove(); mapRef.current = null }
  }, [mapKey])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    const source = map.getSource(sourceId) as GeoJSONSource | undefined
    source?.setData(trajectoryData(trajectory))
  }, [mapLoaded, telemetry, trajectory])

  const panCamera = (x: number, y: number) => {
    setMapCenter((camera) => {
      return dragRasterCamera(camera, mapViewport, x, y)
    })
  }
  const updateHover = (event: ReactPointerEvent<HTMLDivElement>) => {
    const map = mapRef.current
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!map || !trajectory) return
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    const nearest = trajectory.segments.flat().map((point) => ({ point, pixel: map.project([point.longitude_deg, point.latitude_deg]) })).reduce<{ point: TrajectoryPoint; distance: number } | null>((result, candidate) => {
      const distance = Math.hypot(candidate.pixel.x - x, candidate.pixel.y - y)
      return !result || distance < result.distance ? { point: candidate.point, distance } : result
    }, null)
    setHoveredPoint(nearest && nearest.distance < 12 ? { point: nearest.point, x, y } : null)
  }
  const startSurfacePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveSurfacePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) { updateHover(event); return }
    setHoveredPoint(null)
    panCamera(event.clientX - drag.x, event.clientY - drag.y)
    drag.x = event.clientX
    drag.y = event.clientY
  }
  const stopSurfacePan = (event: ReactPointerEvent<HTMLDivElement>) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null }
  const zoomSurface = (event: ReactWheelEvent<HTMLDivElement>) => {
    setMapCenter((camera) => ({ ...camera, zoom: Math.max(1.5, Math.min(7, camera.zoom - event.deltaY / 400)) }))
  }
  const retryMap = () => { setMapFailed(false); setMapLoaded(false); setMapKey((key) => key + 1); onRetry() }

  const activeRouteDate = routeDate || telemetry?.at(-1)?.timestamp.slice(0, 10) || ''
  const filteredRecords = (telemetry ?? []).filter((record) => record.timestamp.startsWith(activeRouteDate))
  return <article className="map-workspace"><div className="panel-heading"><div><p className="eyebrow">01</p><h2>{t('dashboard.mapTitle')}</h2></div><label className="panel-status">Route date <input type="date" value={activeRouteDate} onChange={(event) => onRouteDateChange(event.target.value)} /></label></div><div className="map-canvas"><RasterWorldBase center={mapCenter} viewport={mapViewport} /><div ref={containerRef} className="map-instance" aria-label={t('map.canvasLabel')} />{/* <CalibrationOverlay center={mapCenter} viewport={mapViewport} /> */}<RouteOverlay center={mapCenter} viewport={mapViewport} records={filteredRecords} /><FrameOverlay center={mapCenter} viewport={mapViewport} records={filteredRecords} selectedFrame={selectedFrame} /><div className="map-pan-surface" onPointerDown={startSurfacePan} onPointerMove={moveSurfacePan} onPointerUp={stopSurfacePan} onPointerCancel={stopSurfacePan} onPointerLeave={() => setHoveredPoint(null)} onWheel={zoomSurface} />{!mapLoaded && !mapFailed ? <div className="map-overlay" role="status">{t('map.loading')}</div> : null}{mapFailed ? <div className="map-overlay map-error" role="alert"><p>{t('map.unavailable')}</p><button className="text-button" type="button" onClick={retryMap}>{t('errors.retry')}</button></div> : null}<div className="map-actions"><button type="button" aria-label={t('map.reset')} title={t('map.reset')} onClick={() => setMapCenter({ latitude: 0, longitude: 0, zoom: 1.5 })}><RotateCcw aria-hidden="true" size={16} /></button><button type="button" aria-label={t('map.zoomIn')} title={t('map.zoomIn')} onClick={() => setMapCenter((camera) => ({ ...camera, zoom: Math.min(7, camera.zoom + 1) }))}><ZoomIn aria-hidden="true" size={16} /></button><button type="button" aria-label={t('map.zoomOut')} title={t('map.zoomOut')} onClick={() => setMapCenter((camera) => ({ ...camera, zoom: Math.max(1.5, camera.zoom - 1) }))}><ZoomOut aria-hidden="true" size={16} /></button></div><div className="map-navigation"><span>Viewport center (debug)</span><span aria-live="polite">Lat {mapCenter.latitude.toFixed(6)} | Lon {mapCenter.longitude.toFixed(6)} | Zoom {mapCenter.zoom.toFixed(2)}</span></div></div><p className="panel-note">{t('map.worldView')}</p></article>
}
