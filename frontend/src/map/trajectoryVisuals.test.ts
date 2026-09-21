import { describe, expect, it } from 'vitest'
import { courseBearing, metricColor, trajectorySegments } from './trajectoryVisuals'
import type { Trajectory } from '../api/client'

const trajectory: Trajectory = { imo: 'IMO1', start: null, end: null, metric: { key: 'sog', label: 'Speed', unit: 'kn', origin: 'measured', source_column: 'sog', formula: null, based_on: [], warning: null }, segments: [[{ timestamp: '2026-01-01T00:00:00Z', latitude_deg: 0, longitude_deg: 179, metric_value: 1, missing: false }, { timestamp: '2026-01-01T01:00:00Z', latitude_deg: 0, longitude_deg: -179, metric_value: 10, missing: false }], [{ timestamp: '2026-01-01T02:00:00Z', latitude_deg: 1, longitude_deg: -178, metric_value: 5, missing: false }, { timestamp: '2026-01-01T03:00:00Z', latitude_deg: 2, longitude_deg: -177, metric_value: 7, missing: false }]] }

describe('trajectory visuals', () => {
  it('keeps date-line-separated API segments disconnected', () => expect(trajectorySegments(trajectory)).toHaveLength(2))
  it('maps low and high metric values to distinct colors', () => expect(metricColor(1, [1, 10])).not.toEqual(metricColor(10, [1, 10])))
  it('calculates a northbound marker bearing', () => expect(courseBearing([{ timestamp: '', latitude_deg: 0, longitude_deg: 0, metric_value: null, missing: false }, { timestamp: '', latitude_deg: 1, longitude_deg: 0, metric_value: null, missing: false }])).toBeCloseTo(0))
})
