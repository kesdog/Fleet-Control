import type { TelemetryRecord, Trajectory, TrajectoryPoint } from '../api/client'

export type TrajectorySegment = { points: TrajectoryPoint[]; color: [number, number, number, number] }

export function metricDomain(trajectory?: Trajectory): [number, number] {
  const values = trajectory?.segments.flat().flatMap((point) => point.metric_value === null ? [] : [point.metric_value]) ?? []
  if (!values.length) return [0, 1]
  return [Math.min(...values), Math.max(...values)]
}

export function metricColor(value: number | null, domain: [number, number]): [number, number, number, number] {
  if (value === null) return [116, 128, 138, 170]
  const ratio = domain[0] === domain[1] ? 0.5 : Math.max(0, Math.min(1, (value - domain[0]) / (domain[1] - domain[0])))
  const stops: Array<[number, number, number]> = [[24, 113, 162], [249, 199, 79], [211, 74, 58]]
  const index = Math.min(stops.length - 2, Math.floor(ratio * (stops.length - 1)))
  const localRatio = ratio * (stops.length - 1) - index
  const start = stops[index]
  const end = stops[index + 1]
  return [
    Math.round(start[0] + (end[0] - start[0]) * localRatio),
    Math.round(start[1] + (end[1] - start[1]) * localRatio),
    Math.round(start[2] + (end[2] - start[2]) * localRatio),
    230,
  ]
}

export function trajectorySegments(trajectory?: Trajectory): TrajectorySegment[] {
  if (!trajectory) return []
  const domain = metricDomain(trajectory)
  return trajectory.segments.flatMap((segment) => segment.slice(1).map((point, index) => ({ points: [segment[index], point], color: metricColor(point.metric_value, domain) })))
}

export function courseBearing(points: TrajectoryPoint[]): number {
  if (points.length < 2) return 0
  const start = points.at(-2)!
  const end = points.at(-1)!
  const longitudeDelta = ((end.longitude_deg - start.longitude_deg + 540) % 360) - 180
  const startLatitude = start.latitude_deg * Math.PI / 180
  const endLatitude = end.latitude_deg * Math.PI / 180
  const y = Math.sin(longitudeDelta * Math.PI / 180) * Math.cos(endLatitude)
  const x = Math.cos(startLatitude) * Math.sin(endLatitude) - Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(longitudeDelta * Math.PI / 180)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

export function vesselMarker(trajectory?: Trajectory, records: TelemetryRecord[] = []) {
  const point = trajectory?.segments.at(-1)?.at(-1)
  if (!point) return undefined
  const telemetry = records.at(-1)
  return { position: [point.longitude_deg, point.latitude_deg] as [number, number], angle: telemetry?.heading_deg ?? telemetry?.course_deg ?? courseBearing(trajectory?.segments.at(-1) ?? []) }
}
