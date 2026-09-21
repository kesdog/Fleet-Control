import { ChevronRight } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelemetryRecord } from '../api/client'
import { vesselColor } from '../vesselColors'
import './telemetryFrames.css'

type VesselTelemetry = { imo: string; records: TelemetryRecord[] }
type Props = { vessels: VesselTelemetry[]; focusedImo: string; selectedTimestamp: string; onFrameSelect: (timestamp: string) => void; routeStart: string; routeEnd: string; onRouteStartChange: (date: string) => void; onRouteEndChange: (date: string) => void; goToTelemetryRequest: number }
type Day = { imo: string; date: string; records: TelemetryRecord[]; distance: number; averageSpeed: number }
const frameColumns: Array<{ key: keyof TelemetryRecord; labelKey: string }> = [{ key: 'timestamp', labelKey: 'telemetryFrames.columnTimestamp' }, { key: 'latitude_deg', labelKey: 'telemetryFrames.columnLatitude' }, { key: 'longitude_deg', labelKey: 'telemetryFrames.columnLongitude' }, { key: 'sog_knots', labelKey: 'telemetryFrames.columnSog' }, { key: 'stw_knots', labelKey: 'telemetryFrames.columnStw' }, { key: 'heading_deg', labelKey: 'telemetryFrames.columnHeading' }, { key: 'course_deg', labelKey: 'telemetryFrames.columnCourse' }, { key: 'current_along_heading_knots', labelKey: 'telemetryFrames.columnCurrent' }, { key: 'wind_speed_knots', labelKey: 'telemetryFrames.columnWind' }, { key: 'wave_height_m', labelKey: 'telemetryFrames.columnWaveHeight' }, { key: 'wave_period_s', labelKey: 'telemetryFrames.columnWavePeriod' }, { key: 'weather_factor', labelKey: 'telemetryFrames.columnWeatherFactor' }, { key: 'estimated_rpm', labelKey: 'telemetryFrames.columnRpm' }, { key: 'estimated_fuel_tpd', labelKey: 'telemetryFrames.columnFuelRate' }]
const format = (value: unknown) => typeof value === 'number' ? value.toFixed(2) : typeof value === 'string' ? value : '—'
function nauticalMiles(a: TelemetryRecord, b: TelemetryRecord) { const lat = (b.latitude_deg - a.latitude_deg) * Math.PI / 180; const lon = ((b.longitude_deg - a.longitude_deg + 540) % 360 - 180) * Math.PI / 180; const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude_deg * Math.PI / 180) * Math.cos(b.latitude_deg * Math.PI / 180) * Math.sin(lon / 2) ** 2; return 3440.1 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) }
function summarize(vessels: VesselTelemetry[]): Day[] { return vessels.flatMap(({ imo, records }) => { const groups = new Map<string, TelemetryRecord[]>(); records.forEach((record) => { const date = record.timestamp.slice(0, 10); groups.set(date, [...(groups.get(date) ?? []), record]) }); return [...groups.entries()].map(([date, day]) => ({ imo, date, records: day, distance: day.slice(1).reduce((total, record, index) => total + nauticalMiles(day[index], record), 0), averageSpeed: day.reduce((total, record) => total + record.sog_knots, 0) / day.length })) }) }

