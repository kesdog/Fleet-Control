import type { TelemetryRecord } from './api/client'

const dayMs = 24 * 60 * 60 * 1_000
const minimumAllowedGapMs = 10 * 60 * 1_000
const maximumAllowedGapMs = 12 * 60 * 60 * 1_000

function timestampMs(timestamp: string) {
  return new Date(/Z$|[+-]\d{2}:\d{2}$/.test(timestamp) ? timestamp : `${timestamp}Z`).getTime()
}

export function replayMinimumGapMs(framesPerDay: number) {
  const count = Math.max(2, Math.min(12, Math.round(framesPerDay)))
  return Math.max(minimumAllowedGapMs, Math.min(maximumAllowedGapMs, dayMs / count))
}

export function replayFrames(records: TelemetryRecord[], routeStart: string, routeEnd: string, framesPerDay = 4) {
  const latest = records.at(-1)?.timestamp.slice(0, 10) || ''
  const fallbackStart = latest ? new Date(`${latest}T00:00:00Z`) : null
  if (fallbackStart) fallbackStart.setUTCDate(fallbackStart.getUTCDate() - 29)
  const start = routeStart || fallbackStart?.toISOString().slice(0, 10) || ''
  const end = routeEnd || latest
  const count = Math.max(2, Math.min(12, Math.round(framesPerDay)))
  const minimumFrameGapMs = replayMinimumGapMs(count)
  const slotIntervalMs = dayMs / count
  const slotToleranceMs = slotIntervalMs / 2
  const days = new Map<string, TelemetryRecord[]>()
  const selectedRecords = records
    .filter((record) => record.timestamp.slice(0, 10) >= start && record.timestamp.slice(0, 10) <= end)
    .sort((a, b) => timestampMs(a.timestamp) - timestampMs(b.timestamp))
  selectedRecords.forEach((record) => {
    const day = record.timestamp.slice(0, 10)
    days.set(day, [...(days.get(day) ?? []), record])
  })
  let previousFrameMs = -Infinity
  const sampled = [...days.entries()].flatMap(([date, day]) => {
    const sorted = [...day].sort((a, b) => timestampMs(a.timestamp) - timestampMs(b.timestamp))
    const selected: TelemetryRecord[] = []

    const dayStart = Date.parse(`${date}T00:00:00Z`)
    for (let slot = 0; slot < count; slot += 1) {
      const target = dayStart + slot * slotIntervalMs
      const candidate = sorted
        .filter((record) => !selected.includes(record))
        .filter((record) => Math.abs(timestampMs(record.timestamp) - target) <= slotToleranceMs)
        .sort((a, b) => Math.abs(timestampMs(a.timestamp) - target) - Math.abs(timestampMs(b.timestamp) - target) || timestampMs(a.timestamp) - timestampMs(b.timestamp))[0]

      // Missing or too-close slots stay missing. Replaying only recorded observations avoids
      // synthetic movement and prevents uneven source density from accelerating a vessel.
      if (!candidate || timestampMs(candidate.timestamp) < previousFrameMs + minimumFrameGapMs) continue
      selected.push(candidate)
      previousFrameMs = timestampMs(candidate.timestamp)
    }
    return selected
  })

  const finalRecord = selectedRecords.at(-1)
  if (!finalRecord || sampled.at(-1)?.timestamp === finalRecord.timestamp) return sampled

  // Preserve the minimum replay gap by replacing an incompatible trailing slot with the
  // final observation. The replay must always end at the selected telemetry range's end.
  const finalTimestamp = timestampMs(finalRecord.timestamp)
  while (sampled.length && finalTimestamp - timestampMs(sampled.at(-1)!.timestamp) < minimumFrameGapMs) sampled.pop()
  return [...sampled, finalRecord]
}

export function nextReplayIndex(current: number, direction: 1 | -1, length: number) {
  const next = current + direction
  return next >= 0 && next < length ? next : null
}
