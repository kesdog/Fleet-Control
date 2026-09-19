import { describe, expect, it } from 'vitest'
import { dragCamera } from './panMath'

describe('dragCamera', () => {
  it('moves the visible map upward when dragged upward', () => {
    expect(dragCamera({ latitude: 0, longitude: 0, zoom: 2 }, 0, -100).latitude).toBeLessThan(0)
  })

  it('keeps latitude inside Mercator limits while allowing longitude to continue', () => {
    const result = dragCamera({ latitude: 84, longitude: 170, zoom: 2 }, -1000, 1000)
    expect(result.latitude).toBe(85)
    expect(result.longitude).toBeGreaterThan(170)
  })

  it('retains controlled high-zoom drag movement', () => {
    const lowZoom = Math.abs(dragCamera({ latitude: 0, longitude: 0, zoom: 2 }, 100, 0).longitude)
    const closeZoom = Math.abs(dragCamera({ latitude: 0, longitude: 0, zoom: 5 }, 100, 0).longitude)
    expect(closeZoom).toBeGreaterThan(10)
    expect(closeZoom).toBeLessThan(lowZoom)
  })
})
