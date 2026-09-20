import type { VesselSummary } from '../api/client'

type FleetManifestProps = { vessels: VesselSummary[]; selectedImos: string[]; focusedImo: string; onToggle: (imo: string) => void }

export function FleetManifest({ vessels, selectedImos, focusedImo, onToggle }: FleetManifestProps) {
  return <aside className="fleet-manifest" aria-label="Fleet selection"><div className="panel-heading"><div><p className="eyebrow">02</p><h2>Fleet manifest</h2></div><span className="panel-status">{selectedImos.length} selected</span></div><p className="manifest-note">Select one or more vessels. The most recently selected vessel supplies the active telemetry frame.</p><div className="vessel-roster">{vessels.map((vessel) => { const selected = selectedImos.includes(vessel.imo); return <button className={`vessel-roster-item${selected ? ' is-selected' : ''}${focusedImo === vessel.imo ? ' is-focused' : ''}`} type="button" key={vessel.imo} aria-pressed={selected} onClick={() => onToggle(vessel.imo)}><span className="roster-indicator" aria-hidden="true" /><span><strong>{vessel.name ?? vessel.imo}</strong><small>{vessel.imo}</small></span></button> })}</div></aside>
}
