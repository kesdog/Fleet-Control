import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Performance } from '../api/client'
import { vesselColor } from '../vesselColors'
import './voyagePerformance.css'

export type PerformanceEntry = { imo: string; name: string | null; performance: Performance }
type VoyagePerformanceProps = { entries: PerformanceEntry[]; loading: boolean; error: boolean; onRetry: () => void }

function formatValue(value: number | null, unit: string, digits = 2) {
  if (value === null) return '—'
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits })} ${unit}`
}

function signedPercent(value: number | null) {
  if (value === null) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function durationHours(seconds: number) {
  return `${(seconds / 3600).toLocaleString(undefined, { maximumFractionDigits: 1 })} h`
}

function impactTone(value: number | null): 'positive' | 'negative' | 'neutral' {
  if (value === null || Math.abs(value) < 0.05) return 'neutral'
  return value > 0 ? 'positive' : 'negative'
}

function ShipPerformance({ entry, showWeatherImpact }: { entry: PerformanceEntry; showWeatherImpact: boolean }) {
  const { t } = useTranslation()
  const { performance } = entry
  const impact = performance.weather_impact
  const fuelTonnes = showWeatherImpact ? impact.adjusted_fuel_tonnes : performance.fuel_tonnes
  const fuelCost = showWeatherImpact ? impact.adjusted_fuel_cost : performance.fuel_cost
  const cost = fuelCost.toLocaleString(undefined, { maximumFractionDigits: 0 })

  return <div className="voyage-performance-ship" style={{ borderLeftColor: vesselColor(entry.imo) }}>
    <div className="ship-heading">
      <span className="ship-swatch" style={{ background: vesselColor(entry.imo) }} aria-hidden="true" />
      <strong>{entry.imo}</strong>
      {entry.name ? <span className="ship-name">{entry.name}</span> : null}
      <span className="ship-currency">{performance.fuel_currency}</span>
    </div>
    <dl className="detail-list">
      <div><dt>{t('performance.distance')}</dt><dd>{formatValue(performance.distance_nm, 'nm')}</dd></div>
      <div><dt>{t('performance.fuelConsumed')}</dt><dd>{formatValue(fuelTonnes, 't')}</dd></div>
      <div><dt>{t('performance.fuelCost')}</dt><dd>{cost} {performance.fuel_currency}</dd></div>
      <div><dt>{t('performance.nmPerTonne')}</dt><dd>{formatValue(performance.fuel_efficiency_nm_per_tonne, 'nm/t')}</dd></div>
      <div><dt>{t('performance.tPer100nm')}</dt><dd>{formatValue(performance.fuel_consumption_t_per_100nm, 't/100nm')}</dd></div>
      <div><dt>{t('performance.costPerNm')}</dt><dd>{formatValue(performance.fuel_cost_per_nm, `${performance.fuel_currency}/nm`)}</dd></div>
      <div><dt>{t('performance.maxWaveHeight')}</dt><dd>{formatValue(performance.weather.max_wave_height_m, 'm')}</dd></div>
      <div><dt>{t('performance.coverage')}</dt><dd>{signedPercent(performance.coverage_percent)}</dd></div>
      <div><dt>{t('performance.unobserved')}</dt><dd>{durationHours(performance.unobserved_duration_seconds)}</dd></div>
    </dl>
    {showWeatherImpact ? <div className="ship-weather-impact">
      <span className={`impact-badge is-${impactTone(impact.total_percent)}`}>{t('performance.weatherImpact')}: {signedPercent(impact.total_percent)}</span>
      <span className="impact-breakdown">{t('performance.wind')} {signedPercent(impact.wind_percent)} · {t('performance.waves')} {signedPercent(impact.wave_percent)}</span>
      <p className="impact-warning">{impact.warning}</p>
    </div> : null}
  </div>
}

export function VoyagePerformance({ entries, loading, error, onRetry }: VoyagePerformanceProps) {
  const { t } = useTranslation()
  const [showWeatherImpact, setShowWeatherImpact] = useState(false)

  if (loading) return <section className="voyage-performance" aria-busy="true"><div className="loading-copy" role="status">{t('dashboard.loading')}</div></section>
  if (error) return <section className="voyage-performance"><div className="error-copy" role="alert">{t('errors.vessel')}</div><button className="text-button" type="button" onClick={onRetry}>{t('errors.retry')}</button></section>
  if (!entries.length) return null

  return <section className="voyage-performance" aria-label={t('performance.title')}>
    <div className="panel-heading">
      <div><h2>{t('performance.title')}</h2></div>
      <div className="panel-heading-actions">
        <span className="panel-status">{t('performance.vessels', { count: entries.length })}</span>
        <label className="weather-toggle"><input type="checkbox" checked={showWeatherImpact} onChange={(event) => setShowWeatherImpact(event.target.checked)} />{t('performance.estimateWeather')}</label>
      </div>
    </div>
    {entries.map((entry) => <ShipPerformance key={entry.imo} entry={entry} showWeatherImpact={showWeatherImpact} />)}
  </section>
}
