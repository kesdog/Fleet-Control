import type { TelemetryRecord } from '../../api/client'

export type MapCenter = { latitude: number; longitude: number; zoom: number }
export type MapViewport = { width: number; height: number }
export type VesselTelemetry = { imo: string; records: TelemetryRecord[] }
