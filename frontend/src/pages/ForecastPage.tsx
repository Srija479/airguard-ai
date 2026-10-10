import axios from 'axios'
import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import useLocation from '../hooks/useLocation'
import useProfile from '../hooks/useProfile'
import type { AqiCategory } from '../hooks/useAqi'
import { getAdviceKey } from '../lib/advice'

type ForecastPoint = { time: string; aqi: number; category: AqiCategory }
type ForecastMetrics = {
  test: Record<string, { mae: number; rmse: number }>
  test_start: string
  test_end: string
  selected_model: string
  beats_baseline: boolean
}
type ForecastResponse = {
  status: 'ready' | 'training' | 'not_ready'
  ai?: ForecastPoint[]
  atmospheric?: ForecastPoint[]
  observed?: ForecastPoint[]
  best_window?: { start: string; end: string } | null
  worst_window?: { start: string; end: string } | null
  metrics?: ForecastMetrics
}
type ChartPoint = {
  time: string
  observed: number | null
  ai: number | null
  atmospheric: number | null
}

const categoryColors: Record<AqiCategory, string> = {
  good: '#166534',
  satisfactory: '#4d6800',
  moderate: '#8a5b00',
  poor: '#b93815',
  veryPoor: '#a32245',
  severe: '#7f1d1d',
}

function timestamp(value: string) {
  return new Date(value).toLocaleString([], { weekday: 'short', hour: 'numeric' })
}

function buildChartData(data: ForecastResponse): ChartPoint[] {
  const points = new Map<string, ChartPoint>()
  for (const [key, values] of [
    ['observed', data.observed ?? []],
    ['ai', data.ai ?? []],
    ['atmospheric', data.atmospheric ?? []],
  ] as const) {
    for (const point of values) {
      const entry = points.get(point.time) ?? { time: point.time, observed: null, ai: null, atmospheric: null }
      entry[key] = point.aqi
      points.set(point.time, entry)
    }
  }
  return [...points.values()].sort((left, right) => left.time.localeCompare(right.time))
}

