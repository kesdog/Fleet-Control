import { describe, expect, it } from 'vitest'
import { boundedRange } from './useTelemetryQueries'

describe('boundedRange', () => {
  const start = '2024-01-01T04:00:00.000'
  const end = '2024-01-31T18:00:00.000'

  it('clamps calendar boundaries to the selected vessel telemetry range', () => {
    expect(boundedRange('2023-12-20', '2024-02-02', start, end)).toEqual({ start, end, valid: true })
  })

  it('keeps an invalid user range invalid after clamping', () => {
    expect(boundedRange('2024-01-20', '2024-01-10', start, end)).toEqual({ start: '2024-01-20T00:00:00.000', end: '2024-01-10T23:59:59.999', valid: false })
  })
})
