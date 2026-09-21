import type { SeriesPoint } from '../api/client'

const DAY_MS = 86_400_000

// Fuel consumption is a rate (tonnes/day). Integrating that rate between
// consecutive samples yields the fuel consumed over each interval; grouping
// those intervals by day produces one daily total for a bar chart.
export function dailyFuelConsumption(points: SeriesPoint[]): SeriesPoint[] {
  const buckets = new Map<string, number>()
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (previous.value === null || current.value === null) continue
    const previousTime = Date.parse(previous.timestamp)
    const currentTime = Date.parse(current.timestamp)
    if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) continue
    const elapsedDays = (currentTime - previousTime) / DAY_MS
    if (elapsedDays <= 0) continue
    const fuel = ((previous.value + current.value) / 2) * elapsedDays
    const date = previous.timestamp.slice(0, 10)
    buckets.set(date, (buckets.get(date) ?? 0) + fuel)
  }

  return [...buckets.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([date, tonnes]) => ({ timestamp: `${date}T00:00:00`, value: tonnes, missing: false }))
}
