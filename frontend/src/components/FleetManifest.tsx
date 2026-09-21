import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { VesselSummary } from '../api/client'
import { vesselColor } from '../vesselColors'

type FleetManifestProps = { vessels: VesselSummary[]; selectedImos: string[]; focusedImo: string; onToggle: (imo: string) => void }

export function FleetManifest({ vessels, selectedImos, focusedImo, onToggle }: FleetManifestProps) {
  const [expanded, setExpanded] = useState(true)
  return <aside className="fleet-manifest" aria-label="Fleet selection"><div className="panel-heading"><div><p className="eyebrow">02</p><h2>Fleet manifest</h2></div><span className="panel-status">{selectedImos.length} selected</span></div><button className="manifest-toggle" type="button" aria-expanded={expanded} aria-controls="vessel-roster" onClick={() => setExpanded((value) => !value)}><span>{expanded ? 'Hide roster' : 'Show roster'}</span><ChevronDown size={16} aria-hidden="true" /></button>{expanded ? <><p className="manifest-note">Select one or more vessels. The most recently selected vessel supplies the active telemetry frame.</p><div id="vessel-roster" className="vessel-roster">{vessels.map((vessel) => { const selected = selectedImos.includes(vessel.imo); const color = vesselColor(vessel.imo); return <label className={`vessel-roster-item${selected ? ' is-selected' : ''}${focusedImo === vessel.imo ? ' is-focused' : ''}`} key={vessel.imo} style={{ borderLeft: `5px solid ${color}` }}><input className="roster-checkbox" type="checkbox" checked={selected} onChange={() => onToggle(vessel.imo)} style={{ accentColor: color }} /><span><strong><span aria-hidden="true" style={{ display: 'inline-block', width: 9, height: 9, marginRight: 7, borderRadius: '50%', background: color }} />{vessel.name ?? vessel.imo}</strong><small>{vessel.imo}</small></span></label> })}</div></> : null}</aside>
}
