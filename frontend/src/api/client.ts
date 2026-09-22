import { toApiError } from './errors'

export type HealthResponse = { status: 'ok' | 'degraded'; database: 'connected' | 'unavailable'; cache: 'initialized' | 'not_initialized' }

export type Metric = {
  key: string
  label: string
  unit: string
  origin: 'measured' | 'estimated' | 'environmental'
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
export type SeriesPoint = { timestamp: string; value: number | null; missing: boolean }
export type Series = { imo: string; metric: Metric; start: string | null; end: string | null; points: SeriesPoint[] }
export type TelemetryRecord = { timestamp: string; latitude_deg: number; longitude_deg: number; sog_knots: number; course_deg: number | null; heading_deg: number | null; estimated_rpm: number; estimated_fuel_tpd: number; stw_knots: number | null; stw_source: string | null; current_along_heading_knots: number | null; wind_speed_knots: number | null; wind_direction_deg: number | null; wave_height_m: number | null; wave_direction_deg: number | null; wave_period_s: number | null; current_speed_knots: number | null; current_direction_deg: number | null; weather_factor: number | null; metrics: Record<string, number>; missing_fields: string[] }
export type Telemetry = { imo: string; start: string | null; end: string | null; records: TelemetryRecord[] }

export type WeatherSummary = { mean_wave_height_m: number | null; max_wave_height_m: number | null; mean_weather_factor: number | null }
export type WeatherImpact = { adjusted_fuel_tonnes: number; adjusted_fuel_cost: number; wind_percent: number | null; wave_percent: number | null; total_percent: number | null; model: string; warning: string }
export type Performance = { imo: string; start: string | null; end: string | null; distance_nm: number; fuel_tonnes: number; fuel_cost: number; fuel_currency: string; fuel_efficiency_nm_per_tonne: number | null; fuel_consumption_t_per_100nm: number | null; fuel_cost_per_nm: number | null; weather: WeatherSummary; weather_impact: WeatherImpact; observed_duration_seconds: number; unobserved_duration_seconds: number; coverage_percent: number | null }
export type EnvironmentPoint = { timestamp: string; wind_speed_knots: number | null; wind_direction_deg: number | null; wave_height_m: number | null; wave_direction_deg: number | null; wave_period_s: number | null; current_speed_knots: number | null; current_direction_deg: number | null; weather_factor: number | null; missing: boolean }
export type Environment = { imo: string; start: string | null; end: string | null; records: EnvironmentPoint[] }
export type ImportSession = { session_id: string; status: string; files: Array<{ filename: string; headers: string[]; delimiter: string; row_count: number; warnings: string[] }> }
export type ImportColumn = { source_column: string; semantic_field: string | null; detected_unit: string | null; requires_unit_mapping: boolean }
export type ImportPreview = { session_id: string; status: string; files: Array<{ filename: string; source_columns: string[]; columns: ImportColumn[]; row_count: number; timestamp_range: [string, string] | null; null_counts: Record<string, number>; sample_rows: Array<Record<string, string>>; warnings: string[]; fields_requiring_confirmation: string[] }> }
export type ImportFileMapping = { semantic_fields: Record<string, string>; unit_overrides: Record<string, string> }
export type ImportMapping = Record<string, ImportFileMapping>
export type ImportIssue = { severity: 'error' | 'warning' | 'information'; code: string; message: string; file: string | null; column: string | null; row_number: number | null }
export type ImportValidation = { session_id: string; status: string; issues: ImportIssue[]; normalized_columns: Record<string, string[]>; estimated_metrics: string[]; rows_accepted: number; rows_rejected: number }
export type ImportProgress = { session_id: string; status: 'VALIDATED' | 'ENRICHING' | 'COMMITTED' | 'FAILED'; imo: string | null; enrichment_days_completed: number; enrichment_days_total: number }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(path, { headers: { Accept: 'application/json', ...init.headers }, ...init })
    if (!response.ok) throw response
    return response.status === 204 ? undefined as T : response.json() as Promise<T>
  } catch (error) {
    throw await toApiError(error)
  }
}

// Use these typed functions from TanStack Query hooks instead of fetching inside display components.
export function getHealth() { return request<HealthResponse>('/api/health') }
export function getVessels() { return request<VesselSummary[]>('/api/vessels') }
export function getVessel(imo: string) { return request<Vessel>(`/api/vessels/${encodeURIComponent(imo)}`) }
export function getMetrics(imo: string) { return request<Metric[]>(`/api/vessels/${encodeURIComponent(imo)}/metrics`) }

// Keep range serialization here so every visualization uses the API's ISO timestamp contract.
export function getTrajectory(imo: string, metric: string, start: string, end: string) {
  const params = new URLSearchParams({ metric })
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  return request<Trajectory>(`/api/vessels/${encodeURIComponent(imo)}/trajectory?${params}`)
}

export function getTelemetry(imo: string, start: string, end: string) {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  return request<Telemetry>(`/api/vessels/${encodeURIComponent(imo)}/telemetry?${params}`)
}

export function getSeries(imo: string, metric: string, start: string, end: string, maxPoints = 3_000) {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  params.set('max_points', String(maxPoints))
  return request<Series>(`/api/vessels/${encodeURIComponent(imo)}/series/${encodeURIComponent(metric)}?${params}`)
}

export function getPerformance(imo: string, start: string, end: string) {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  return request<Performance>(`/api/vessels/${encodeURIComponent(imo)}/performance?${params}`)
}

export function getEnvironment(imo: string, start: string, end: string) {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  return request<Environment>(`/api/vessels/${encodeURIComponent(imo)}/environment?${params}`)
}

export function startImport(files: File[]) {
  const body = new FormData()
  files.forEach((file) => body.append('files', file))
  return request<ImportSession>('/api/imports', { method: 'POST', body })
}

export function previewImport(sessionId: string) {
  return request<ImportPreview>(`/api/imports/${encodeURIComponent(sessionId)}/preview`)
}

export function updateImportMapping(sessionId: string, files: ImportMapping) {
  return request<{ session_id: string; status: string; mapping: ImportMapping }>(`/api/imports/${encodeURIComponent(sessionId)}/mapping`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  })
}

export function validateImport(sessionId: string) { return request<ImportValidation>(`/api/imports/${encodeURIComponent(sessionId)}/validate`, { method: 'POST' }) }

export function commitImport(sessionId: string, imo: string, name: string, mode: 'CREATE' | 'REPLACE') { return request<{ imo: string; samples_imported: number }>(`/api/imports/${encodeURIComponent(sessionId)}/commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imo, name: name || null, mode }) }) }

export function getImportProgress(sessionId: string) {
  return request<ImportProgress>(`/api/imports/${encodeURIComponent(sessionId)}/progress`)
}

export function cancelImport(sessionId: string) { return request<void>(`/api/imports/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }) }
