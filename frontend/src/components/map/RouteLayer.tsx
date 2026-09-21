import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import type { TelemetryRecord } from '../../api/client'
import { mercatorY, projectRasterPoint, rasterTileZoom } from '../../map/rasterProjection'
import { metricDomain, metricShade, routeMetricValue, type RouteMetric } from '../../map/routeShade'
import { vesselColor } from '../../vesselColors'
import type { MapCenter, MapViewport, VesselTelemetry } from './types'

type VesselSilhouette = 'tanker' | 'container' | 'catamaran'
function vesselSilhouette(imo: string): VesselSilhouette { let hash = 0; for (let index = 0; index < imo.length; index += 1) hash = (hash * 31 + imo.charCodeAt(index)) | 0; return (['tanker', 'container', 'catamaran'] as const)[Math.abs(hash) % 3] }
function VesselSilhouetteMarker({ imo, color, focused }: { imo: string; color: string; focused: boolean }) {
  const common = { fill: color, stroke: '#fff', strokeWidth: focused ? 1.75 : 1.25, strokeLinejoin: 'round' as const }
  if (vesselSilhouette(imo) === 'container') return <path d="M0 -10L8 8H-8Z" {...common} />
  if (vesselSilhouette(imo) === 'catamaran') return <path d="M0 -10L9 8H3L0 4L-3 8H-9Z" {...common} />
  return <path d="M0 -10L7 7L0 10L-7 7Z" {...common} />
}

type Props = { center: MapCenter; viewport: MapViewport; vessels: VesselTelemetry[]; focusedImo: string; selectedFrame?: TelemetryRecord; replayTimestamp?: string; colorVersion: number; routeMetric: RouteMetric }
export const RouteLayer = memo(function RouteLayer({ center, viewport, vessels, focusedImo, selectedFrame, replayTimestamp, colorVersion, routeMetric }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const prepared = useMemo(() => vessels.map(({ imo, records }) => ({ imo, points: records.map((record) => ({ x: (record.longitude_deg + 180) / 360, y: mercatorY(record.latitude_deg), value: routeMetricValue(record, routeMetric) })), domain: metricDomain(records.map((record) => routeMetricValue(record, routeMetric))) })), [vessels, routeMetric])
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !viewport.width || !viewport.height) return
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2); const width = Math.round(viewport.width * pixelRatio); const height = Math.round(viewport.height * pixelRatio)
    if (canvas.width !== width) canvas.width = width; if (canvas.height !== height) canvas.height = height
    const context = canvas.getContext('2d'); if (!context) return
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0); context.clearRect(0, 0, viewport.width, viewport.height)
    const tileCount = 2 ** rasterTileZoom(center.zoom); const tileSize = (viewport.width / 4) * 2 ** (center.zoom - 2); const centerX = (center.longitude + 180) / 360 * tileCount; const centerY = mercatorY(center.latitude) * tileCount; const stride = Math.max(1, Math.min(64, Math.round(2 ** (7 - center.zoom)))); const margin = 24
    const project = (point: { x: number; y: number }) => { let worldX = point.x * tileCount; if (worldX - centerX > tileCount / 2) worldX -= tileCount; if (worldX - centerX < -tileCount / 2) worldX += tileCount; return { x: viewport.width / 2 + (worldX - centerX) * tileSize, y: viewport.height / 2 + (point.y * tileCount - centerY) * tileSize } }
    context.lineCap = 'round'; context.lineJoin = 'round'
    for (const vessel of prepared) { context.lineWidth = vessel.imo === focusedImo ? 2 : 1.4; let previous: { x: number; y: number } | null = null; let previousNormX = 0
      for (let index = 0; index < vessel.points.length; index += stride) { const chunkEnd = Math.min(index + stride, vessel.points.length); let sum = 0; let count = 0; for (let j = index; j < chunkEnd; j += 1) { const value = vessel.points[j].value; if (value !== null) { sum += value; count += 1 } } const point = vessel.points[index]; const projected = project(point); const offScreen = projected.x < -margin || projected.x > viewport.width + margin || projected.y < -margin || projected.y > viewport.height + margin; const crossedDateline = previous !== null && Math.abs(point.x - previousNormX) >= .5; if (offScreen || crossedDateline) { previous = null; previousNormX = point.x; continue } const value = count ? sum / count : null; if (previous && value !== null) { context.strokeStyle = metricShade(vesselColor(vessel.imo), (value - vessel.domain[0]) / (vessel.domain[1] - vessel.domain[0])); context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(projected.x, projected.y); context.stroke() } previous = projected; previousNormX = point.x }
    }
  }, [center, colorVersion, focusedImo, prepared, viewport])
  if (!viewport.width || !viewport.height) return null
  const replayTime = replayTimestamp ? new Date(replayTimestamp).getTime() : NaN
  return <><canvas ref={canvasRef} className="telemetry-points-canvas" aria-hidden="true" /><svg aria-label="Vessel positions" className="vessel-marker-overlay" viewBox={`0 0 ${viewport.width} ${viewport.height}`}>{vessels.map(({ imo, records }) => { const focused = imo === focusedImo; const active = focused ? selectedFrame ?? records.at(-1) : (Number.isFinite(replayTime) ? records.filter((record) => new Date(record.timestamp).getTime() <= replayTime).at(-1) ?? records[0] : records.at(-1)); const point = active && projectRasterPoint(center, viewport, active.latitude_deg, active.longitude_deg); const heading = active?.heading_deg ?? active?.course_deg ?? 0; return point ? <g key={imo} data-vessel-imo={imo} data-vessel-silhouette={vesselSilhouette(imo)} data-focused={focused || undefined} transform={`translate(${point.x} ${point.y}) rotate(${heading}) scale(${focused ? 1.15 : .9})`} aria-label={`${imo}${focused ? ', focused vessel' : ''}`}><VesselSilhouetteMarker imo={imo} color={vesselColor(imo)} focused={focused} /></g> : null })}</svg></>
})