export default function ForecastPage() {
  const { t } = useTranslation()
  const { location } = useLocation()
  const { profile } = useProfile()
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [training, setTraining] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [selectedTimeline, setSelectedTimeline] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let interval = 0
    setLoading(true)
    setTraining(false)
    setError(false)
    setForecast(null)

    const params = { lat: location.lat, lon: location.lon }
    const fetchForecast = async () => {
      try {
        const { data } = await axios.get<ForecastResponse>('/api/forecast', { params })
        if (cancelled) return
        if (data.status === 'ready') {
          setForecast(data)
          setTraining(false)
          setLoading(false)
          if (interval) window.clearInterval(interval)
          return
        }
        if (data.status === 'training') {
          setTraining(true)
          setLoading(false)
          return
        }
        setForecast(null)
        setTraining(false)
        setError(true)
        setLoading(false)
        if (interval) window.clearInterval(interval)
      } catch {
        if (cancelled) return
        setError(true)
        setLoading(false)
        if (interval) window.clearInterval(interval)
      }
    }

    const pollStatus = async () => {
      try {
        const { data } = await axios.get<{ status: string }>('/api/forecast/status', { params })
        if (cancelled) return
        if (data.status === 'ready') await fetchForecast()
        else if (data.status === 'not_ready') await fetchForecast()
      } catch {
        if (!cancelled) {
          setError(true)
          setLoading(false)
          window.clearInterval(interval)
        }
      }
    }

    void fetchForecast()
    interval = window.setInterval(() => void pollStatus(), 5000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [location.lat, location.lon, retry])

  const aiPoints = forecast?.ai ?? []
  const groups: ForecastPoint[][] = []
  for (let index = 0; index < aiPoints.length; index += 3) {
    groups.push(aiPoints.slice(index, index + 3))
  }
  const timeline = groups.map((points) => {
    const average = points.reduce((sum, point) => sum + point.aqi, 0) / points.length
    const category = points[Math.floor(points.length / 2)]?.category ?? points[0].category
    const start = points[0].time
    const end = points.at(-1)?.time ?? start
    const inBest = Boolean(forecast?.best_window && start <= forecast.best_window.end && end >= forecast.best_window.start)
    const inWorst = Boolean(forecast?.worst_window && start <= forecast.worst_window.end && end >= forecast.worst_window.start)
    return { start, end, average, category, inBest, inWorst }
  })
  const chartData = forecast ? buildChartData(forecast) : []
  const firstHigh = aiPoints.find((point) => point.aqi >= 201)
  const lastHigh = firstHigh
    ? aiPoints.filter((point) => point.category === firstHigh.category).at(-1)
    : null
  const summary = firstHigh
    ? t('forecast.highSummary', { category: t(`aqi.${firstHigh.category}`), start: timestamp(firstHigh.time), end: lastHigh ? timestamp(lastHigh.time) : timestamp(firstHigh.time) })
    : t('forecast.steadySummary', { category: t(`aqi.${aiPoints[0]?.category ?? 'good'}`) })
  const adviceCategory = aiPoints[0]?.category

  if (loading || training) {
    return (
      <div className="max-w-4xl space-y-5" aria-busy="true">
        <h1 className="text-2xl font-semibold text-stone-950">{t('pages.forecast.title')}</h1>
        <p role="status" className="text-sm text-stone-700">{t('forecast.preparing', { city: location.name })}</p>
        <div className="space-y-3" aria-hidden="true">
          <div className="h-6 w-2/3 bg-stone-200" />
          <div className="h-32 w-full bg-stone-100" />
        </div>
      </div>
    )
  }

  if (error || !forecast || !forecast.metrics) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold text-stone-950">{t('pages.forecast.title')}</h1>
        <p role="alert" className="text-sm text-stone-700">{t('forecast.unavailable')}</p>
        <button type="button" onClick={() => setRetry((value) => value + 1)} className="min-h-12 px-2 text-sm font-semibold text-stone-900 underline underline-offset-4">
          {t('common.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold text-stone-950">{t('pages.forecast.title')}</h1>
      <p className="text-xs font-medium text-stone-600">{t('forecast.notMeasurement')}</p>
      <p className="text-lg font-semibold text-stone-950">{summary}</p>
      {adviceCategory && <p className="text-sm text-stone-700">{t(getAdviceKey(adviceCategory, profile))}</p>}

      <section aria-label={t('forecast.timelineLabel')} className="space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-700">
          <span>{t('forecast.bestWindow')}</span>
          <span>{t('forecast.worstWindow')}</span>
        </div>
        <div className="grid grid-cols-4 gap-1 sm:grid-cols-8 lg:grid-cols-16">
          {timeline.map((block) => (
            <button
              key={block.start}
              type="button"
              onClick={() => setSelectedTimeline(block.start)}
              title={`${timestamp(block.start)}: ${t(`aqi.${block.category}`)}`}
              aria-label={`${timestamp(block.start)}: ${t(`aqi.${block.category}`)}${block.inBest ? `, ${t('forecast.bestWindow')}` : ''}${block.inWorst ? `, ${t('forecast.worstWindow')}` : ''}`}
              className={`min-h-12 border px-1 text-[10px] font-medium text-white ${block.inBest ? 'ring-2 ring-stone-900' : ''} ${block.inWorst ? 'outline outline-2 outline-offset-1 outline-aqi-poor' : ''}`}
              style={{ backgroundColor: categoryColors[block.category] }}
            >
              {timestamp(block.start).split(', ').at(-1)}
            </button>
          ))}
        </div>
        {selectedTimeline && timeline.find((block) => block.start === selectedTimeline) && (
          <p role="status" className="text-sm text-stone-700">
            {t('forecast.timelineDetail', {
              time: timestamp(selectedTimeline),
              category: t(`aqi.${timeline.find((block) => block.start === selectedTimeline)?.category}`),
              aqi: Math.round(timeline.find((block) => block.start === selectedTimeline)?.average ?? 0),
            })}
          </p>
        )}
      </section>

      <section aria-label={t('forecast.chartLabel')} className="space-y-3">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-700">
          <span className="inline-flex items-center gap-2"><i className="h-0.5 w-6 bg-stone-800" />{t('forecast.observedLegend')}</span>
          <span className="inline-flex items-center gap-2"><i className="h-0 w-6 border-t-2 border-dashed border-brand-blue" />{t('forecast.aiLegend')}</span>
          <span className="inline-flex items-center gap-2"><i className="h-px w-6 bg-stone-400" />{t('forecast.atmosphericLegend')}</span>
        </div>
        <div role="img" aria-label={t('forecast.chartLabel')} className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#d6d3d1" />
              <XAxis dataKey="time" tickFormatter={(value: string) => value.slice(11, 16)} tick={{ fill: '#57534e', fontSize: 11 }} axisLine={{ stroke: '#a8a29e' }} tickLine={false} minTickGap={28} />
              <YAxis width={36} tick={{ fill: '#57534e', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={(value) => timestamp(String(value))} contentStyle={{ border: '1px solid #d6d3d1', borderRadius: 2, boxShadow: 'none' }} />
              <Line type="linear" dataKey="observed" name={t('forecast.observedLegend')} stroke="#292524" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
              <Line type="linear" dataKey="ai" name={t('forecast.aiLegend')} stroke="#1d4ed8" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} isAnimationActive={false} />
              <Line type="linear" dataKey="atmospheric" name={t('forecast.atmosphericLegend')} stroke="#a8a29e" strokeWidth={1} dot={false} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <details className="border-y border-stone-300">
        <summary className="flex min-h-12 cursor-pointer items-center py-3 font-semibold text-stone-900">{t('forecast.reliabilityTitle')}</summary>
        <div className="space-y-2 pb-4 text-sm text-stone-700">
          <p>{t('forecast.errorComparison', { model: forecast.metrics.test.model.mae.toFixed(1), baseline: forecast.metrics.test.persistence.mae.toFixed(1), start: forecast.metrics.test_start.slice(0, 10), end: forecast.metrics.test_end.slice(0, 10) })}</p>
          {!forecast.metrics.beats_baseline && <p>{t('forecast.doesNotBeat')}</p>}
          <p>{t('forecast.reliabilityNote')}</p>
        </div>
      </details>
    </div>
  )
}
