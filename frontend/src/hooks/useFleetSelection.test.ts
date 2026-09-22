import { createElement } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { VesselSummary } from '../api/client'
import { useFleetSelection } from './useFleetSelection'

const vessels: VesselSummary[] = [
  { imo: 'IMO-A', name: 'Atlas', start: null, end: null, sample_count: 1, available_metrics: [] },
  { imo: 'IMO-B', name: 'Borealis', start: null, end: null, sample_count: 1, available_metrics: [] },
]

function FleetSelectionHarness({ onChange }: { onChange: () => void }) {
  const selection = useFleetSelection(vessels)
  return createElement('div', null,
    createElement('output', { 'aria-label': 'selected vessels' }, selection.selectedImos.join(',')),
    createElement('output', { 'aria-label': 'active vessel' }, selection.activeImo),
    createElement('output', { 'aria-label': 'selected summary' }, selection.selectedSummary?.name),
    ...vessels.map((vessel) => createElement('button', { key: vessel.imo, type: 'button', onClick: () => selection.toggleVessel(vessel.imo, onChange) }, vessel.imo)),
  )
}

describe('useFleetSelection', () => {
  it('uses the fleet default, preserves multi-select order, and refocuses when the active vessel is removed', () => {
    const onChange = vi.fn()
    render(createElement(FleetSelectionHarness, { onChange }))

    expect(screen.getByLabelText('selected vessels')).toHaveTextContent('')
    expect(screen.getByLabelText('active vessel')).toHaveTextContent('IMO-A')
    expect(screen.getByLabelText('selected summary')).toHaveTextContent('Atlas')

    fireEvent.click(screen.getByRole('button', { name: 'IMO-B' }))
    expect(screen.getByLabelText('selected vessels')).toHaveTextContent('IMO-A,IMO-B')
    expect(screen.getByLabelText('active vessel')).toHaveTextContent('IMO-B')

    fireEvent.click(screen.getByRole('button', { name: 'IMO-B' }))
    expect(screen.getByLabelText('selected vessels')).toHaveTextContent('IMO-A')
    expect(screen.getByLabelText('active vessel')).toHaveTextContent('IMO-A')

    fireEvent.click(screen.getByRole('button', { name: 'IMO-A' }))
    expect(screen.getByLabelText('selected vessels')).toHaveTextContent('')
    expect(screen.getByLabelText('active vessel')).toHaveTextContent('IMO-A')
    expect(onChange).toHaveBeenCalledTimes(3)
  })
})
