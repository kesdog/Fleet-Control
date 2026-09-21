import { describe, expect, it } from 'vitest'
import { PORT_MIN_ZOOM, portRadius, screenPorts } from './ports'

const viewport = { width: 1000, height: 600 }

describe('portRadius', () => {
  it('returns the minimum radius at the visibility threshold', () => {
    expect(portRadius(PORT_MIN_ZOOM)).toBeCloseTo(2.5)
  })

  it('grows with zoom and clamps at the maximum', () => {
    expect(portRadius(7)).toBeCloseTo(7.9)
    expect(portRadius(7)).toBeGreaterThan(portRadius(4))
  })
})

describe('screenPorts', () => {
  it('returns nothing below the visibility threshold', () => {
    expect(screenPorts({ latitude: 36.77, longitude: 3.07, zoom: PORT_MIN_ZOOM - 0.1 }, viewport)).toEqual([])
  })

  it('projects a port at the camera center to the viewport center', () => {
    const ports = screenPorts({ latitude: 36.77, longitude: 3.07, zoom: 5 }, viewport)
    const algiers = ports.find((port) => port.name === 'Algiers')
    expect(algiers).toBeDefined()
    expect(algiers?.x).toBeCloseTo(500)
    expect(algiers?.y).toBeCloseTo(300)
  })

  it('excludes ports far outside the visible viewport', () => {
    const ports = screenPorts({ latitude: 36.77, longitude: 3.07, zoom: 6 }, viewport)
    expect(ports.some((port) => port.name === 'Tokyo')).toBe(false)
  })
})
