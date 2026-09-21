import { describe, expect, it } from 'vitest'
import type { TelemetryRecord } from '../api/client'
import { hexToRgb, metricDomain, metricShade, routeMetricValue } from './routeShade'

const record = (overrides: Partial<TelemetryRecord>): TelemetryRecord => ({
  timestamp: '2026-03-01T00:00:00',
  latitude_deg: 0,
  longitude_deg: 0,
  sog_knots: 10,
  course_deg: 90,
  heading_deg: 90,
  estimated_rpm: 40,
  estimated_fuel_tpd: 76.8,
  stw_knots: 9,
  stw_source: 'current_corrected',
  current_along_heading_knots: 1,
  wind_speed_knots: null,
  wind_direction_deg: null,
  wave_height_m: null,
  wave_direction_deg: null,
  wave_period_s: null,
  current_speed_knots: null,
  current_direction_deg: null,
  weather_factor: null,
  metrics: {},
  missing_fields: [],
  ...overrides,
})

describe('routeMetricValue', () => {
  it('extracts the matching field for each route metric', () => {
    expect(routeMetricValue(record({}), 'sog')).toBe(10)
    expect(routeMetricValue(record({}), 'stw')).toBe(9)
    expect(routeMetricValue(record({}), 'rpm')).toBe(40)
    expect(routeMetricValue(record({}), 'fuel_tpd')).toBe(76.8)
  })

  it('returns null for a missing stw value', () => {
    expect(routeMetricValue(record({ stw_knots: null }), 'stw')).toBeNull()
  })
})

describe('metricDomain', () => {
  it('returns the min and max of non-null values for small sets', () => {
    expect(metricDomain([10, null, 20, 5])).toEqual([5, 20])
  })

  it('returns a fallback range when no values are present', () => {
    expect(metricDomain([null, null])).toEqual([0, 1])
  })

  it('widens a collapsed domain so normalization never divides by zero', () => {
    expect(metricDomain([7, 7, 7])).toEqual([7, 8])
  })

  it('clips outliers for large sets using the 2nd and 98th percentiles', () => {
    const values = [...Array(90).fill(10), ...Array(9).fill(20), 500, 900]
    expect(metricDomain(values)).toEqual([10, 20])
  })
})

describe('metricShade', () => {
  const lightness = (shade: string) => Number(/hsl\(\s*\d+,\s*\d+%,\s*(\d+)%\)/.exec(shade)?.[1])

  it('produces a darker shade as the ratio increases', () => {
    const light = lightness(metricShade('#0878a9', 0))
    const dark = lightness(metricShade('#0878a9', 1))
    expect(light).toBeGreaterThan(dark)
  })

  it('clamps ratios outside the 0-1 range', () => {
    expect(metricShade('#0878a9', 2)).toBe(metricShade('#0878a9', 1))
    expect(metricShade('#0878a9', -1)).toBe(metricShade('#0878a9', 0))
  })

  it('preserves the hue of the base colour', () => {
    const hue = (shade: string) => Number(/hsl\(\s*(\d+),/.exec(shade)?.[1])
    expect(hue(metricShade('#0878a9', 0.5))).toBe(hue(metricShade('#0878a9', 0.9)))
  })
})

describe('hexToRgb', () => {
  it('parses a six-digit hex colour', () => {
    expect(hexToRgb('#0878a9')).toEqual([8, 120, 169])
  })
})
