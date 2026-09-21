import { describe, expect, it } from 'vitest'
import { dailyFuelConsumption } from './dailyFuel'
import type { SeriesPoint } from '../api/client'

const point = (timestamp: string, value: number | null, missing = false): SeriesPoint => ({ timestamp, value, missing })

describe('dailyFuelConsumption', () => {
  it('integrates a constant fuel rate into one daily total', () => {
    // 150 t/day at 15-minute intervals for two hours = 12.5 tonnes.
    const points = [
      point('2026-03-01T00:00:00', 150),
      point('2026-03-01T00:15:00', 150),
      point('2026-03-01T02:00:00', 150),
    ]
    // Intervals: 0 -> 0:15 (15 min) and 0:15 -> 2:00 (105 min) = 120 minutes total.
    expect(dailyFuelConsumption(points)).toEqual([
      { timestamp: '2026-03-01T00:00:00', value: 12.5, missing: false },
    ])
  })

  it('uses the trapezoidal average across a changing rate', () => {
    // Rates 100 then 200 t/day with a one-day gap: average 150 t/day over 1 day.
    const points = [point('2026-03-01T00:00:00', 100), point('2026-03-02T00:00:00', 200)]
    expect(dailyFuelConsumption(points)).toEqual([
      { timestamp: '2026-03-01T00:00:00', value: 150, missing: false },
    ])
  })

  it('groups intervals by day', () => {
    const points = [
      point('2026-03-01T12:00:00', 100),
      point('2026-03-02T00:00:00', 100),
      point('2026-03-02T12:00:00', 100),
    ]
    const result = dailyFuelConsumption(points)
    expect(result).toHaveLength(2)
    expect(result[0].timestamp).toBe('2026-03-01T00:00:00')
    expect(result[1].timestamp).toBe('2026-03-02T00:00:00')
  })

  it('skips missing values without producing a bogus bucket', () => {
    const points = [point('2026-03-01T00:00:00', null), point('2026-03-01T01:00:00', 100)]
    expect(dailyFuelConsumption(points)).toEqual([])
  })
})
