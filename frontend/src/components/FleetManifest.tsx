import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { VesselSummary } from '../api/client'
import { vesselColor, vesselColors } from '../vesselColors'
import './fleetManifest.css'

type Props = { vessels: VesselSummary[]; selectedImos: string[]; focusedImo: string; onToggle: (imo: string) => void; onColorChange: (imo: string, color: string) => void }

export function FleetManifest({ vessels, selectedImos, focusedImo, onToggle, onColorChange }: Props) {
  const [expanded, setExpanded] = useState(true)
  return <aside className="fleet-manifest" aria-label="Fleet selection">
    <div className="panel-heading"><div><p className="eyebrow">02</p><h2>Fleet manifest</h2></div><span className="panel-status">{selectedImos.length} selected</span></div>
    <button className="manifest-toggle" type="button" aria-expanded={expanded} aria-controls="vessel-roster" onClick={() => setExpanded((value) => !value)}><span>{expanded ? 'Hide roster' : 'Show roster'}</span><ChevronDown size={16} aria-hidden="true" /></button>
    {expanded ? <><p className="manifest-note">Select one or more vessels. The most recently selected vessel supplies the active telemetry frame.</p><div id="vessel-roster" className="vessel-roster">{vessels.map((vessel) => {
      const selected = selectedImos.includes(vessel.imo); const color = vesselColor(vessel.imo); const used = vessels.filter((other) => other.imo !== vessel.imo).map((other) => vesselColor(other.imo))
      return <div className={`vessel-roster-item${selected ? ' is-selected' : ''}${focusedImo === vessel.imo ? ' is-focused' : ''}`} key={vessel.imo} style={{ borderLeft: `5px solid ${color}` }}><label className="vessel-choice"><input className="roster-checkbox" type="checkbox" checked={selected} onChange={() => onToggle(vessel.imo)} style={{ accentColor: color }} /><span><strong><span aria-hidden="true" className="vessel-color-dot" style={{ background: color }} />{vessel.name ?? vessel.imo}</strong><small>{vessel.imo}</small></span></label><details className="vessel-color-picker"><summary aria-label={`Change ${vessel.imo} color`}><span aria-hidden="true" style={{ background: color }} /></summary><div className="vessel-color-palette" role="group" aria-label={`${vessel.imo} color`}>{vesselColors.map((option) => <button key={option} type="button" aria-label={`Use ${option}`} title={option} disabled={option !== color && used.includes(option)} className={option === color ? 'is-active' : ''} style={{ background: option }} onClick={(event) => { onColorChange(vessel.imo, option); event.currentTarget.closest('details')?.removeAttribute('open') }} />)}</div></details></div>
    })}</div></> : null}
  </aside>
}
