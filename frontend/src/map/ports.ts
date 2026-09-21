import { projectRasterPoint, type RasterCamera, type RasterViewport } from './rasterProjection'
import ports from '../data/ports.json'

export type Port = { name: string; country: string; longitude: number; latitude: number }
export type ScreenPort = { name: string; country: string; x: number; y: number }

export const PORT_MIN_ZOOM = 4

export function portRadius(zoom: number) {
  return Math.max(2.5, Math.min(8, 2.5 + (zoom - PORT_MIN_ZOOM) * 1.8))
}

export function screenPorts(center: RasterCamera, viewport: RasterViewport): ScreenPort[] {
  if (!viewport.width || !viewport.height || center.zoom < PORT_MIN_ZOOM) return []
  const margin = portRadius(center.zoom) + 6
  const result: ScreenPort[] = []
  for (const port of ports as Port[]) {
    const point = projectRasterPoint(center, viewport, port.latitude, port.longitude)
    if (point.x < -margin || point.x > viewport.width + margin || point.y < -margin || point.y > viewport.height + margin) continue
    result.push({ name: port.name, country: port.country, x: point.x, y: point.y })
  }
  return result
}
