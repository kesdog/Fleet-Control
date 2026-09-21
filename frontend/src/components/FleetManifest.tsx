import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { VesselSummary } from '../api/client'
import { vesselColor, vesselColors } from '../vesselColors'
import './fleetManifest.css'

type Props = { vessels: VesselSummary[]; selectedImos: string[]; focusedImo: string; onToggle: (imo: string) => void; onColorChange: (imo: string, color: string) => void }

export function FleetManifest({ vessels, selectedImos, focusedImo, onToggle, onColorChange }: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)
  return <aside className="fleet-manifest" aria-label={t('fleetManifest.selectionLabel')}>
    <div className="panel-heading"><div><h2>{t('fleetManifest.title')}</h2></div><span className="panel-status">{t('fleetManifest.selectedCount', { count: selectedImos.length })}</span></div>
    <button className="manifest-toggle" type="button" aria-expanded={expanded} aria-controls="vessel-roster" onClick={() => setExpanded((value) => !value)}><span>{expanded ? t('fleetManifest.hideRoster') : t('fleetManifest.showRoster')}</span><ChevronDown size={16} aria-hidden="true" /></button>
    {expanded ? <><p className="manifest-note">{t('fleetManifest.note')}</p><div id="vessel-roster" className="vessel-roster">{vessels.map((vessel) => {
      const selected = selectedImos.includes(vessel.imo); const color = vesselColor(vessel.imo); const used = vessels.filter((other) => other.imo !== vessel.imo).map((other) => vesselColor(other.imo))
      return <div className={`vessel-roster-item${selected ? ' is-selected' : ''}${focusedImo === vessel.imo ? ' is-focused' : ''}`} key={vessel.imo} style={{ borderLeft: `5px solid ${color}` }}><label className="vessel-choice"><input className="roster-checkbox" type="checkbox" checked={selected} onChange={() => onToggle(vessel.imo)} style={{ accentColor: color }} /><span><strong><span aria-hidden="true" className="vessel-color-dot" style={{ background: color }} />{vessel.name ?? vessel.imo}</strong><small>{vessel.imo}</small></span></label><details className="vessel-color-picker"><summary aria-label={t('fleetManifest.changeColor', { imo: vessel.imo })}><span aria-hidden="true" style={{ background: color }} /></summary><div className="vessel-color-palette" role="group" aria-label={t('fleetManifest.colorFor', { imo: vessel.imo })}>{vesselColors.map((option) => <button key={option} type="button" aria-label={t('fleetManifest.useColor', { color: option })} title={option} disabled={option !== color && used.includes(option)} className={option === color ? 'is-active' : ''} style={{ background: option }} onClick={(event) => { onColorChange(vessel.imo, option); event.currentTarget.closest('details')?.removeAttribute('open') }} />)}</div></details></div>
    })}</div></> : null}
  </aside>
}
