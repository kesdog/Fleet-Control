export type HealthResponse = { status: 'ok' | 'degraded'; database: 'connected' | 'unavailable'; cache: 'initialized' | 'not_initialized' }

export type Metric = {
  key: string
  label: string
  unit: string
  origin: 'measured' | 'estimated'
  source_column: string | null
  formula: string | null
  based_on: string[]
  warning: string | null
}

export type VesselSummary = {
  imo: string
  name: string | null
  start: string | null
  end: string | null
  sample_count: number
  available_metrics: string[]
}

export type Vessel = VesselSummary & { metrics: Metric[] }

export type TrajectoryPoint = { timestamp: string; latitude_deg: number; longitude_deg: number; metric_value: number | null; missing: boolean }
export type Trajectory = { imo: string; metric: Metric; start: string | null; end: string | null; segments: TrajectoryPoint[][] }

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response.json() as Promise<T>
}

// Use these typed functions from TanStack Query hooks instead of fetching inside display components.
export function getHealth() { return getJson<HealthResponse>('/api/health') }
export function getVessels() { return getJson<VesselSummary[]>('/api/vessels') }
export function getVessel(imo: string) { return getJson<Vessel>(`/api/vessels/${encodeURIComponent(imo)}`) }
export function getMetrics(imo: string) { return getJson<Metric[]>(`/api/vessels/${encodeURIComponent(imo)}/metrics`) }

// Keep range serialization here so every visualization uses the API's ISO timestamp contract.
export function getTrajectory(imo: string, metric: string, start: string, end: string) {
  const params = new URLSearchParams({ metric })
  if (start) params.set('start', new Date(start).toISOString())
  if (end) params.set('end', new Date(end).toISOString())
  return getJson<Trajectory>(`/api/vessels/${encodeURIComponent(imo)}/trajectory?${params}`)
}
