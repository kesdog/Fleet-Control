import { useTranslation } from 'react-i18next'
import { metricDomain, metricShade, routeMetricUnit, routeMetricValue, type RouteMetric } from '../../map/routeShade'
import { vesselColor } from '../../vesselColors'
import type { VesselTelemetry } from './types'

export function RouteLegend({ vessels, routeMetric }: { vessels: VesselTelemetry[]; routeMetric: RouteMetric }) {
  const { t } = useTranslation()
  const scales = vessels.flatMap(({ imo, records }) => {
    const values = records.map((record) => routeMetricValue(record, routeMetric))
    return values.some((value) => value !== null) ? [{ imo, domain: metricDomain(values) }] : []
  })
  if (!scales.length) return null
  const unit = routeMetricUnit(routeMetric)
  const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })
  return <div className="route-legend" aria-label={t('map.routeLegend')}><span className="route-legend-title">{t('map.routeLegend')}</span>{scales.map(({ imo, domain }) => { const color = vesselColor(imo); return <div className="route-legend-row" key={imo}><span className="route-legend-swatch" style={{ background: color }} aria-hidden="true" /><span className="route-legend-imo">{imo}</span><span className="route-legend-bar" style={{ background: `linear-gradient(to right, ${metricShade(color, 0)}, ${metricShade(color, 1)})` }} /><span className="route-legend-range">{format(domain[0])} – {format(domain[1])} {unit}</span></div> })}</div>
}
