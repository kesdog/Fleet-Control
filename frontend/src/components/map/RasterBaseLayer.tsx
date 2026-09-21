import { memo } from 'react'
import { rasterTileZoom } from '../../map/rasterProjection'
import type { MapCenter, MapViewport } from './types'

function positiveModulo(value: number, divisor: number) { return ((value % divisor) + divisor) % divisor }

export const RasterBaseLayer = memo(function RasterBaseLayer({ center, viewport }: { center: MapCenter; viewport: MapViewport }) {
  if (!viewport.width || !viewport.height) return null
  const zoom = rasterTileZoom(center.zoom)
  const tileCount = 2 ** zoom
  const latitude = Math.max(-85, Math.min(85, center.latitude)) * Math.PI / 180
  const centerX = ((center.longitude + 180) / 360) * tileCount
  const centerY = (1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2 * tileCount
  const tileSize = (viewport.width / 4) * 2 ** (center.zoom - 2)
  const detail = Math.max(0, Math.min(2, Math.round(Math.log2(tileSize / 256))))
  const sub = 2 ** detail
  const fetchZoom = zoom + detail
  const fetchTileCount = 2 ** fetchZoom
  const subTileSize = tileSize / sub
  const desktopOverscan = viewport.width >= 800 ? Math.ceil(viewport.width / tileSize) : 2
  const xRadius = Math.ceil(viewport.width / tileSize / 2) + desktopOverscan
  const yRadius = Math.ceil(viewport.height / tileSize / 2) + desktopOverscan
  const tiles = []
  for (let y = Math.floor(centerY) - yRadius; y <= Math.floor(centerY) + yRadius; y += 1) {
    if (y < 0 || y >= tileCount) continue
    for (let x = Math.floor(centerX) - xRadius; x <= Math.floor(centerX) + xRadius; x += 1) {
      const cellX = positiveModulo(x, tileCount)
      const left = viewport.width / 2 + (x - centerX) * tileSize
      const top = viewport.height / 2 + (y - centerY) * tileSize
      for (let sy = 0; sy < sub; sy += 1) {
        const fy = y * sub + sy
        if (fy < 0 || fy >= fetchTileCount) continue
        for (let sx = 0; sx < sub; sx += 1) {
          const fx = cellX * sub + sx
          tiles.push(<img className="raster-world-tile" key={`${fetchZoom}-${x}-${y}-${sx}-${sy}`} src={`https://tile.openstreetmap.org/${fetchZoom}/${positiveModulo(fx, fetchTileCount)}/${fy}.png`} alt="" draggable={false} decoding="async" style={{ width: subTileSize, height: subTileSize, left: left + sx * subTileSize, top: top + sy * subTileSize }} />)
        }
      }
    }
  }
  return <div className="raster-world-base" aria-hidden="true">{tiles}</div>
})
