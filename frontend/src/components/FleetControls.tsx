import type { ChangeEvent } from 'react'
import type { Metric, VesselSummary } from '../api/client'
import { useTranslation } from 'react-i18next'

type FleetControlsProps = { vessels: VesselSummary[]; selectedImo: string; metrics: Metric[]; selectedMetric: string; start: string; end: string; loading: boolean; disabled: boolean; rangeValid: boolean; onVesselChange: (imo: string) => void; onMetricChange: (metric: string) => void; onStartChange: (start: string) => void; onEndChange: (end: string) => void }

// Render this above any visualization; the parent owns state so later map and chart views share filters.
export function FleetControls(props: FleetControlsProps) {
  const { t } = useTranslation()
  const selectVessel = (event: ChangeEvent<HTMLSelectElement>) => props.onVesselChange(event.target.value)
  const selectMetric = (event: ChangeEvent<HTMLSelectElement>) => props.onMetricChange(event.target.value)
  return <section className="fleet-controls" aria-label={t('controls.title')}>
    <label><span>{t('controls.vessel')}</span><select value={props.selectedImo} onChange={selectVessel} disabled={props.disabled}><option value="">{props.loading ? t('controls.loading') : t('dashboard.emptyTitle')}</option>{props.vessels.map((vessel) => <option key={vessel.imo} value={vessel.imo}>{vessel.name ? `${vessel.imo} - ${vessel.name}` : vessel.imo}</option>)}</select></label>
    <label><span>{t('controls.start')}</span><input type="datetime-local" value={props.start} onChange={(event) => props.onStartChange(event.target.value)} disabled={props.disabled} /></label>
    <label><span>{t('controls.end')}</span><input type="datetime-local" value={props.end} onChange={(event) => props.onEndChange(event.target.value)} disabled={props.disabled} /></label>
    <label><span>{t('controls.metric')}</span><select value={props.selectedMetric} onChange={selectMetric} disabled={props.disabled || !props.metrics.length}><option value="">{t('controls.noMetrics')}</option>{props.metrics.map((metric) => <option key={metric.key} value={metric.key}>{t(`metrics.${metric.key}`, { defaultValue: metric.label })}</option>)}</select></label>
    {!props.rangeValid ? <p className="range-error" role="alert">{t('controls.invalidRange')}</p> : null}
  </section>
}