export function TelemetryFrames({ vessels = [], focusedImo, selectedTimestamp, onFrameSelect, routeStart, routeEnd, onRouteStartChange, onRouteEndChange, goToTelemetryRequest }: Props) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState({ key: null as string | null, request: 0 })
  const selectedRowRef = useRef<HTMLTableRowElement>(null)
  const focusedRecords = vessels.find((vessel) => vessel.imo === focusedImo)?.records ?? []
  const selected = focusedRecords.find((record) => record.timestamp === selectedTimestamp) ?? focusedRecords.at(-1)
  const selectedDay = selected?.timestamp.slice(0, 10)
  const replayKey = selectedDay ? `${focusedImo}:${selectedDay}` : null
  // A Go-to request wins only until a user explicitly expands another day. No state update is
  // required in an effect, so the request remains direct without a render cascade.
  const activeExpanded = goToTelemetryRequest > expanded.request ? replayKey : expanded.key
  const summaries = summarize(vessels)
  const dates = [...new Set(summaries.map((day) => day.date))].sort()
  const pageDates = dates.slice(Math.max(0, dates.length - (page + 1) * 30), dates.length - page * 30).reverse()
  const days = summaries.filter((day) => pageDates.includes(day.date)).sort((a, b) => b.date.localeCompare(a.date) || a.imo.localeCompare(b.imo))

  useEffect(() => { if (goToTelemetryRequest) selectedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [goToTelemetryRequest, activeExpanded])

  return <section className="telemetry-frames" aria-label={t('telemetryFrames.label')}>
    <div className="frames-heading"><div><h2>{t('telemetryFrames.title')}</h2></div><span>{t('telemetryFrames.summary', { count: vessels.length, days: summaries.length })}</span></div>
    <details className="route-filters"><summary>{t('telemetryFrames.routeFilters')}<ChevronRight className="route-filters-arrow" size={16} aria-hidden="true" /></summary><div><label>{t('telemetryFrames.start')} <input type="date" value={routeStart} onChange={(event) => onRouteStartChange(event.target.value)} /></label><label>{t('telemetryFrames.end')} <input type="date" value={routeEnd} onChange={(event) => onRouteEndChange(event.target.value)} /></label></div></details>
    <div className="frame-pagination"><button type="button" disabled={dates.length <= (page + 1) * 30} onClick={() => setPage((value) => value + 1)}>{t('telemetryFrames.older')}</button><span>{t('telemetryFrames.rangeLabel', { start: pageDates.at(-1), end: pageDates[0] })}</span><button type="button" disabled={!page} onClick={() => setPage((value) => Math.max(0, value - 1))}>{t('telemetryFrames.newer')}</button></div>
    <div className="frame-table-wrap"><table><thead><tr><th>{t('telemetryFrames.vessel')}</th><th>{t('telemetryFrames.date')}</th><th>{t('telemetryFrames.frames')}</th><th>{t('telemetryFrames.firstPosition')}</th><th>{t('telemetryFrames.lastPosition')}</th><th>{t('telemetryFrames.distance')}</th><th>{t('telemetryFrames.avgSog')}</th></tr></thead><tbody>
      {days.map((day) => { const key = `${day.imo}:${day.date}`; const first = day.records[0]; const last = day.records.at(-1)!; const focusedDay = day.imo === focusedImo && day.date === selectedDay; return <Fragment key={key}>
        <tr ref={focusedDay ? selectedRowRef : undefined} className={`day-summary ${focusedDay ? 'is-current-day' : ''}`} onClick={() => setExpanded((value) => ({ key: value.key === key ? null : key, request: goToTelemetryRequest }))}><td><span className="vessel-table-dot" style={{ background: vesselColor(day.imo) }} />{day.imo}</td><td>{day.date}</td><td>{day.records.length}</td><td>{first.latitude_deg.toFixed(3)}, {first.longitude_deg.toFixed(3)}</td><td>{last.latitude_deg.toFixed(3)}, {last.longitude_deg.toFixed(3)}</td><td>{day.distance.toFixed(1)} nm</td><td>{day.averageSpeed.toFixed(1)} kn</td></tr>
        {activeExpanded === key ? <tr className="frame-detail"><td colSpan={7}><table><thead><tr>{frameColumns.map((column) => <th key={column.key}>{t(column.labelKey)}</th>)}</tr></thead><tbody>{day.records.map((record) => <tr key={record.timestamp} className={record.timestamp === selectedTimestamp ? 'is-current' : ''} onClick={() => onFrameSelect(record.timestamp)}>{frameColumns.map((column) => <td key={column.key}>{format(record[column.key])}</td>)}</tr>)}</tbody></table></td></tr> : null}
      </Fragment> })}
    </tbody></table></div>
  </section>
}
