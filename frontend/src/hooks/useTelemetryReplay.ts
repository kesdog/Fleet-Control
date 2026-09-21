import { useEffect, useState } from 'react'
import type { TelemetryRecord } from '../api/client'
import { nextReplayIndex, replayFrames } from '../replay'

export function useTelemetryReplay(records: TelemetryRecord[], routeStart: string, routeEnd: string) {
  const [selectedTimestamp, setSelectedTimestamp] = useState('')
  const [playing, setPlaying] = useState(false)
  const [playbackDirection, setPlaybackDirection] = useState<1 | -1>(1)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [replayFramesPerDay, setReplayFramesPerDay] = useState(4)
  const replay = replayFrames(records, routeStart, routeEnd, replayFramesPerDay)
  const selectedReplayIndex = replay.findIndex((record) => record.timestamp === selectedTimestamp)
  const replayValue = selectedReplayIndex >= 0 ? selectedReplayIndex : Math.max(0, replay.length - 1)

  useEffect(() => {
    if (!playing || !replay.length) return
    const timer = window.setInterval(() => {
      if (nextReplayIndex(replayValue, playbackDirection, replay.length) === null) { setPlaying(false); return }
      setSelectedTimestamp(replay[replayValue + playbackDirection].timestamp)
    }, 1_000 / playbackSpeed)
    return () => window.clearInterval(timer)
  }, [playing, playbackDirection, playbackSpeed, replay, replayValue])

  const resetReplaySelection = () => { setPlaying(false); setSelectedTimestamp('') }
  return { selectedTimestamp, setSelectedTimestamp, playing, setPlaying, playbackDirection, setPlaybackDirection, playbackSpeed, setPlaybackSpeed, replayFramesPerDay, setReplayFramesPerDay, replay, replayValue, resetReplaySelection }
}
