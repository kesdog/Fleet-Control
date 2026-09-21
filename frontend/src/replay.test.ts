import { describe, expect, it } from 'vitest'
import { nextReplayIndex, replayFrames, replayMinimumGapMs } from './replay'
import type { TelemetryRecord } from './api/client'

const record = (timestamp: string): TelemetryRecord => ({ timestamp, latitude_deg: 0, longitude_deg: 0, sog_knots: 12, course_deg: 90, heading_deg: 90, estimated_rpm: 48, estimated_fuel_tpd: 76.8, metrics: {}, missing_fields: [] })

describe('replay helpers', () => {
  it('samples recorded frames nearest to four six-hour daily slots and respects the selected range', () => {
    const frames = replayFrames(['2026-01-01T00:00:00', '2026-01-01T01:00:00', '2026-01-01T02:00:00', '2026-01-01T03:00:00', '2026-01-02T00:00:00'].map(record), '2026-01-01', '2026-01-01')
    expect(frames.map((item) => item.timestamp)).toEqual(['2026-01-01T03:00:00'])
  })

  it('does not substitute nearby 15-minute observations for a missing replay interval', () => {
    const frames = replayFrames(['2026-01-01T00:00:00', '2026-01-01T06:00:00', '2026-01-01T06:15:00', '2026-01-01T12:00:00', '2026-01-01T18:00:00', '2026-01-01T18:15:00'].map(record), '2026-01-01', '2026-01-01')
    expect(frames.map((item) => item.timestamp)).toEqual(['2026-01-01T00:00:00', '2026-01-01T06:00:00', '2026-01-01T12:00:00', '2026-01-01T18:15:00'])
  })

  it('omits source observations that cannot meet the configured replay spacing', () => {
    const frames = replayFrames(['2026-01-01T00:00:00', '2026-01-01T03:00:00', '2026-01-01T03:15:00', '2026-01-01T09:00:00', '2026-01-01T15:00:00'].map(record), '2026-01-01', '2026-01-01')
    expect(frames.map((item) => item.timestamp)).toEqual(['2026-01-01T00:00:00', '2026-01-01T09:00:00', '2026-01-01T15:00:00'])
    expect(frames.slice(1).every((frame, index) => new Date(frame.timestamp).getTime() - new Date(frames[index].timestamp).getTime() >= 6 * 60 * 60 * 1_000)).toBe(true)
  })

  it('changes replay slot count and minimum spacing from two through twelve frames daily', () => {
    const hourly = Array.from({ length: 24 }, (_, hour) => `2026-01-01T${String(hour).padStart(2, '0')}:00:00`)
    expect(replayFrames(hourly.map(record), '2026-01-01', '2026-01-01', 2)).toHaveLength(2)
    expect(replayFrames(hourly.map(record), '2026-01-01', '2026-01-01', 12)).toHaveLength(12)
    expect(replayMinimumGapMs(2)).toBe(12 * 60 * 60 * 1_000)
    expect(replayMinimumGapMs(12)).toBe(2 * 60 * 60 * 1_000)
  })

  it('always finishes on the final telemetry observation without adding a too-close frame', () => {
    const frames = replayFrames(['2026-01-01T00:00:00', '2026-01-01T06:00:00', '2026-01-01T12:00:00', '2026-01-01T18:00:00', '2026-01-01T23:45:00'].map(record), '2026-01-01', '2026-01-01')
    expect(frames.map((item) => item.timestamp)).toEqual(['2026-01-01T00:00:00', '2026-01-01T06:00:00', '2026-01-01T12:00:00', '2026-01-01T23:45:00'])
  })

  it('stops transport cleanly at either end of the replay', () => {
    expect(nextReplayIndex(1, 1, 3)).toBe(2)
    expect(nextReplayIndex(0, -1, 3)).toBeNull()
    expect(nextReplayIndex(2, 1, 3)).toBeNull()
  })
})
