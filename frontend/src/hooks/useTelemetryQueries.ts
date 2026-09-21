import { useQueries, useQuery } from '@tanstack/react-query'
import { getMetrics, getPerformance, getSeries, getTelemetry, type VesselSummary } from '../api/client'

export function boundedRange(routeStart: string, routeEnd: string, vesselStart: string | null, vesselEnd: string | null) {
  const candidateStart = /^\d{4}-\d{2}-\d{2}$/.test(routeStart) ? `${routeStart}T00:00:00.000` : vesselStart ?? ''
  const candidateEnd = /^\d{4}-\d{2}-\d{2}$/.test(routeEnd) ? `${routeEnd}T23:59:59.999` : vesselEnd ?? ''
  const start = vesselStart && candidateStart < vesselStart ? vesselStart : candidateStart
  const end = vesselEnd && candidateEnd > vesselEnd ? vesselEnd : candidateEnd
  return { start, end, valid: !start || !end || start <= end }
}

export function useTelemetryQueries(vessels: VesselSummary[] | undefined, selectedImos: string[], activeImo: string, selectedMetric: string, extraChartMetrics: string[], routeStart: string, routeEnd: string) {
  const selectedSummary = vessels?.find((vessel) => vessel.imo === activeImo)
  const metricsQuery = useQuery({ queryKey: ['metrics', activeImo], queryFn: () => getMetrics(activeImo), enabled: Boolean(activeImo) })
  const activeMetric = selectedMetric || metricsQuery.data?.find((metric) => metric.key === 'sog')?.key || metricsQuery.data?.[0]?.key || ''
  const { start: activeStart, end: activeEnd, valid: rangeValid } = boundedRange(routeStart, routeEnd, selectedSummary?.start ?? null, selectedSummary?.end ?? null)
  const telemetryQuery = useQuery({ queryKey: ['telemetry', activeImo, activeStart, activeEnd], queryFn: () => getTelemetry(activeImo, activeStart, activeEnd), enabled: Boolean(activeImo && rangeValid) })
  const mapImos = selectedImos.length ? selectedImos : activeImo ? [activeImo] : []
  const performanceQueries = useQueries({ queries: mapImos.map((imo) => {
    const vessel = vessels?.find((entry) => entry.imo === imo)
    const range = boundedRange(routeStart, routeEnd, vessel?.start ?? null, vessel?.end ?? null)
    return { queryKey: ['performance', imo, range.start, range.end], queryFn: () => getPerformance(imo, range.start, range.end), enabled: range.valid }
  }) })
  const performanceEntries = performanceQueries.flatMap((query, index) => query.data ? [{ imo: mapImos[index], name: vessels?.find((vessel) => vessel.imo === mapImos[index])?.name ?? null, performance: query.data }] : [])
  const mapTelemetryQueries = useQueries({ queries: mapImos.map((imo) => {
    const vessel = vessels?.find((entry) => entry.imo === imo)
    const range = boundedRange(routeStart, routeEnd, vessel?.start ?? null, vessel?.end ?? null)
    return { queryKey: ['telemetry', imo, range.start, range.end], queryFn: () => getTelemetry(imo, range.start, range.end), enabled: range.valid }
  }) })
  const mapTelemetry = mapTelemetryQueries.flatMap((query, index) => query.data ? [{ imo: mapImos[index], records: query.data.records }] : [])
  const chartImos = selectedImos.length ? selectedImos : activeImo ? [activeImo] : []
  const chartSlots = [activeMetric, ...extraChartMetrics].filter(Boolean)
  const chartSlotQueries = useQueries({ queries: chartSlots.flatMap((metric) => chartImos.filter((imo) => vessels?.find((vessel) => vessel.imo === imo)?.available_metrics.includes(metric)).map((imo) => ({ queryKey: ['chart-slot-series', imo, metric, activeStart, activeEnd], queryFn: () => getSeries(imo, metric, activeStart, activeEnd, metric === 'fuel_tpd' ? 20_000 : 3_000), enabled: Boolean(metric && rangeValid) }))) })
  let chartQueryOffset = 0
  const chartSlotsWithSeries = chartSlots.map((metric) => { const count = chartImos.filter((imo) => vessels?.find((vessel) => vessel.imo === imo)?.available_metrics.includes(metric)).length; const queries = chartSlotQueries.slice(chartQueryOffset, chartQueryOffset + count); chartQueryOffset += count; return { metric, series: queries.flatMap((query) => query.data ? [query.data] : []), loading: queries.some((query) => query.isPending), error: queries.some((query) => query.isError), refetch: () => queries.forEach((query) => void query.refetch()) } })

  return { metricsQuery, activeMetric, activeStart, activeEnd, telemetryQuery, performanceQueries, performanceEntries, performanceLoading: performanceQueries.some((query) => query.isPending), performanceError: performanceQueries.some((query) => query.isError), mapTelemetryQueries, mapTelemetry, chartSlots, chartSlotsWithSeries }
}
