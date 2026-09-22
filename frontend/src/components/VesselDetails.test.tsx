import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Metric, Vessel } from '../api/client'
import { VesselDetails } from './VesselDetails'

const vessel: Vessel = { imo: 'IMO1234567', name: 'Test Vessel', start: null, end: null, sample_count: 2, available_metrics: ['neutral_metric'], metrics: [] }
const metric = (origin: Metric['origin']): Metric => ({ key: 'neutral_metric', label: 'Neutral metric', unit: 'units', origin, source_column: null, formula: null, based_on: [], warning: null })

describe('VesselDetails', () => {
  it.each([
    ['estimated', 'estimate-badge'],
    ['measured', 'measured-badge'],
  ] as const)('uses the %s badge only from metric.origin', (origin, badgeClass) => {
    render(<VesselDetails vessel={vessel} metric={metric(origin)} loading={false} error={false} onRetry={() => undefined} />)

    const badge = document.querySelector(`.${badgeClass}`)
    expect(badge).toHaveTextContent(origin === 'estimated' ? 'Estimated' : 'Measured')
    expect(badge).toHaveClass(badgeClass)
    expect(screen.getByText('Neutral metric')).toBeInTheDocument()
  })
})
