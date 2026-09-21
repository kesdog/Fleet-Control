import { describe, expect, it } from 'vitest'
import { mapMetresPerPixel, mapScale } from './scale'

const viewport = { width: 960, height: 480 }

describe('map scale', () => {
  it('uses the exact international conversion factors for km, mi, and nm', () => {
    const camera = { latitude: 0, longitude: 0, zoom: 3 }
    const km = mapScale(camera, viewport, 'km')
    const mi = mapScale(camera, viewport, 'mi')
    const nm = mapScale(camera, viewport, 'nm')
    expect(km.distance * 1_000 / km.width).toBeCloseTo(mapMetresPerPixel(camera, viewport), 8)
    expect(mi.distance * 1_609.344 / mi.width).toBeCloseTo(mapMetresPerPixel(camera, viewport), 8)
    expect(nm.distance * 1_852 / nm.width).toBeCloseTo(mapMetresPerPixel(camera, viewport), 8)
  })

  it('accounts for Web Mercator latitude and fractional zoom', () => {
    const equator = mapMetresPerPixel({ latitude: 0, longitude: 0, zoom: 3.4 }, viewport)
    const highLatitude = mapMetresPerPixel({ latitude: 60, longitude: 0, zoom: 3.4 }, viewport)
    const closer = mapMetresPerPixel({ latitude: 0, longitude: 0, zoom: 4.4 }, viewport)
    expect(highLatitude / equator).toBeCloseTo(0.5, 8)
    // The raster camera changes tile level at this boundary as well as its fractional scale.
    expect(closer / equator).toBeCloseTo(0.25, 8)
  })
})
