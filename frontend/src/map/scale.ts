import { rasterTileZoom, type RasterCamera, type RasterViewport } from './rasterProjection'

export type ScaleUnit = 'km' | 'mi' | 'nm'

const metresPerUnit: Record<ScaleUnit, number> = { km: 1_000, mi: 1_609.344, nm: 1_852 }

export function mapMetresPerPixel(camera: RasterCamera, viewport: RasterViewport) {
  const tileCount = 2 ** rasterTileZoom(camera.zoom)
  const tileSize = (viewport.width / 4) * 2 ** (camera.zoom - 2)
  return Math.cos(camera.latitude * Math.PI / 180) * 40_075_016.686 / (tileCount * tileSize)
}

export function mapScale(camera: RasterCamera, viewport: RasterViewport, unit: ScaleUnit) {
  const metresPerPixel = mapMetresPerPixel(camera, viewport)
  const targetUnits = metresPerPixel * 120 / metresPerUnit[unit]
  const distance = Math.max(5, Math.round(targetUnits / 5) * 5)
  return { distance, width: Math.max(36, Math.min(160, distance * metresPerUnit[unit] / metresPerPixel)) }
}
