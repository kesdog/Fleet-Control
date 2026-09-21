import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelImport, commitImport, previewImport, startImport, updateImportMapping, validateImport } from './client'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('import API client', () => {
  it('sends the full staged import workflow using the backend contract', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ session_id: 'session-1', status: 'UPLOADED', files: [] }, 201))
      .mockResolvedValueOnce(response({ session_id: 'session-1', status: 'INSPECTED', files: [] }))
      .mockResolvedValueOnce(response({ session_id: 'session-1', status: 'MAPPED', mapping: {} }))
      .mockResolvedValueOnce(response({ session_id: 'session-1', status: 'VALIDATED', errors: [], warnings: [], normalized_columns: {}, estimated_metrics: ['rpm'], rows_accepted: 2, rows_rejected: 0 }))
      .mockResolvedValueOnce(response({ imo: 'IMO123', samples_imported: 2 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)

    await startImport([new File(['Timestamp,Latitude'], 'gps.csv', { type: 'text/csv' })])
    await previewImport('session-1')
    await updateImportMapping('session-1', { 'gps.csv': { semantic_fields: { Timestamp: 'timestamp' }, unit_overrides: {} } })
    await validateImport('session-1')
    await commitImport('session-1', 'IMO123', 'Test vessel', 'REPLACE')
    await cancelImport('session-1')

    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/imports',
      '/api/imports/session-1/preview',
      '/api/imports/session-1/mapping',
      '/api/imports/session-1/validate',
      '/api/imports/session-1/commit',
      '/api/imports/session-1',
    ])
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST' })
    expect(fetch.mock.calls[2][1]).toMatchObject({ method: 'PUT' })
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ files: { 'gps.csv': { semantic_fields: { Timestamp: 'timestamp' }, unit_overrides: {} } } })
    expect(JSON.parse(fetch.mock.calls[4][1].body)).toEqual({ imo: 'IMO123', name: 'Test vessel', mode: 'REPLACE' })
    expect(fetch.mock.calls[5][1]).toMatchObject({ method: 'DELETE' })
  })

  it('surfaces backend validation detail to the wizard', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ detail: 'Import session must pass validation before commit.' }, 409)))
    await expect(commitImport('session-1', 'IMO123', '', 'CREATE')).rejects.toThrow('Import session must pass validation before commit.')
  })
})
