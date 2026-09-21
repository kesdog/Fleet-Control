import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts'
import type { DataZoomComponentOption, GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import type { Series } from '../api/client'
import { vesselColor } from '../vesselColors'
import { dailyFuelConsumption } from './dailyFuel'

echarts.use([BarChart, LineChart, DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, CanvasRenderer])

type ChartType = 'line' | 'bar'
type ChartOption = ComposeOption<BarSeriesOption | LineSeriesOption | DataZoomComponentOption | GridComponentOption | LegendComponentOption | TooltipComponentOption>
type Props = { series: Series[]; loading: boolean; error: boolean; colorVersion: number; dateRange: { start: string; end: string }; replayTimestamp?: string; chartType?: ChartType; onRetry: () => void }

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
function calendarBoundary(day: string, boundary: 'start' | 'end') {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}` : undefined
}

function selectedDateLabel({ start, end }: Props['dateRange'], t: (key: string, options?: Record<string, unknown>) => string) {
  if (start && end) return `${start} — ${end}`
  if (start) return t('chart.fromDate', { date: start })
  if (end) return t('chart.throughDate', { date: end })
  return t('chart.allDates')
}

export function TelemetryChart({ series, loading, error, colorVersion, dateRange, replayTimestamp, chartType = 'line', onRetry }: Props) {
  const { t } = useTranslation()
  const chartElement = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const metric = series[0]?.metric
  const dailyFuel = chartType === 'bar' && metric?.key === 'fuel_tpd'
  const displaySeries = dailyFuel
    ? series.map((entry) => ({
        ...entry,
        metric: { ...entry.metric, label: t('chart.dailyFuel'), unit: 't' },
        points: dailyFuelConsumption(entry.points),
      }))
    : series
  const displayMetric = displaySeries[0]?.metric
  const chartTypeLabel = chartType === 'bar' ? t('chart.typeBar') : t('chart.typeLine')
  const heading = displayMetric ? `${chartTypeLabel} — ${displayMetric.label}` : chartTypeLabel
  const validPointCount = displaySeries.reduce((count, entry) => count + entry.points.filter((point) => point.value !== null && !point.missing).length, 0)

  useEffect(() => {
    const element = chartElement.current
    if (!element || !displaySeries.length || !validPointCount) return
    const chart = echarts.init(element, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(element)
    return () => {
      resizeObserver.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [displaySeries.length, validPointCount])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !displayMetric || !validPointCount) return
    const zoomStart = calendarBoundary(dateRange.start, 'start')
    const zoomEnd = calendarBoundary(dateRange.end, 'end')
    const option: ChartOption = {
      animation: false,
      grid: { top: 28, right: 30, bottom: 74, left: 64, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: '#17313b',
        borderWidth: 0,
        textStyle: { color: '#fff', fontFamily: 'Georgia, serif' },
        formatter: (params) => {
          const points = Array.isArray(params) ? params : [params]
          const [timestamp] = points[0].value as [string, number | null]
          const values = points.map((point) => {
            const [, value] = point.value as [string, number | null]
            return `${point.marker}<strong>${point.seriesName}</strong>  ${value === null ? t('chart.noReading') : `${numberFormatter.format(value)} ${displayMetric.unit}`}`
          }).join('<br/>')
          return `${dateFormatter.format(new Date(timestamp))}<br/>${values}`
        },
      },
      xAxis: { type: 'time', axisLine: { lineStyle: { color: '#b6c5ca' } }, axisLabel: { color: '#687780', hideOverlap: true }, splitLine: { show: false } },
      yAxis: { type: 'value', name: displayMetric.unit, nameTextStyle: { color: '#687780', padding: [0, 0, 0, 6] }, axisLabel: { color: '#687780' }, splitLine: { lineStyle: { color: '#e4eaec' } } },
      legend: { show: displaySeries.length > 1, top: 0, right: 20, textStyle: { color: '#53636b', fontSize: 11 }, data: displaySeries.map((entry) => ({ name: entry.imo, itemStyle: { color: vesselColor(entry.imo) } })) },
      dataZoom: [{ type: 'inside', filterMode: 'none', startValue: zoomStart, endValue: zoomEnd }, { type: 'slider', height: 20, bottom: 18, borderColor: '#cbd6da', fillerColor: 'rgba(12, 95, 138, .12)', handleStyle: { color: '#0c5f8a' }, textStyle: { color: '#687780' }, startValue: zoomStart, endValue: zoomEnd }],
      series: displaySeries.map((entry, index) => {
        const color = vesselColor(entry.imo)
        const style = chartType === 'bar'
          ? { itemStyle: { color, borderRadius: [2, 2, 0, 0] }, barMaxWidth: 22 }
          : { lineStyle: { color, width: 2 }, itemStyle: { color }, showSymbol: false, connectNulls: false }
        return { name: entry.imo, type: chartType, ...style, markLine: index === 0 && replayTimestamp ? { silent: true, symbol: 'none', lineStyle: { color: '#c6493f', width: 1.5, type: 'dashed' }, label: { formatter: t('chart.replay'), color: '#8c3329', position: 'insideEndTop' }, data: [{ xAxis: replayTimestamp }] } : undefined, data: entry.points.map((point) => [point.timestamp, point.missing ? null : point.value]) }
      }),
    }
    chart.setOption(option, { notMerge: true })
  }, [displaySeries, displayMetric, validPointCount, colorVersion, dateRange.start, dateRange.end, replayTimestamp, chartType, t])

  return <section className="telemetry-chart" aria-labelledby="telemetry-chart-title" aria-busy={loading}>
    <div className="chart-heading"><div><h2 id="telemetry-chart-title">{heading}</h2><p className="chart-date-range">{selectedDateLabel(dateRange, t)}</p></div>{displayMetric ? <div className="chart-metric"><strong>{displayMetric.label}</strong><span>{displayMetric.unit || t('chart.unitless')} · {t(`dashboard.${displayMetric.origin}`)} · {displaySeries.length} {t('chart.vessels', { count: displaySeries.length })}</span>{displayMetric.source_column ? <small>{t('dashboard.sourceColumn')}: {displayMetric.source_column}</small> : null}{displayMetric.formula ? <small>{t('dashboard.formula')}: {displayMetric.formula}</small> : null}{displayMetric.warning ? <small className="chart-warning">{displayMetric.warning}</small> : null}</div> : null}</div>
    {loading ? <div className="chart-state" role="status">{t('dashboard.loadingTelemetry')}</div> : null}
    {!loading && error ? <div className="chart-state is-error" role="alert">{t('errors.telemetry')}<button type="button" className="text-button" onClick={onRetry}>{t('errors.retry')}</button></div> : null}
    {!loading && !error && !displaySeries.length ? <div className="chart-state" role="status">{t('dashboard.emptyTelemetry')}</div> : null}
    {!loading && !error && displaySeries.length > 0 && !validPointCount ? <div className="chart-state" role="status">{t('dashboard.noRecordedPoints', { metric: displayMetric?.label?.toLowerCase() })}</div> : null}
    <div ref={chartElement} className={`chart-canvas${validPointCount ? '' : ' is-hidden'}`} aria-label={displayMetric ? `${displayMetric.label} time series chart` : undefined} />
  </section>
}
