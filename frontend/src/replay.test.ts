import { describe, expect, it } from 'vitest'
import { nextReplayIndex, replayFrames } from './replay'
import type { TelemetryRecord } from './api/client'

const record = (timestamp: string): TelemetryRecord => ({ timestamp, latitude_deg: 0, longitude_deg: 0, sog_knots: 12, course_deg: 90, heading_deg: 90, estimated_rpm: 48, estimated_fuel_tpd: 76.8, metrics: {}, missing_fields: [] })

describe('replay helpers', () => {
  it('samples only recorded frames and respects the selected calendar range', () => {
    const frames = replayFrames(['2026-01-01T00:00:00', '2026-01-01T01:00:00', '2026-01-01T02:00:00', '2026-01-01T03:00:00', '2026-01-02T00:00:00'].map(record), '2026-01-01', '2026-01-01')
    expect(frames.map((item) => item.timestamp)).toEqual(['2026-01-01T00:00:00', '2026-01-01T01:00:00', '2026-01-01T02:00:00', '2026-01-01T03:00:00'])
  })

  it('stops transport cleanly at either end of the replay', () => {
    expect(nextReplayIndex(1, 1, 3)).toBe(2)
    expect(nextReplayIndex(0, -1, 3)).toBeNull()
    expect(nextReplayIndex(2, 1, 3)).toBeNull()
  })
})
