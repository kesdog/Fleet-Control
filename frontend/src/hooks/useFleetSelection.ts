import { useState } from 'react'
import type { VesselSummary } from '../api/client'

export function useFleetSelection(vessels: VesselSummary[] | undefined) {
  const [selectedImos, setSelectedImos] = useState<string[]>([])
  const [focusedImo, setFocusedImo] = useState('')

  const activeImo = focusedImo || selectedImos[0] || vessels?.[0]?.imo || ''
  const selectedSummary = vessels?.find((vessel) => vessel.imo === activeImo)

  const toggleVessel = (imo: string, onChange: () => void) => {
    setSelectedImos((current) => {
      const selected = current.length ? current : activeImo ? [activeImo] : []
      const next = selected.includes(imo) ? selected.filter((item) => item !== imo) : [...selected, imo]
      setFocusedImo((focused) => next.includes(imo) ? imo : focused === imo ? (next.at(-1) ?? '') : focused)
      return next
    })
    onChange()
  }

  return { selectedImos, activeImo, selectedSummary, toggleVessel }
}
