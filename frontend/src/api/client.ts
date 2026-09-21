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
export type SeriesPoint = { timestamp: string; value: number | null; missing: boolean }
export type Series = { imo: string; metric: Metric; start: string | null; end: string | null; points: SeriesPoint[] }
export type TelemetryRecord = { timestamp: string; latitude_deg: number; longitude_deg: number; sog_knots: number; course_deg: number | null; heading_deg: number | null; estimated_rpm: number; estimated_fuel_tpd: number; metrics: Record<string, number>; missing_fields: string[] }
export type Telemetry = { imo: string; start: string | null; end: string | null; records: TelemetryRecord[] }
export type ImportSession = { session_id: string; status: string; files: Array<{ filename: string; headers: string[]; delimiter: string; row_count: number; warnings: string[] }> }
export type ImportColumn = { source_column: string; semantic_field: string | null; detected_unit: string | null; requires_unit_mapping: boolean }
export type ImportPreview = { session_id: string; status: string; files: Array<{ filename: string; source_columns: string[]; columns: ImportColumn[]; row_count: number; timestamp_range: [string, string] | null; null_counts: Record<string, number>; sample_rows: Array<Record<string, string>>; warnings: string[]; fields_requiring_confirmation: string[] }> }
export type ImportFileMapping = { semantic_fields: Record<string, string>; unit_overrides: Record<string, string> }
export type ImportMapping = Record<string, ImportFileMapping>
export type ImportValidation = { session_id: string; status: string; errors: string[]; warnings: string[]; normalized_columns: Record<string, string[]>; estimated_metrics: string[]; rows_accepted: number; rows_rejected: number }

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(await responseMessage(response))
  return response.json() as Promise<T>
}

async function responseMessage(response: Response) {
  const fallback = `Request failed: ${response.status}`
  try {
    const body = await response.json() as { detail?: string | Array<{ msg?: string }> }
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) return body.detail.map((entry) => entry.msg).filter(Boolean).join(', ') || fallback
  } catch {
    // Non-JSON failures retain the concise HTTP fallback.
  }
  return fallback
}

// Use these typed functions from TanStack Query hooks instead of fetching inside display components.
export function getHealth() { return getJson<HealthResponse>('/api/health') }
export function getVessels() { return getJson<VesselSummary[]>('/api/vessels') }
export function getVessel(imo: string) { return getJson<Vessel>(`/api/vessels/${encodeURIComponent(imo)}`) }
export function getMetrics(imo: string) { return getJson<Metric[]>(`/api/vessels/${encodeURIComponent(imo)}/metrics`) }

// Keep range serialization here so every visualization uses the API's ISO timestamp contract.
export function getTrajectory(imo: string, metric: string, start: string, end: string) {
  const params = new URLSearchParams({ metric })
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  return getJson<Trajectory>(`/api/vessels/${encodeURIComponent(imo)}/trajectory?${params}`)
}

export function getTelemetry(imo: string, start: string, end: string) {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  return getJson<Telemetry>(`/api/vessels/${encodeURIComponent(imo)}/telemetry?${params}`)
}

export function getSeries(imo: string, metric: string, start: string, end: string, maxPoints = 3_000) {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  params.set('max_points', String(maxPoints))
  return getJson<Series>(`/api/vessels/${encodeURIComponent(imo)}/series/${encodeURIComponent(metric)}?${params}`)
}

export async function startImport(files: File[]) {
  const body = new FormData()
  files.forEach((file) => body.append('files', file))
  const response = await fetch('/api/imports', { method: 'POST', body })
  if (!response.ok) throw new Error(await responseMessage(response))
  return response.json() as Promise<ImportSession>
}

export function previewImport(sessionId: string) {
  return getJson<ImportPreview>(`/api/imports/${encodeURIComponent(sessionId)}/preview`)
}

export async function updateImportMapping(sessionId: string, files: ImportMapping) {
  const response = await fetch(`/api/imports/${encodeURIComponent(sessionId)}/mapping`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  })
  if (!response.ok) throw new Error(await responseMessage(response))
  return response.json() as Promise<{ session_id: string; status: string; mapping: ImportMapping }>
}

export async function validateImport(sessionId: string) {
  const response = await fetch(`/api/imports/${encodeURIComponent(sessionId)}/validate`, { method: 'POST' })
  if (!response.ok) throw new Error(await responseMessage(response))
  return response.json() as Promise<ImportValidation>
}

export async function commitImport(sessionId: string, imo: string, name: string, mode: 'CREATE' | 'REPLACE') {
  const response = await fetch(`/api/imports/${encodeURIComponent(sessionId)}/commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imo, name: name || null, mode }) })
  if (!response.ok) throw new Error(await responseMessage(response))
  return response.json() as Promise<{ imo: string; samples_imported: number }>
}

export async function cancelImport(sessionId: string) {
  const response = await fetch(`/api/imports/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await responseMessage(response))
}
