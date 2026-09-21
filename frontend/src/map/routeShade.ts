import type { TelemetryRecord } from '../api/client'

export type RouteMetric = 'sog' | 'stw' | 'rpm' | 'fuel_tpd'

export function routeMetricValue(record: TelemetryRecord, metric: RouteMetric): number | null {
  switch (metric) {
    case 'sog': return record.sog_knots
    case 'stw': return record.stw_knots
    case 'rpm': return record.estimated_rpm
    case 'fuel_tpd': return record.estimated_fuel_tpd
  }
}

export function routeMetricUnit(metric: RouteMetric): string {
  switch (metric) {
    case 'sog': return 'kn'
    case 'stw': return 'kn'
    case 'rpm': return 'rpm'
    case 'fuel_tpd': return 't/day'
  }
}

export function metricDomain(values: Array<number | null>): [number, number] {
  const numbers = values
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b)
  if (numbers.length === 0) return [0, 1]
  if (numbers.length < 20) {
    const min = numbers[0]
    const max = numbers[numbers.length - 1]
    return min === max ? [min, min + 1] : [min, max]
  }
  // Clip the outer 2% so a single speed/fuel spike cannot stretch the whole ramp.
  const low = percentile(numbers, 0.02)
  const high = percentile(numbers, 0.98)
  return low === high ? [low, low + 1] : [low, high]
}

function percentile(sorted: number[], p: number): number {
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

export function metricShade(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgb(hex)
  const [hue, saturation] = rgbToHsl(r, g, b)
  const clamped = Math.max(0, Math.min(1, ratio))
  const lightness = 0.72 - 0.56 * clamped
  return `hsl(${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)`
}

export function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '')
  const expanded = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned
  const value = parseInt(expanded, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const lightness = (max + min) / 2
  const delta = max - min
  let hue = 0
  let saturation = 0
  if (delta !== 0) {
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    if (max === rn) hue = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60
    else if (max === gn) hue = ((bn - rn) / delta + 2) * 60
    else hue = ((rn - gn) / delta + 4) * 60
  }
  return [hue, saturation, lightness]
}
