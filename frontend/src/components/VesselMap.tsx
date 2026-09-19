import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { type GeoJSONSource } from 'maplibre-gl'
import type { FeatureCollection, LineString } from 'geojson'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Trajectory } from '../api/client'
import { dragCamera } from '../map/panMath'
import 'maplibre-gl/dist/maplibre-gl.css'

type VesselMapProps = { trajectory?: Trajectory; loading: boolean; error: boolean; onRetry: () => void }
type MapCenter = { latitude: number; longitude: number; zoom: number }
type MapViewport = { width: number; height: number }
const sourceId = 'vessel-trajectory'
const layerId = 'vessel-trajectory-line'

// MapLibre documents ?worker&url as the Vite-safe way to bundle its module worker.
maplibregl.setWorkerUrl(workerUrl)

function trajectoryData(trajectory?: Trajectory): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: (trajectory?.segments ?? []).filter((segment) => segment.length > 1).map((segment) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: segment.map((point) => [point.longitude_deg, point.latitude_deg]) } })) }
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

// Render native OSM tiles near the camera so coastlines and islands gain detail as the user zooms in.
function RasterWorldBase({ center, viewport, verticalOverscroll }: { center: MapCenter; viewport: MapViewport; verticalOverscroll: number }) {
  if (!viewport.width || !viewport.height) return null
  const zoom = Math.max(2, Math.min(7, Math.floor(center.zoom)))
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
      tiles.push(<img className="raster-world-tile" key={`${zoom}-${x}-${y}`} src={`https://tile.openstreetmap.org/${zoom}/${positiveModulo(x, tileCount)}/${y}.png`} alt="" style={{ width: tileSize, height: tileSize, left: viewport.width / 2 + (x - centerX) * tileSize, top: viewport.height / 2 + (y - centerY) * tileSize + verticalOverscroll }} />)
    }
  }
  return <div className="raster-world-base" aria-hidden="true">{tiles}</div>
}

