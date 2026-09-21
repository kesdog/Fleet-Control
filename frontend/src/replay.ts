import type { TelemetryRecord } from './api/client'

export function replayFrames(records: TelemetryRecord[], routeStart: string, routeEnd: string) {
  const latest = records.at(-1)?.timestamp.slice(0, 10) || ''
  const fallbackStart = latest ? new Date(`${latest}T00:00:00Z`) : null
  if (fallbackStart) fallbackStart.setUTCDate(fallbackStart.getUTCDate() - 29)
  const start = routeStart || fallbackStart?.toISOString().slice(0, 10) || ''
  const end = routeEnd || latest
  const days = new Map<string, TelemetryRecord[]>()
  records.filter((record) => record.timestamp.slice(0, 10) >= start && record.timestamp.slice(0, 10) <= end).forEach((record) => {
    const day = record.timestamp.slice(0, 10)
    days.set(day, [...(days.get(day) ?? []), record])
  })
  return [...days.values()].flatMap((day) => [...new Map([0, Math.floor((day.length - 1) / 3), Math.ceil((day.length - 1) * 2 / 3), day.length - 1].map((index) => [day[index].timestamp, day[index]])).values()])
}

export function nextReplayIndex(current: number, direction: 1 | -1, length: number) {
  const next = current + direction
  return next >= 0 && next < length ? next : null
}
