export type HealthResponse = { status: 'ok' | 'degraded'; database: 'connected' | 'unavailable'; cache: 'initialized' | 'not_initialized' }

// Use this typed boundary for backend requests so view components do not own fetch details.
export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health', { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Health request failed: ${response.status}`)
  return response.json() as Promise<HealthResponse>
}
