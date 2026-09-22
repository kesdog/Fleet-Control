import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as api from '../../api/client'
import type { ImportPreview, ImportSession, ImportValidation } from '../../api/client'
import { ImportTelemetry } from './ImportTelemetry'

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  startImport: vi.fn(),
  previewImport: vi.fn(),
  updateImportMapping: vi.fn(),
  validateImport: vi.fn(),
  commitImport: vi.fn(),
}))

const session: ImportSession = { session_id: 'session-1', status: 'UPLOADED', files: [] }
const preview: ImportPreview = {
  session_id: 'session-1', status: 'PREVIEWED',
  files: [{
    filename: 'voyage.csv', source_columns: ['when', 'latitude', 'longitude'], row_count: 2,
    timestamp_range: ['2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z'], null_counts: {}, warnings: [], fields_requiring_confirmation: [],
    columns: [
      { source_column: 'when', semantic_field: 'timestamp', detected_unit: null, requires_unit_mapping: false },
      { source_column: 'latitude', semantic_field: 'latitude', detected_unit: 'deg', requires_unit_mapping: false },
      { source_column: 'longitude', semantic_field: 'longitude', detected_unit: 'deg', requires_unit_mapping: false },
    ],
    sample_rows: [{ when: '2026-01-01T00:00:00Z', latitude: '10', longitude: '20' }],
  }],
}
const validation: ImportValidation = {
  session_id: 'session-1', status: 'VALIDATED', issues: [], normalized_columns: { 'voyage.csv': ['timestamp', 'latitude_deg', 'longitude_deg'] }, estimated_metrics: ['estimated_rpm'], rows_accepted: 2, rows_rejected: 0,
}

describe('ImportTelemetry', () => {
  it('progresses from CSV upload through detection, mapping, validation, and review without committing', async () => {
    vi.mocked(api.startImport).mockResolvedValue(session)
    vi.mocked(api.previewImport).mockResolvedValue(preview)
    vi.mocked(api.updateImportMapping).mockResolvedValue({ session_id: session.session_id, status: 'MAPPED', mapping: {} })
    vi.mocked(api.validateImport).mockResolvedValue(validation)

    render(<ImportTelemetry vessels={[]} onClose={vi.fn()} onCommitted={vi.fn()} onNotify={vi.fn()} />)
    const file = new File(['when,latitude,longitude\n'], 'voyage.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText(/choose or drop csv files/i), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: /inspect files/i }))

    expect(await screen.findByRole('heading', { name: /review detected source data/i })).toBeInTheDocument()
    expect(api.startImport).toHaveBeenCalledWith([file])
    expect(api.previewImport).toHaveBeenCalledWith('session-1')

    fireEvent.click(screen.getByRole('button', { name: /confirm mappings/i }))
    expect(await screen.findByRole('heading', { name: /confirm navigation fields and units/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /validate import/i }))

    await waitFor(() => expect(api.updateImportMapping).toHaveBeenCalledWith('session-1', {
      'voyage.csv': {
        semantic_fields: { when: 'timestamp', latitude: 'latitude', longitude: 'longitude' },
        unit_overrides: {},
      },
    }))
    expect(await screen.findByRole('heading', { name: /validate normalized telemetry/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /run validation/i }))

    expect(await screen.findByRole('heading', { name: /commit the validated vessel/i })).toBeInTheDocument()
    expect(api.validateImport).toHaveBeenCalledWith('session-1')
    expect(api.commitImport).not.toHaveBeenCalled()
  })
})