// This component follows the official MapLibre quickstart style and adds the vessel route after map load.
export function VesselMap({ trajectory, loading, error, onRetry }: VesselMapProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)
  const [mapKey, setMapKey] = useState(0)
  const [mapCenter, setMapCenter] = useState<MapCenter>({ latitude: 0, longitude: 0, zoom: 2 })
  // Render tiles immediately; ResizeObserver and MapLibre resize events refine this after mount.
  const [mapViewport, setMapViewport] = useState<MapViewport>({ width: 1024, height: 512 })
  const [verticalOverscroll, setVerticalOverscroll] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) setMapViewport({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({ container: containerRef.current, style: 'https://demotiles.maplibre.org/globe.json', center: [0, 0], zoom: 2, dragPan: false, scrollZoom: true, doubleClickZoom: true, keyboard: true, touchZoomRotate: true, cooperativeGestures: false, renderWorldCopies: true })
    mapRef.current = map
    // The demo style defaults to a globe; fleet operations use a flat Mercator map for predictable navigation.
    map.on('style.load', () => map.setProjection({ type: 'mercator' }))
    // Raise the gentle default wheel/trackpad rates for rapid operational map inspection.
    map.scrollZoom.setWheelZoomRate(1 / 140)
    map.scrollZoom.setZoomRate(1 / 55)
    map.on('load', () => {
      map.addSource(sourceId, { type: 'geojson', data: trajectoryData() })
      map.addLayer({ id: layerId, type: 'line', source: sourceId, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0878a9', 'line-width': 3.5, 'line-opacity': 0.9 } })
      if (map.getContainer().clientWidth && map.getContainer().clientHeight) setMapViewport({ width: map.getContainer().clientWidth, height: map.getContainer().clientHeight })
      setMapLoaded(true)
    })
    map.on('resize', () => {
      if (map.getContainer().clientWidth && map.getContainer().clientHeight) setMapViewport({ width: map.getContainer().clientWidth, height: map.getContainer().clientHeight })
    })
    map.on('error', () => setMapFailed(true))
    map.on('moveend', () => {
      const center = map.getCenter()
      setMapCenter({ latitude: center.lat, longitude: center.lng, zoom: map.getZoom() })
    })
    // Capture phase runs before MapLibre's canvas handlers, making drag pan reliable in the Vite canvas.
    const startPan = (event: globalThis.PointerEvent) => {
      if (event.button !== 0) return
      dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      containerRef.current?.setPointerCapture(event.pointerId)
    }
    const moveCamera = (x: number, y: number) => {
      const center = map.getCenter()
      const target = dragCamera({ latitude: center.lat, longitude: center.lng, zoom: map.getZoom() }, x, y)
      map.jumpTo({ center: [target.longitude, target.latitude] })
    }
    const pan = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      moveCamera(event.clientX - drag.x, event.clientY - drag.y)
      drag.x = event.clientX
      drag.y = event.clientY
    }
    const stopPan = (event: globalThis.PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    }
    const startMousePan = (event: MouseEvent) => {
      if (event.button !== 0) return
      if (dragRef.current) return
      const bounds = containerRef.current?.getBoundingClientRect()
      if (!bounds || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return
      dragRef.current = { pointerId: -1, x: event.clientX, y: event.clientY }
    }
    const mousePan = (event: MouseEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== -1) return
      moveCamera(event.clientX - drag.x, event.clientY - drag.y)
      drag.x = event.clientX
      drag.y = event.clientY
    }
    const stopMousePan = () => {
      if (dragRef.current?.pointerId === -1) dragRef.current = null
    }
    const container = containerRef.current
    container.addEventListener('pointerdown', startPan, true)
    container.addEventListener('pointermove', pan, true)
    container.addEventListener('pointerup', stopPan, true)
    container.addEventListener('pointercancel', stopPan, true)
    document.addEventListener('mousedown', startMousePan, true)
    window.addEventListener('mousemove', mousePan, true)
    window.addEventListener('mouseup', stopMousePan, true)
    return () => {
      container.removeEventListener('pointerdown', startPan, true)
      container.removeEventListener('pointermove', pan, true)
      container.removeEventListener('pointerup', stopPan, true)
      container.removeEventListener('pointercancel', stopPan, true)
      document.removeEventListener('mousedown', startMousePan, true)
      window.removeEventListener('mousemove', mousePan, true)
      window.removeEventListener('mouseup', stopMousePan, true)
      map.remove()
      mapRef.current = null
    }
  }, [mapKey])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    const source = map.getSource(sourceId) as GeoJSONSource | undefined
    source?.setData(trajectoryData(trajectory))
    const points = trajectory?.segments.flat() ?? []
    if (!points.length) return
    if (points.length === 1) { map.easeTo({ center: [points[0].longitude_deg, points[0].latitude_deg], zoom: 8 }); return }
    const bounds = points.reduce((result, point) => result.extend([point.longitude_deg, point.latitude_deg]), new maplibregl.LngLatBounds([points[0].longitude_deg, points[0].latitude_deg], [points[0].longitude_deg, points[0].latitude_deg]))
    map.fitBounds(bounds, { padding: 70, maxZoom: 11, duration: 600 })
  }, [mapLoaded, trajectory])

  const resetWorldView = () => {
    setVerticalOverscroll(0)
    mapRef.current?.easeTo({ center: [0, 0], zoom: 2, duration: 500 })
  }
  const panCamera = (x: number, y: number) => {
    const map = mapRef.current
    if (!map) return
    const center = map.getCenter()
    const target = dragCamera({ latitude: center.lat, longitude: center.lng, zoom: map.getZoom() }, x, y)
    // Mercator latitude remains valid for telemetry while the base can overscroll into a small blank band.
    setVerticalOverscroll((offset) => target.requestedLatitude === target.latitude ? 0 : Math.max(-72, Math.min(72, offset + y)))
    map.jumpTo({ center: [target.longitude, target.latitude] })
  }
  const startSurfacePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveSurfacePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    panCamera(event.clientX - drag.x, event.clientY - drag.y)
    drag.x = event.clientX
    drag.y = event.clientY
  }
  const stopSurfacePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }
  const retryMap = () => { setMapFailed(false); setMapLoaded(false); setMapKey((key) => key + 1); onRetry() }

  return <article className="map-workspace"><div className="panel-heading"><div><p className="eyebrow">01</p><h2>{t('dashboard.mapTitle')}</h2></div><span className="panel-status">MapLibre</span></div><div className="map-canvas"><RasterWorldBase center={mapCenter} viewport={mapViewport} verticalOverscroll={verticalOverscroll} /><div ref={containerRef} className="map-instance" aria-label={t('map.canvasLabel')} /><div className="map-pan-surface" onPointerDown={startSurfacePan} onPointerMove={moveSurfacePan} onPointerUp={stopSurfacePan} onPointerCancel={stopSurfacePan} />{!mapLoaded && !mapFailed ? <div className="map-overlay" role="status">{t('map.loading')}</div> : null}{mapFailed ? <div className="map-overlay map-error" role="alert"><p>{t('map.unavailable')}</p><button className="text-button" type="button" onClick={retryMap}>{t('errors.retry')}</button></div> : null}{error ? <div className="trajectory-notice" role="alert"><span>{t('map.trajectoryUnavailable')}</span><button className="text-button" type="button" onClick={onRetry}>{t('errors.retry')}</button></div> : null}<div className="map-actions"><button type="button" aria-label={t('map.reset')} title={t('map.reset')} onClick={resetWorldView}><RotateCcw aria-hidden="true" size={16} /></button><button type="button" aria-label={t('map.zoomIn')} title={t('map.zoomIn')} onClick={() => mapRef.current?.zoomIn()}><ZoomIn aria-hidden="true" size={16} /></button><button type="button" aria-label={t('map.zoomOut')} title={t('map.zoomOut')} onClick={() => mapRef.current?.zoomOut()}><ZoomOut aria-hidden="true" size={16} /></button></div><div className="map-navigation"><span>{t('map.navigationHint')}</span><span aria-live="polite">{t('map.position', { latitude: mapCenter.latitude.toFixed(2), longitude: mapCenter.longitude.toFixed(2), zoom: mapCenter.zoom.toFixed(2) })}</span></div>{trajectory ? <div className="map-legend"><span className="legend-line" />{t(`metrics.${trajectory.metric.key}`, { defaultValue: trajectory.metric.label })} <span>{trajectory.metric.unit}</span></div> : null}</div><p className="panel-note">{loading ? t('map.loadingTrajectory') : trajectory?.segments.length ? t('map.trajectoryLoaded') : t('map.worldView')}</p></article>
}
