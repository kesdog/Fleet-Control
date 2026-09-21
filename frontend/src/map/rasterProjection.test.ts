import { describe, expect, it } from 'vitest'
import { dragRasterCamera, osmTileCoordinate, projectRasterPoint, unprojectRasterPoint } from './rasterProjection'

const viewport = { width: 960, height: 480 }
const point = { latitude: 36.3, longitude: -3.37 }

describe('raster projection', () => {
  it('matches standard OSM Web Mercator tile coordinates for Greenwich and Sydney', () => {
    expect(osmTileCoordinate(0, 0, 2)).toEqual({ x: 2, y: 2 })
    const sydney = osmTileCoordinate(-33.8688, 151.2093, 3)
    expect(sydney.x).toBeCloseTo(7.36, 2)
    expect(sydney.y).toBeCloseTo(4.8, 1)
  })
  const coastalPoints = [[-33.87, 151.21], [51.5, -0.12], [40.71, -74.01], [37.77, -122.42], [25.76, -80.19], [47.61, -122.33], [34.05, -118.24], [29.76, -95.37], [42.36, -71.06], [48.86, 2.35], [41.39, 2.17], [38.72, -9.14], [40.42, -3.7], [59.93, 30.33], [55.75, 37.62], [35.68, 139.69], [31.23, 121.47], [22.32, 114.17], [1.35, 103.82], [13.75, 100.5], [19.43, -99.13], [-23.55, -46.63], [-34.6, -58.38], [-33.45, -70.67], [-12.05, -77.04], [6.52, 3.38], [-33.92, 18.42], [-1.29, 36.82], [25.2, 55.27], [41.01, 28.98], [30.04, 31.24], [32.08, 34.78]]

  it('round-trips 32 coastal calibration coordinates through drag and zoom cameras', () => {
    for (const camera of [{ latitude: 0, longitude: 0, zoom: 1.5 }, { latitude: 16, longitude: -57, zoom: 2.1 }, { latitude: -20, longitude: 140, zoom: 4.3 }]) {
      for (const [latitude, longitude] of coastalPoints) {
        const projected = projectRasterPoint(camera, viewport, latitude, longitude)
        const restored = unprojectRasterPoint(camera, viewport, projected.x, projected.y)
        expect(restored.latitude).toBeCloseTo(latitude, 8)
        expect(restored.longitude).toBeCloseTo(longitude, 8)
      }
    }
  })
  it('uses the same tile grid on both sides of an integer zoom boundary', () => {
    const before = projectRasterPoint({ latitude: 8, longitude: 0, zoom: 2.99 }, viewport, point.latitude, point.longitude)
    const after = projectRasterPoint({ latitude: 8, longitude: 0, zoom: 3.01 }, viewport, point.latitude, point.longitude)
    expect(Math.abs(after.x - viewport.width / 2)).toBeGreaterThan(Math.abs(before.x - viewport.width / 2))
    expect(Math.abs(after.y - viewport.height / 2)).toBeGreaterThan(Math.abs(before.y - viewport.height / 2))
  })

  it('moves every point by the same camera drag transform', () => {
    const first = projectRasterPoint({ latitude: 8, longitude: 0, zoom: 3.4 }, viewport, point.latitude, point.longitude)
    const second = projectRasterPoint({ latitude: 8, longitude: 10, zoom: 3.4 }, viewport, point.latitude, point.longitude)
    const otherFirst = projectRasterPoint({ latitude: 8, longitude: 0, zoom: 3.4 }, viewport, 32, -20)
    const otherSecond = projectRasterPoint({ latitude: 8, longitude: 10, zoom: 3.4 }, viewport, 32, -20)
    expect(second.x - first.x).toBeCloseTo(otherSecond.x - otherFirst.x)
    expect(second.y - first.y).toBeCloseTo(otherSecond.y - otherFirst.y)
  })

  it('moves calibration points by exactly the inverse pointer delta', () => {
    const camera = { latitude: 8, longitude: 0, zoom: 3.4 }
    const moved = dragRasterCamera(camera, viewport, 180, -75)
    for (const [latitude, longitude] of coastalPoints) {
      const before = projectRasterPoint(camera, viewport, latitude, longitude)
      const after = projectRasterPoint(moved, viewport, latitude, longitude)
      expect(after.x - before.x).toBeCloseTo(180, 7)
      expect(after.y - before.y).toBeCloseTo(-75, 7)
    }
  })

  it('preserves the final camera when pointer movement is committed as one total drag', () => {
    const camera = { latitude: 18, longitude: 172, zoom: 2.7 }
    const movements = [[75, -24], [120, 45], [-18, 91]] as const
    const incremental = movements.reduce(
      (current, [deltaX, deltaY]) => dragRasterCamera(current, viewport, deltaX, deltaY),
      camera,
    )
    const total = movements.reduce(
      (result, [deltaX, deltaY]) => ({ x: result.x + deltaX, y: result.y + deltaY }),
      { x: 0, y: 0 },
    )
    const committed = dragRasterCamera(camera, viewport, total.x, total.y)

    expect(committed.latitude).toBeCloseTo(incremental.latitude, 10)
    expect(committed.longitude).toBeCloseTo(incremental.longitude, 10)
    expect(committed.zoom).toBe(incremental.zoom)
  })
})
