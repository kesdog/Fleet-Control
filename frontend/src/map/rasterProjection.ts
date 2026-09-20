export type RasterCamera = { latitude: number; longitude: number; zoom: number }
export type RasterViewport = { width: number; height: number }

export function rasterTileZoom(zoom: number) { return Math.max(2, Math.min(7, Math.floor(zoom))) }
export function mercatorY(latitude: number) { return (1 - Math.asinh(Math.tan(Math.max(-85, Math.min(85, latitude)) * Math.PI / 180)) / Math.PI) / 2 }

export function osmTileCoordinate(latitude: number, longitude: number, zoom: number) {
  const scale = 2 ** zoom
  return { x: (longitude + 180) / 360 * scale, y: mercatorY(latitude) * scale }
}

// Keep SVG telemetry overlays on the identical fractional tile grid as the DOM OSM base.
export function projectRasterPoint(camera: RasterCamera, viewport: RasterViewport, latitude: number, longitude: number) {
  const tileZoom = rasterTileZoom(camera.zoom)
  const tileSize = (viewport.width / 4) * 2 ** (camera.zoom - 2)
  const tileCount = 2 ** tileZoom
  const centerX = ((camera.longitude + 180) / 360) * tileCount
  const centerY = mercatorY(camera.latitude) * tileCount
  let x = ((longitude + 180) / 360) * tileCount
  if (x - centerX > tileCount / 2) x -= tileCount
  if (x - centerX < -tileCount / 2) x += tileCount
  return { x: viewport.width / 2 + (x - centerX) * tileSize, y: viewport.height / 2 + (mercatorY(latitude) * tileCount - centerY) * tileSize }
}

export function unprojectRasterPoint(camera: RasterCamera, viewport: RasterViewport, x: number, y: number) {
  const tileZoom = rasterTileZoom(camera.zoom)
  const tileSize = (viewport.width / 4) * 2 ** (camera.zoom - 2)
  const tileCount = 2 ** tileZoom
  const centerX = ((camera.longitude + 180) / 360) * tileCount
  const centerY = mercatorY(camera.latitude) * tileCount
  const worldX = centerX + (x - viewport.width / 2) / tileSize
  const worldY = centerY + (y - viewport.height / 2) / tileSize
  const rawLongitude = worldX / tileCount * 360 - 180
  const longitude = ((rawLongitude + 540) % 360) - 180
  const mercator = worldY / tileCount
  return { latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * mercator))) * 180 / Math.PI, longitude }
}

export function dragRasterCamera(camera: RasterCamera, viewport: RasterViewport, deltaX: number, deltaY: number): RasterCamera {
  const tileZoom = rasterTileZoom(camera.zoom)
  const tileSize = (viewport.width / 4) * 2 ** (camera.zoom - 2)
  const tileCount = 2 ** tileZoom
  const centerX = ((camera.longitude + 180) / 360) * tileCount - deltaX / tileSize
  const centerY = mercatorY(camera.latitude) * tileCount - deltaY / tileSize
  const rawLongitude = centerX / tileCount * 360 - 180
  const longitude = ((rawLongitude + 540) % 360) - 180
  const normalizedY = Math.max(0.001, Math.min(0.999, centerY / tileCount))
  return { latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * normalizedY))) * 180 / Math.PI, longitude, zoom: camera.zoom }
}
