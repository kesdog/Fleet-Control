import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { LineSeriesOption } from 'echarts/charts'
import type { DataZoomComponentOption, GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import type { Series } from '../api/client'
import { vesselColor } from '../vesselColors'

echarts.use([LineChart, DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, CanvasRenderer])

type ChartOption = ComposeOption<LineSeriesOption | DataZoomComponentOption | GridComponentOption | LegendComponentOption | TooltipComponentOption>
type Props = { series: Series[]; loading: boolean; error: boolean; colorVersion: number; dateRange: { start: string; end: string }; replayTimestamp?: string; title?: string; onRetry: () => void }

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
function calendarBoundary(day: string, boundary: 'start' | 'end') {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}` : undefined
}

function selectedDateLabel({ start, end }: Props['dateRange']) {
  if (start && end) return `${start} — ${end}`
  if (start) return `From ${start}`
  if (end) return `Through ${end}`
  return 'All available dates'
}

export function TelemetryChart({ series, loading, error, colorVersion, dateRange, replayTimestamp, title = 'Telemetry trend', onRetry }: Props) {
  const chartElement = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const validPointCount = series.reduce((count, entry) => count + entry.points.filter((point) => point.value !== null && !point.missing).length, 0)
  const metric = series[0]?.metric

  useEffect(() => {
    const element = chartElement.current
    if (!element || !series.length || !validPointCount) return
    const chart = echarts.init(element, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(element)
    return () => {
      resizeObserver.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [series.length, validPointCount])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !metric || !validPointCount) return
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
            return `${point.marker}<strong>${point.seriesName}</strong>  ${value === null ? 'No reading' : `${numberFormatter.format(value)} ${metric.unit}`}`
          }).join('<br/>')
          return `${dateFormatter.format(new Date(timestamp))}<br/>${values}`
        },
      },
      xAxis: { type: 'time', axisLine: { lineStyle: { color: '#b6c5ca' } }, axisLabel: { color: '#687780', hideOverlap: true }, splitLine: { show: false } },
      yAxis: { type: 'value', name: metric.unit, nameTextStyle: { color: '#687780', padding: [0, 0, 0, 6] }, axisLabel: { color: '#687780' }, splitLine: { lineStyle: { color: '#e4eaec' } } },
      legend: { show: series.length > 1, top: 0, right: 20, textStyle: { color: '#53636b', fontSize: 11 } },
      dataZoom: [{ type: 'inside', filterMode: 'none', startValue: zoomStart, endValue: zoomEnd }, { type: 'slider', height: 20, bottom: 18, borderColor: '#cbd6da', fillerColor: 'rgba(12, 95, 138, .12)', handleStyle: { color: '#0c5f8a' }, textStyle: { color: '#687780' }, startValue: zoomStart, endValue: zoomEnd }],
      series: series.map((entry, index) => ({ name: entry.imo, type: 'line', showSymbol: false, connectNulls: false, lineStyle: { color: vesselColor(entry.imo), width: 2 }, markLine: index === 0 && replayTimestamp ? { silent: true, symbol: 'none', lineStyle: { color: '#c6493f', width: 1.5, type: 'dashed' }, label: { formatter: 'Replay', color: '#8c3329', position: 'insideEndTop' }, data: [{ xAxis: replayTimestamp }] } : undefined, data: entry.points.map((point) => [point.timestamp, point.missing ? null : point.value]) })),
    }
    chart.setOption(option, { notMerge: true })
  }, [series, metric, validPointCount, colorVersion, dateRange.start, dateRange.end, replayTimestamp])

  return <section className="telemetry-chart" aria-labelledby="telemetry-chart-title" aria-busy={loading}>
    <div className="chart-heading"><div><p className="eyebrow">03</p><h2 id="telemetry-chart-title">{title}</h2><p className="chart-date-range">{selectedDateLabel(dateRange)}</p></div>{metric ? <div className="chart-metric"><strong>{metric.label}</strong><span>{metric.unit || 'unitless'} · {metric.origin} · {series.length} vessel{series.length === 1 ? '' : 's'}</span>{metric.source_column ? <small>Source column: {metric.source_column}</small> : null}{metric.formula ? <small>Formula: {metric.formula}</small> : null}{metric.warning ? <small className="chart-warning">{metric.warning}</small> : null}</div> : null}</div>
    {loading ? <div className="chart-state">Loading telemetry series…</div> : null}
    {!loading && error ? <div className="chart-state is-error" role="alert">Unable to load the telemetry series.<button type="button" className="text-button" onClick={onRetry}>Try again</button></div> : null}
    {!loading && !error && !series.length ? <div className="chart-state">Choose vessels with the focused metric to compare their time series.</div> : null}
    {!loading && !error && series.length > 0 && !validPointCount ? <div className="chart-state">No recorded {metric?.label.toLowerCase()} points exist in this date range.</div> : null}
    <div ref={chartElement} className={`chart-canvas${validPointCount ? '' : ' is-hidden'}`} aria-label={metric ? `${metric.label} time series chart` : undefined} />
  </section>
}
