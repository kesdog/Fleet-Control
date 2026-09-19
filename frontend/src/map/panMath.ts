export type MapCamera = { latitude: number; longitude: number; zoom: number }

const mercatorLatitudeLimit = 85

// Convert a drag delta into a valid Mercator camera target shared by all map pointer handlers.
export function dragCamera(camera: MapCamera, deltaX: number, deltaY: number) {
  const panGain = 1.65 * Math.max(1, 2 ** ((camera.zoom - 2) * 0.85))
  const pixelsPerWorld = (512 * 2 ** camera.zoom) / panGain
  const requestedLatitude = camera.latitude + (deltaY * 180) / pixelsPerWorld
  return {
    longitude: camera.longitude - (deltaX * 360) / pixelsPerWorld,
    latitude: Math.max(-mercatorLatitudeLimit, Math.min(mercatorLatitudeLimit, requestedLatitude)),
    requestedLatitude,
  }
}
